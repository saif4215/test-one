import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { reviseAction, returnToDraftAction, upgradeTemplateAction } from "@/app/actions/agreements";
import { ActionForm } from "@/components/agreements/ActionForm";
import { ClauseEditor, RemoveAttachment, SubmitReviewForm, UploadPanel } from "@/components/agreements/EditorParts";
import { STEP_SPECS } from "@/components/agreements/formSpecs";
import { LegalNotice, StatusPill, fmtStamp } from "@/components/agreements/parts";
import { StepForm } from "@/components/agreements/StepForm";
import { StepNav } from "@/components/agreements/StepNav";
import { Card, Notice, PageHeader } from "@/components/ui";
import { attorneyFlags } from "@/lib/agreements/readiness";
import { latestTemplate, listAttachments, loadAgreement, readiness } from "@/lib/agreements/repo";
import { actorFor, requireUser } from "@/lib/agreements/session";
import { STEPS, isStepKey, type StepKey } from "@/lib/agreements/steps";
import { CLAUSES } from "@/lib/agreements/template";
import { getDb } from "@/lib/db/client";

const SLICES: Record<string, string[]> = {
  buyer: ["buyer"],
  seller: ["seller"],
  business: ["business"],
  assets: ["assets"],
  price: ["price", "closing", "business"],
  terms: ["lease", "closing", "liabilities", "conditions", "permits", "employment", "terms", "additionalConditions"],
  submit: ["checkpoints"],
};

export default async function EditStep({ params }: PageProps<"/agreements/[id]/edit/[step]">) {
  const { id, step } = await params;
  const user = await requireUser();
  const db = getDb();
  const b = loadAgreement(db, actorFor(user), id);
  if (!b) notFound();
  if (step === "preview") redirect(`/agreements/${id}/preview`);
  const isClauses = step === "clauses";
  if (!isClauses && !isStepKey(step)) notFound();
  const key = (isClauses ? "terms" : step) as StepKey;

  const issues = readiness(db, b);
  const counts: Partial<Record<StepKey, number>> = {};
  for (const i of issues) counts[i.step] = (counts[i.step] ?? 0) + 1;
  const stepIdx = STEPS.findIndex((s) => s.key === key);
  const stepMeta = STEPS[stepIdx];
  const locked = !b.caps.edit || b.version.signaturesRequested || b.agreement.status === "cancelled";
  const stepIssues = issues.filter((i) => i.step === key);
  const latest = latestTemplate(db);

  return (
    <>
      <PageHeader
        title={isClauses ? "Legal wording (attorney review)" : `Step ${stepMeta.n}: ${stepMeta.label}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{b.agreement.id}</span><span>· version {b.version.versionNo}</span><StatusPill status={b.agreement.status} /></span>}
        actions={<Link href={`/agreements/${id}`} className="btn btn-secondary btn-sm">Details</Link>}
      />
      <StepNav agreementId={id} current={isClauses ? "clauses" : key} issueCounts={counts} />

      {b.version.signaturesRequested && (
        <div className="mb-5 space-y-2 rounded-lg border border-border bg-surface p-4">
          <Notice tone="warn" title="This version is locked.">Signatures were requested for version {b.version.versionNo}, so it can&apos;t be edited. To change a term, create a revision. The pending signature request is withdrawn and everyone must review and sign the new version.</Notice>
          {b.caps.edit && b.agreement.status !== "cancelled" && (
            <ActionForm action={reviseAction} fields={{ agreementId: id }} label="Create revision" className="btn btn-sm" inline confirm="Create a new version? Any open signing links stop working and every party will need to sign the revised version.">
              <input name="summary" required placeholder="What is changing?" aria-label="What is changing" className="input !w-72" />
            </ActionForm>
          )}
        </div>
      )}
      {!b.caps.edit && <div className="mb-5"><Notice tone="info">You have view-only access to this agreement.</Notice></div>}
      {b.agreement.status === "awaiting_review" && !locked && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
          <span>This agreement was submitted for review. Saving any change returns it to Draft.</span>
          <ActionForm action={returnToDraftAction} fields={{ agreementId: id }} label="Return to draft" />
        </div>
      )}

      {stepIssues.length > 0 && !isClauses && step !== "documents" && (
        <details className="mb-5 rounded-lg border border-border bg-surface p-3 text-sm" open={stepIssues.length <= 6}>
          <summary className="cursor-pointer font-medium text-warn">{stepIssues.length} item{stepIssues.length === 1 ? "" : "s"} to complete before this can be submitted</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">{stepIssues.map((i) => <li key={i.message}>{i.message}</li>)}</ul>
        </details>
      )}

      {isClauses ? (
        <>
          <p className="mb-4 text-sm text-muted">Edit the wording of any clause for this agreement only. The master template is not changed. Tokens like <code>{"{{purchasePrice}}"}</code> are filled from your answers; leave them in place.</p>
          <ClauseEditor
            agreementId={id}
            clauses={CLAUSES.map((c) => ({ key: c.key, section: c.section, title: c.title }))}
            overrides={b.data.clauseOverrides}
            templateText={b.version.templateSnapshot}
            locked={locked}
          />
          {latest && latest.id !== b.version.templateId && !locked && (
            <div className="mt-6"><Notice tone="info">A newer master template exists (version {latest.versionNo}). This agreement uses the wording it was created with. <ActionForm action={upgradeTemplateAction} fields={{ agreementId: id }} label="Use latest template wording" /></Notice></div>
          )}
        </>
      ) : step === "documents" ? (
        <DocumentsStep id={id} locked={locked} refIds={b.version.attachmentRefs.map((r) => r.id)} />
      ) : (
        <>
          {step === "submit" && <SubmitStep id={id} issueCount={issues.length} issues={issues.filter((i) => i.step !== "submit").map((i) => `${STEPS.find((s) => s.key === i.step)?.label}: ${i.message}`)} flags={attorneyFlags(b.data)} locked={locked} status={b.agreement.status} />}
          {step === "terms" && (
            <p className="mb-4 text-sm text-muted">
              Attorneys can customize the exact legal wording of every section in <Link href={`/agreements/${id}/edit/clauses`} className="underline">Legal wording</Link>.
            </p>
          )}
          <StepForm
            agreementId={id}
            step={step}
            sections={STEP_SPECS[step]}
            initial={Object.fromEntries((SLICES[step] ?? []).map((k) => [k, (b.data as unknown as Record<string, unknown>)[k]]))}
            prevHref={stepIdx > 0 ? `/agreements/${id}/edit/${STEPS[stepIdx - 1].key}` : undefined}
            locked={locked}
            finalLabel={step === "submit" ? "Save checkpoints" : step === "terms" ? "Save and continue to documents →" : undefined}
          />
        </>
      )}
      <div className="mt-8"><LegalNotice /></div>
      <p className="mt-3 text-xs text-muted">Last updated {fmtStamp(b.agreement.updatedAt)}.</p>
    </>
  );
}

function DocumentsStep({ id, locked, refIds }: { id: string; locked: boolean; refIds: string[] }) {
  const refs = new Set(refIds);
  const files = listAttachments(getDb(), id).filter((a) => refs.has(a.id));
  return (
    <div className="space-y-6">
      <Card title="Schedules generated for you">
        <p className="text-sm text-muted">Schedules A (included assets), B (excluded assets), C (inventory and equipment), D (assumed liabilities), E (lease and premises), F (payment schedule) and G (additional conditions) are generated automatically from your answers. Attach supporting evidence here, such as an inventory document, equipment photos, a lease, or proof of authority.</p>
      </Card>
      <UploadPanel agreementId={id} disabled={locked} />
      <Card title={`Attached to this version (${files.length})`}>
        {files.length === 0 ? (
          <p className="text-sm text-muted">No files attached.</p>
        ) : (
          <ul className="divide-y divide-border">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <a className="font-medium underline" href={`/agreements/${id}/attachments/${f.id}`}>{f.fileName}</a>
                  <div className="text-xs text-muted">{f.schedule ? `Schedule ${f.schedule}` : "General"} · {f.kind} · {(f.size / 1024).toFixed(0)} KB · SHA-256 {f.sha256.slice(0, 12)}…</div>
                </div>
                <RemoveAttachment agreementId={id} attachmentId={f.id} disabled={locked} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="flex gap-2">
        <Link className="btn btn-secondary" href={`/agreements/${id}/edit/terms`}>← Back</Link>
        <Link className="btn" href={`/agreements/${id}/preview`}>Continue to preview →</Link>
      </div>
    </div>
  );
}

function SubmitStep({ id, issueCount, issues, flags, locked, status }: { id: string; issueCount: number; issues: string[]; flags: string[]; locked: boolean; status: string }) {
  return (
    <div className="mb-6 space-y-5">
      <Card title="Attorney review flags">
        <p className="mb-2 text-sm text-muted">Points to raise with your New York attorney. These are prompts, not legal conclusions.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
      </Card>
      <Card title="Ready to submit?">
        {status === "awaiting_review" ? (
          <Notice tone="good">Submitted for review. Next: <Link href={`/agreements/${id}/send`} className="underline">send it for signature</Link>.</Notice>
        ) : issueCount > 0 ? (
          <>
            <Notice tone="warn">{issueCount} item{issueCount === 1 ? "" : "s"} still need attention. Save the checkpoints below, then fix:</Notice>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{issues.slice(0, 15).map((m) => <li key={m}>{m}</li>)}{issues.length > 15 && <li>…and {issues.length - 15} more</li>}</ul>
          </>
        ) : (
          <Notice tone="good">Everything required is filled in.</Notice>
        )}
        {status === "draft" && !locked && (
          <div className="mt-4">
            <Link href={`/agreements/${id}/preview`} className="mb-3 inline-block text-sm underline">Open the full preview</Link>
            <SubmitReviewForm agreementId={id} blocked={issueCount > 0} />
          </div>
        )}
      </Card>
    </div>
  );
}
