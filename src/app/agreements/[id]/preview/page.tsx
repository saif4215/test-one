import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractView } from "@/components/agreements/ContractView";
import { LegalNotice, StatusPill } from "@/components/agreements/parts";
import { SubmitReviewForm } from "@/components/agreements/EditorParts";
import { QuickNav } from "@/components/agreements/QuickNav";
import { StepNav } from "@/components/agreements/StepNav";
import { Notice, PageHeader } from "@/components/ui";
import { attorneyFlags } from "@/lib/agreements/readiness";
import { documentForVersion, listVersions, loadAgreement, readiness, versionData } from "@/lib/agreements/repo";
import { actorFor, requireUser } from "@/lib/agreements/session";
import { currentSigners } from "@/lib/agreements/signing";
import type { IssueStep } from "@/lib/agreements/steps";
import { getDb } from "@/lib/db/client";

export default async function PreviewPage({ params, searchParams }: PageProps<"/agreements/[id]/preview">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const b = loadAgreement(db, actorFor(user), id);
  if (!b) notFound();
  const versions = listVersions(db, id);
  const wanted = Number(typeof sp.version === "string" ? sp.version : b.version.versionNo);
  const version = versions.find((v) => v.versionNo === wanted) ?? b.version;
  const isCurrent = version.id === b.version.id;
  const doc = documentForVersion(db, b.agreement, version, { draft: true });
  const issues = isCurrent ? readiness(db, b) : [];
  const counts: Partial<Record<IssueStep, number>> = {};
  for (const i of issues) counts[i.step] = (counts[i.step] ?? 0) + 1;
  const { request } = currentSigners(db, id);
  const signedReady = !!request && request.status === "completed" && !!request.signedAttachmentId;
  const certReady = signedReady && !!request?.certificateAttachmentId;
  const p = `/agreements/${id}/pdf`;

  return (
    <>
      <PageHeader
        title="Preview agreement"
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{id}</span><span>· version {version.versionNo}{isCurrent ? " (current)" : ""}</span><StatusPill status={b.agreement.status} /></span>}
        actions={
          <>
            <a className="btn btn-secondary btn-sm" href={`${p}?kind=draft&inline=1&version=${version.versionNo}`} target="_blank" rel="noopener">Preview PDF</a>
            <a className="btn btn-secondary btn-sm" href={`${p}?kind=draft&version=${version.versionNo}`}>Download Draft PDF</a>
            {signedReady && <a className="btn btn-sm" href={`${p}?kind=signed`}>Download Signed Agreement</a>}
            {certReady && <a className="btn btn-secondary btn-sm" href={`${p}?kind=certificate`}>Download Signing Certificate</a>}
          </>
        }
      />
      {b.data.mode === "quick" ? <QuickNav agreementId={id} current="check" issueCount={issues.length} /> : <StepNav agreementId={id} current="preview" issueCounts={counts} />}
      {versions.length > 1 && (
        <nav aria-label="Versions" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Version:</span>
          {versions.map((v) => (
            <Link key={v.id} href={`/agreements/${id}/preview?version=${v.versionNo}`} className={`btn btn-sm ${v.id === version.id ? "" : "btn-secondary"}`}>v{v.versionNo}</Link>
          ))}
        </nav>
      )}
      <div className="mb-4 space-y-3">
        {!signedReady && <Notice tone="warn" title="Draft / unsigned.">This is a preview. It is not signed, and nothing here is binding until the e-signature service confirms every party has signed. PDFs downloaded from this page are marked DRAFT.</Notice>}
        {isCurrent && issues.length > 0 && (
          <Notice tone="warn" title={`${issues.length} item${issues.length === 1 ? "" : "s"} still open.`}>
            Highlighted <mark className="tbc">[TO BE COMPLETED]</mark> text and the steps marked “!” above need attention before submitting.
          </Notice>
        )}
        <details className="rounded-md border border-border bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium">Points worth double-checking</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">{attorneyFlags(versionData(version)).map((f) => <li key={f}>{f}</li>)}</ul>
        </details>
      </div>
      <ContractView doc={doc} />
      {b.data.mode === "quick" ? (
        <div className="no-print mt-6 space-y-3 rounded-lg border border-border bg-surface p-4">
          <Link href={`/agreements/${id}/edit`} className="btn btn-secondary">← Change something</Link>
          {isCurrent && b.agreement.status === "draft" && b.caps.edit && !b.version.signaturesRequested && (
            <>
              <h2 className="text-base font-semibold">Happy with it?</h2>
              <SubmitReviewForm agreementId={id} blocked={issues.length > 0} />
              {issues.length > 0 && <p className="text-sm text-bad">Fix these first: {issues.slice(0, 3).map((i) => i.message).join(" ")}{issues.length > 3 ? ` (and ${issues.length - 3} more)` : ""}</p>}
            </>
          )}
          {isCurrent && b.agreement.status === "awaiting_review" && <Link href={`/agreements/${id}/send`} className="btn ml-2">Continue to send →</Link>}
        </div>
      ) : (
        <div className="no-print mt-6 flex flex-wrap gap-2">
          <Link href={`/agreements/${id}/edit/terms`} className="btn btn-secondary">← Edit</Link>
          <Link href={`/agreements/${id}/edit/submit`} className="btn">Continue to Step 9: Confirm and submit →</Link>
        </div>
      )}
      <div className="mt-6"><LegalNotice /></div>
    </>
  );
}
