import { ContractView } from "@/components/agreements/ContractView";
import { LegalNotice, fmtStamp, maskEmail } from "@/components/agreements/parts";
import { ConsentForm, DeclineForm, IdentityGate } from "@/components/agreements/SignerForms";
import { Notice } from "@/components/ui";
import { recordEvent } from "@/lib/agreements/audit";
import { CONSENT_STATEMENT, ESIGN_DISCLOSURE, REVIEW_STATEMENT } from "@/lib/agreements/consent";
import { documentForVersion } from "@/lib/agreements/repo";
import { rateLimit } from "@/lib/agreements/security";
import { getSignerCookie } from "@/lib/agreements/session";
import { resolveToken, signerSessionValid, signersFor } from "@/lib/agreements/signing";
import { PARTY_LABEL } from "@/lib/agreements/status";
import { getDb } from "@/lib/db/client";

const DEAD: Record<string, string> = {
  invalid: "This link isn't valid. Please use the most recent email you were sent, or ask the sender for a new invitation.",
  revoked: "The sender closed this link. If you still need to sign, ask them for a new invitation.",
  expired: "This link has expired. Ask the sender for a new invitation.",
  cancelled: "This agreement was cancelled, so there is nothing to sign.",
  superseded: "This agreement was revised after your invitation was sent. This link can't be used; you'll receive a new invitation for the revised version.",
  declined: "This signing request was closed because a party declined to sign.",
};

export default async function SignPage({ params, searchParams }: PageProps<"/sign/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const db = getDb();
  const view = resolveToken(db, token);
  if (view.state !== "ok" || !view.sig || !view.request || !view.agreement || !view.version) {
    return <Notice tone="warn" title="This link can't be used.">{DEAD[view.state] ?? DEAD.invalid}</Notice>;
  }
  const { sig, request, agreement, version } = view;
  const cookie = await getSignerCookie();
  const verified = signerSessionValid(sig, cookie);
  const party = PARTY_LABEL[sig.party as "buyer" | "seller"];
  const head = (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">Maruf Cafe — Business Purchase and Sale Agreement</h1>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2"><dt className="text-muted">Agreement ID</dt><dd className="font-mono">{agreement.id}</dd></div>
        <div className="flex gap-2"><dt className="text-muted">Document version</dt><dd>{version.versionNo}</dd></div>
        <div className="flex gap-2"><dt className="text-muted">Signing as</dt><dd>{party}</dd></div>
        <div className="flex gap-2"><dt className="text-muted">Signer</dt><dd>{sig.name} &lt;{sig.email}&gt;</dd></div>
      </dl>
    </div>
  );

  if (!verified) return <>{head}<IdentityGate token={token} maskedEmail={maskEmail(sig.email)} /><div className="mt-6"><LegalNotice /></div></>;

  if (rateLimit(`page-open:${sig.id}`, 1, 10 * 60 * 1000).ok) {
    recordEvent(db, { agreementId: agreement.id, versionId: version.id, type: "signing.page_opened", actorType: "signer", actorRef: sig.id, metadata: { party: sig.party, note: "Recorded by this application when the verified signer opened the page." } });
  }

  const completed = request.status === "completed";
  const others = signersFor(db, request.id).filter((s) => s.id !== sig.id);
  const base = `/sign/${token}/pdf`;

  if (completed) {
    return (
      <>
        {head}
        {request.signedAttachmentId ? (
          <Notice tone="good" title="Fully signed.">The e-signature service confirmed that every party signed this version{request.completedAt ? ` (${fmtStamp(request.completedAt)})` : ""}. Keep a copy of your own.</Notice>
        ) : (
          <Notice tone="warn" title="Completed, copy not ready yet.">The e-signature service confirmed completion; the signed PDF is still being retrieved. Check back soon.</Notice>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {request.signedAttachmentId && <a className="btn" href={`${base}?kind=signed`}>Download signed agreement</a>}
          {request.certificateAttachmentId && <a className="btn btn-secondary" href={`${base}?kind=certificate`}>Download signing certificate</a>}
        </div>
      </>
    );
  }

  if (sig.status === "signed") {
    return (
      <>
        {head}
        <Notice tone="good" title="Your signature is confirmed.">The e-signature service has confirmed your signature{sig.providerSignedAt ? ` (${fmtStamp(sig.providerSignedAt)})` : ""}. The agreement is <strong>not fully signed</strong> until {others.map((o) => PARTY_LABEL[o.party as "buyer" | "seller"]).join(" and ") || "everyone else"} signs too. You&apos;ll get an email when it is.</Notice>
        <p className="mt-4"><a className="underline" href={`${base}?kind=sent`}>Download the document you signed (PDF)</a></p>
      </>
    );
  }

  if (sig.status === "pending") {
    return <>{head}<Notice tone="info" title="Not your turn yet.">The other party signs first. You&apos;ll receive an email with your link when it&apos;s your turn.</Notice></>;
  }

  const doc = documentForVersion(db, agreement, version, { draft: false });
  return (
    <>
      {head}
      {sp.returned && (
        <div className="mb-4"><Notice tone="warn" title="Not confirmed yet.">We haven&apos;t received confirmation from the e-signature service that you signed. If you finished signing, wait a minute and reload this page. If you left without finishing, you can start again below.</Notice></div>
      )}
      <div className="mb-4 space-y-2">
        <Notice tone="info" title="Please read the whole agreement below.">This is the exact document you will sign (fingerprint <span className="font-mono">{request.sentDocumentHash.slice(0, 16)}…</span>). <a className="underline" href={`${base}?kind=sent`}>Download it as a PDF</a>. Read it carefully; you may ask an attorney to look at it first if you wish.</Notice>
      </div>
      <div className="max-h-[70vh] overflow-y-auto rounded-lg" tabIndex={0} aria-label="Agreement text, scrollable">
        <ContractView doc={doc} />
      </div>
      <div className="mt-6 space-y-4">
        <ConsentForm token={token} esignParagraphs={ESIGN_DISCLOSURE} reviewText={REVIEW_STATEMENT} consentText={CONSENT_STATEMENT} />
        <DeclineForm token={token} />
        <LegalNotice />
      </div>
    </>
  );
}
