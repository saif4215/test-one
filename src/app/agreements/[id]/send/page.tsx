import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalNotice, StatusPill } from "@/components/agreements/parts";
import { QuickNav } from "@/components/agreements/QuickNav";
import { SendForm } from "@/components/agreements/SendForm";
import { Card, Notice, PageHeader } from "@/components/ui";
import { integrationStatus } from "@/lib/agreements/config";
import { loadAgreement, readiness } from "@/lib/agreements/repo";
import { actorFor, requireUser } from "@/lib/agreements/session";
import { getSettings } from "@/lib/agreements/settings";
import { getDb } from "@/lib/db/client";

export default async function SendPage({ params }: PageProps<"/agreements/[id]/send">) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDb();
  const b = loadAgreement(db, actorFor(user), id);
  if (!b) notFound();
  const issues = readiness(db, b);
  const cfg = integrationStatus();
  const settings = getSettings(db);
  const canSendNow = b.caps.send && b.agreement.status === "awaiting_review" && !b.version.signaturesRequested && issues.length === 0 && cfg.signature.configured && cfg.email.configured && cfg.appUrlOk && cfg.appSecretOk;
  const name = (k: "buyer" | "seller") => (b.data[k].signingCapacity === "entity_representative" && b.data[k].repName ? b.data[k].repName : b.data[k].legalName) || k;

  return (
    <>
      <PageHeader title="Send for signature" subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{id}</span><span>· version {b.version.versionNo}</span><StatusPill status={b.agreement.status} /></span>} />
      {b.data.mode === "quick" && <QuickNav agreementId={id} current="send" issueCount={issues.length} />}
      <div className="space-y-5">
        {!b.caps.send && <Notice tone="bad">You don&apos;t have permission to send this agreement.</Notice>}
        {b.agreement.status !== "awaiting_review" && (
          <Notice tone="warn">
            {b.agreement.status === "draft" ? <>This agreement hasn&apos;t been submitted for review. <Link className="underline" href={`/agreements/${id}/edit/submit`}>Go to Step 9</Link>.</> : <>Status is “{b.agreement.status.replace(/_/g, " ")}”, so it can&apos;t be sent now. <Link className="underline" href={`/agreements/${id}`}>See details</Link>.</>}
          </Notice>
        )}
        {issues.length > 0 && b.agreement.status === "awaiting_review" && <Notice tone="bad" title="Not ready:">{issues[0].message} ({issues.length} open item{issues.length === 1 ? "" : "s"})</Notice>}

        <Card title="Who will be asked to sign">
          <ul className="space-y-2 text-sm">
            {(["buyer", "seller"] as const).map((k) => (
              <li key={k}><span className="inline-block w-16 font-semibold capitalize">{k}</span>{name(k)} <span className="text-muted">&lt;{b.data[k].email || "no email"}&gt;</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Each signer gets a private link by email, confirms their email with a one-time code, reviews the whole agreement, gives e-signature consent, and then signs on the e-signature service&apos;s page.</p>
        </Card>

        <Card title="Service status">
          <ul className="space-y-2 text-sm">
            <li><span className={cfg.signature.configured ? "text-good" : "text-bad"}>{cfg.signature.configured ? "●" : "○"}</span> E-signature service ({cfg.signature.provider}, {cfg.signature.environment}) {cfg.signature.configured ? "credentials present" : `not configured, missing: ${cfg.signature.missing.join(", ")}`}</li>
            <li><span className={cfg.email.configured ? "text-good" : "text-bad"}>{cfg.email.configured ? "●" : "○"}</span> Email service ({cfg.email.provider}) {cfg.email.configured ? "credentials present" : `not configured, missing: ${cfg.email.missing.join(", ")}`}</li>
            {!cfg.appUrlOk && <li><span className="text-bad">○</span> APP_URL is not set, so links in emails can&apos;t be built.</li>}
            {!cfg.appSecretOk && <li><span className="text-bad">○</span> APP_SECRET (16+ characters) is not set.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted">“Credentials present” means the settings exist. It doesn&apos;t prove they work; that is only known when a request succeeds. Sending is blocked until everything above is configured. See docs/AGREEMENTS.md.</p>
        </Card>

        <Card title="Options">
          <SendForm agreementId={id} defaultDays={settings.defaultExpiryDays} disabled={!canSendNow} buyerName={name("buyer")} sellerName={name("seller")} />
        </Card>
        <LegalNotice />
      </div>
    </>
  );
}
