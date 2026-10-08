import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelAction, refreshStatusAction, resendAction, reviseAction, revokeAccessAction, revokeAction } from "@/app/actions/agreements";
import { ActionForm } from "@/components/agreements/ActionForm";
import { ParticipantForm } from "@/components/agreements/ParticipantForm";
import { LegalNotice, StatusPill, fmtDate, fmtStamp } from "@/components/agreements/parts";
import { Card, Notice, PageHeader, Pill, TableWrap } from "@/components/ui";
import { listEvents, verifyChain } from "@/lib/agreements/audit";
import { formatMoney } from "@/lib/agreements/money";
import { listEmails, EMAIL_STATUS_LABEL } from "@/lib/agreements/notify";
import { listAttachments, listParticipants, listVersions, loadAgreement } from "@/lib/agreements/repo";
import { actorFor, requireUser } from "@/lib/agreements/session";
import { PARTY_LABEL } from "@/lib/agreements/status";
import { currentSigners, requestsFor, signersFor } from "@/lib/agreements/signing";
import { getDb } from "@/lib/db/client";
import { signatures, users } from "@/lib/db/schema";

const EVENT_LABEL: Record<string, string> = {
  "agreement.created": "Agreement created",
  "agreement.updated": "Agreement edited",
  "agreement.submitted_for_review": "Submitted for review",
  "agreement.returned_to_draft": "Returned to draft",
  "agreement.template_upgraded": "Template wording updated",
  "agreement.cancelled": "Agreement cancelled",
  "agreement.access_granted": "Access granted",
  "agreement.access_revoked": "Access removed",
  "version.created": "New version created",
  "attachment.uploaded": "Attachment uploaded",
  "attachment.removed": "Attachment removed",
  "pdf.generated": "Draft PDF generated",
  "pdf.downloaded": "PDF downloaded",
  "document.sent_copy_saved": "Signing copy stored (hashed)",
  "signature.requested": "Signature requested at the e-signature service",
  "signature.request_failed": "E-signature service rejected the request",
  "invitation.email_accepted": "Invitation email accepted by email service",
  "invitation.email_failed": "Invitation email failed",
  "invitation.delivery_confirmed": "Invitation delivery confirmed by email service",
  "invitation.delivery_failed": "Invitation bounced or failed (reported by email service)",
  "invitation.resent": "Invitation re-sent with a new link",
  "invitation.revoked": "Invitation link revoked",
  "signing.identity_code_sent": "Verification code requested",
  "signing.identity_verified": "Signer verified by email code",
  "signing.identity_failed": "Wrong verification code",
  "signing.consent_recorded": "E-signature consent recorded",
  "signing.session_started": "Signing session opened at e-signature service",
  "signer.viewed": "Viewed (reported by e-signature service)",
  "signer.signed": "Signature confirmed by e-signature service",
  "signer.declined": "Declined to sign",
  "request.superseded": "Signature request withdrawn (superseded)",
  "request.expired": "Signature request expired",
  "request.cancelled": "Signature request cancelled",
  "request.completed": "All signatures complete",
  "request.verified_with_provider": "Completion verified with e-signature service",
  "request.voided_at_provider": "Envelope voided at e-signature service",
  "request.void_failed": "Could not void envelope at e-signature service (will retry)",
  "completion.documents_saved": "Signed PDF and certificate stored",
  "completion.documents_failed": "Could not retrieve signed documents (will retry)",
  "notification.sent": "Notification email accepted",
  "notification.failed": "Notification email failed",
  "template.updated": "Master template updated",
};

/** Viewers without send rights don't see the other parties' IP addresses or email addresses. */
function visibleMeta(meta: Record<string, unknown>, staff: boolean): Record<string, unknown> {
  if (staff) return meta;
  return Object.fromEntries(Object.entries(meta).filter(([k]) => !["ip", "userAgent", "to", "email", "authMethod", "documentHash", "consentTextSha256"].includes(k)));
}

export default async function AgreementDetails({ params, searchParams }: PageProps<"/agreements/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const actor = actorFor(user);
  const b = loadAgreement(db, actor, id);
  if (!b) notFound();
  const { request, signers } = currentSigners(db, id);
  const events = listEvents(db, id);
  const chain = verifyChain(db, id);
  const versions = listVersions(db, id);
  const emails = listEmails(db, id);
  const participants = listParticipants(db, id);
  const files = listAttachments(db, id);
  const requests = requestsFor(db, id);
  const nameOf = new Map(db.select().from(users).all().map((u) => [u.id, u.name]));
  const sigName = new Map(db.select().from(signatures).all().filter((s) => s.agreementId === id).map((s) => [s.id, `${PARTY_LABEL[s.party as "buyer" | "seller"]} (signer)`]));
  const canRevise = b.caps.edit && b.version.signaturesRequested && b.agreement.status !== "cancelled";
  const open = request?.status === "active";
  const signedDocs = requests.find((r) => r.status === "completed" && r.signedAttachmentId);
  const staff = b.caps.send;

  return (
    <>
      <PageHeader
        title={b.agreement.id}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusPill status={b.agreement.status} /><span>version {b.version.versionNo}{b.data.mode === "quick" ? " · quick agreement" : ""}</span><span>· created {fmtDate(b.agreement.createdAt)}</span></span>}
        actions={
          <>
            <Link className="btn btn-secondary btn-sm" href={`/agreements/${id}/preview`}>Preview</Link>
            {b.caps.edit && ["draft", "awaiting_review"].includes(b.agreement.status) && <Link className="btn btn-secondary btn-sm" href={`/agreements/${id}/edit`}>Edit</Link>}
            {staff && b.agreement.status === "awaiting_review" && <Link className="btn btn-sm" href={`/agreements/${id}/send`}>Send for signature</Link>}
            {signedDocs && <a className="btn btn-sm" href={`/agreements/${id}/pdf?kind=signed`}>Download Signed Agreement</a>}
            {signedDocs?.certificateAttachmentId && <a className="btn btn-secondary btn-sm" href={`/agreements/${id}/pdf?kind=certificate`}>Download Signing Certificate</a>}
          </>
        }
      />
      <div className="space-y-5">
        {sp.sent && <Notice tone="good" title="Signature request created.">The e-signature service accepted the document.{sp.mailfail ? " However, at least one invitation email could not be sent; see the Emails table below and use “Resend”." : " Invitation emails were accepted by the email service; delivery is confirmed separately below."}</Notice>}
        {b.agreement.status === "fully_signed" && <Notice tone="good" title="Fully signed.">The e-signature service has confirmed that every party signed version {b.agreement.currentVersionNo}.</Notice>}
        {request?.status === "completed" && !request.signedAttachmentId && <Notice tone="warn">The e-signature service reports completion, but the signed PDF has not been retrieved yet. It will be retried automatically.</Notice>}
        {request?.lastProviderStatus === "void_failed" && <Notice tone="warn">The closed request could not be voided at the e-signature service yet. Our signing links are already disabled; the void will be retried.</Notice>}

        <Card title="Summary">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Buyer", b.agreement.buyerName || "—"],
              ["Seller", b.agreement.sellerName || "—"],
              ["Business", b.agreement.businessName],
              ["Purchase price", formatMoney(b.agreement.purchasePrice) ?? "—"],
              ["Effective date", fmtDate(b.agreement.effectiveDate)],
              ["Expected closing", fmtDate(b.agreement.closingDate)],
              ["Last updated", fmtStamp(b.agreement.lastActivityAt)],
              ["Document fingerprint (SHA-256)", b.version.documentHash ? b.version.documentHash.slice(0, 16) + "…" : "Not yet sent"],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="num break-words">{v}</dd></div>
            ))}
          </dl>
        </Card>

        <Card
          title="Signatures"
          actions={
            <div className="flex flex-wrap gap-2">
              {open && <ActionForm action={refreshStatusAction} fields={{ agreementId: id }} label="Check status with e-signature service" />}
              {canRevise && (
                <details>
                  <summary className="btn btn-secondary btn-sm cursor-pointer list-none">Create revision</summary>
                  <div className="mt-2">
                    <ActionForm action={reviseAction} fields={{ agreementId: id }} label="Create revision" className="btn btn-sm" confirm="Create a new version? Open signing links stop working and every party must sign the revised version.">
                      <input name="summary" required placeholder="What is changing?" aria-label="What is changing" className="input !w-64" />
                    </ActionForm>
                  </div>
                </details>
              )}
            </div>
          }
        >
          {!request ? (
            <p className="text-sm text-muted">No signature request has been made yet.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Request for version {versions.find((v) => v.id === request.versionId)?.versionNo ?? "?"} · {request.signingOrder.replace(/_/g, " ")} · {request.provider} envelope <span className="font-mono">{request.providerEnvelopeId ?? "—"}</span> · {request.status === "active" ? `links expire ${fmtStamp(request.expiresAt)}` : `request ${request.status}`}
                {request.providerVerifiedAt && ` · completion verified ${fmtStamp(request.providerVerifiedAt)}`}
              </p>
              <TableWrap>
                <table className="data">
                  <thead><tr><th>Party</th><th>Signer</th><th>Status</th><th>Invited</th><th>Viewed*</th><th>Signed*</th>{staff && open && <th>Link</th>}</tr></thead>
                  <tbody>
                    {signers.map((s) => (
                      <tr key={s.id}>
                        <td>{PARTY_LABEL[s.party as "buyer" | "seller"]}</td>
                        <td>{s.name}<div className="text-xs text-muted">{s.email}</div></td>
                        <td><Pill tone={s.status === "signed" ? "good" : s.status === "declined" ? "bad" : s.status === "pending" ? "neutral" : "info"}>{s.status === "pending" ? "Waiting (not their turn)" : s.status}</Pill></td>
                        <td className="text-xs">{fmtStamp(s.invitedAt)}</td>
                        <td className="text-xs">{fmtStamp(s.viewedAt)}</td>
                        <td className="text-xs">{fmtStamp(s.providerSignedAt ?? s.signedAt)}</td>
                        {staff && open && (
                          <td>
                            {s.status !== "signed" && s.status !== "pending" && (
                              <div className="flex flex-wrap gap-1">
                                <ActionForm action={resendAction} fields={{ signatureId: s.id, agreementId: id }} label="Resend" />
                                {!s.tokenRevokedAt && <ActionForm action={revokeAction} fields={{ signatureId: s.id, agreementId: id }} label="Revoke link" className="btn btn-danger btn-sm" confirm="Revoke this signing link?" />}
                              </div>
                            )}
                            {s.tokenRevokedAt && <span className="text-xs text-bad">Link revoked</span>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <p className="mt-2 text-xs text-muted">* “Viewed” and “Signed” are shown only after the e-signature service reports them.</p>
              {staff && signers.some((s) => s.consent) && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium">Consent and identity evidence we recorded</summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {signersFor(db, request.id).filter((s) => s.consent).map((s) => (
                      <li key={s.id}>{PARTY_LABEL[s.party as "buyer" | "seller"]}: consented {fmtStamp(s.consent!.acceptedAt)}, verified by email code {fmtStamp(s.consent!.authVerifiedAt)}, consent text v{s.consent!.consentVersion}, document {s.consent!.documentHash.slice(0, 12)}…, IP {s.consent!.ip ?? "unknown"}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {requests.length > 1 && <p className="mt-3 text-xs text-muted">Earlier requests: {requests.slice(1).map((r) => `v${versions.find((v) => v.id === r.versionId)?.versionNo} ${r.status}`).join(", ")}</p>}
        </Card>

        {staff && emails.length > 0 && (
          <Card title="Emails">
            <TableWrap>
              <table className="data">
                <thead><tr><th>When</th><th>To</th><th>Message</th><th>Status</th></tr></thead>
                <tbody>
                  {emails.map((e) => (
                    <tr key={e.id}>
                      <td className="text-xs">{fmtStamp(e.createdAt)}</td>
                      <td className="text-xs">{e.toEmail}</td>
                      <td className="text-xs">{e.kind.replace(/_/g, " ")}</td>
                      <td className="text-xs"><span className={e.status === "failed" || e.status === "bounced" || e.status === "complained" ? "text-bad" : e.status === "delivered" ? "text-good" : ""}>{EMAIL_STATUS_LABEL[e.status] ?? e.status}</span>{e.error && <div className="text-bad">{e.error}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Versions">
            <ul className="space-y-2 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <Link href={`/agreements/${id}/preview?version=${v.versionNo}`} className="font-medium underline">Version {v.versionNo}</Link>
                    <span className="ml-2 text-xs text-muted">{fmtStamp(v.createdAt)} · {v.changeSummary || "—"}</span>
                  </span>
                  <span className="text-xs text-muted">{v.id === b.agreement.signedVersionId ? "Signed" : v.signaturesRequested ? (v.supersededAt ? "Superseded" : "Sent for signature") : "Draft"}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Attachments">
            {files.length === 0 && !signedDocs ? <p className="text-sm text-muted">None.</p> : (
              <ul className="space-y-1 text-sm">
                {files.map((f) => (
                  <li key={f.id}><a className="underline" href={`/agreements/${id}/attachments/${f.id}`}>{f.fileName}</a> <span className="text-xs text-muted">{f.schedule ? `Schedule ${f.schedule}` : "General"}</span></li>
                ))}
                {signedDocs && <li><a className="underline" href={`/agreements/${id}/pdf?kind=signed`}>Signed agreement (PDF)</a> <span className="text-xs text-muted">from the e-signature service</span></li>}
                {signedDocs?.certificateAttachmentId && <li><a className="underline" href={`/agreements/${id}/pdf?kind=certificate`}>Signing certificate (PDF)</a></li>}
              </ul>
            )}
          </Card>
        </div>

        <Card title="People with access">
          <ul className="mb-3 space-y-1 text-sm">
            {participants.length === 0 && <li className="text-muted">Only administrators.</li>}
            {participants.map((p) => (
              <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2">
                <span>{p.name} <span className="text-xs text-muted">{p.email} · {p.level}{p.party ? ` · ${p.party}` : ""}</span></span>
                {b.caps.manageAccess && p.level !== "owner" && <ActionForm action={revokeAccessAction} fields={{ agreementId: id, userId: p.userId }} label="Remove" className="btn btn-danger btn-sm" confirm="Remove this person's access?" />}
              </li>
            ))}
          </ul>
          {b.caps.manageAccess && <ParticipantForm agreementId={id} />}
        </Card>

        {b.caps.cancel && !["fully_signed", "cancelled"].includes(b.agreement.status) && (
          <Card title="Cancel or revoke">
            <p className="mb-2 text-sm text-muted">Cancelling closes every signing link and withdraws the request at the e-signature service. People involved are notified.</p>
            <ActionForm action={cancelAction} fields={{ agreementId: id }} label="Cancel agreement" className="btn btn-danger btn-sm" confirm="Cancel this agreement?">
              <input name="reason" required placeholder="Reason" aria-label="Reason" className="input !w-64" />
            </ActionForm>
          </Card>
        )}

        <Card
          id="audit"
          title="Audit trail"
          actions={chain.ok ? <Pill tone="good">Hash chain verified</Pill> : <Pill tone="bad">Chain broken at event {chain.brokenAtSeq}</Pill>}
        >
          <p className="mb-3 text-xs text-muted">Every entry records something that actually happened. Entries can&apos;t be edited or deleted in the application, and each is chained to the one before so tampering is detectable. Times are US Eastern.</p>
          <TableWrap>
            <table className="data">
              <thead><tr><th>#</th><th>When</th><th>Event</th><th>By</th><th>Reference</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="num text-xs">{e.seq}</td>
                    <td className="whitespace-nowrap text-xs">{fmtStamp(e.at)}</td>
                    <td className="text-sm">
                      {EVENT_LABEL[e.type] ?? e.type}
                      {Object.keys(visibleMeta(e.metadata, staff)).length > 0 && (
                        <details className="text-xs text-muted"><summary className="cursor-pointer">details</summary><pre className="max-w-xs overflow-x-auto whitespace-pre-wrap break-words sm:max-w-md">{JSON.stringify(visibleMeta(e.metadata, staff), null, 1)}</pre></details>
                      )}
                    </td>
                    <td className="text-xs">{e.actorType === "user" ? nameOf.get(e.actorRef ?? "") ?? "User" : e.actorType === "signer" ? sigName.get(e.actorRef ?? "") ?? "Signer" : e.actorType === "provider" ? "E-signature / email service" : "System"}</td>
                    <td className="max-w-[10rem] truncate font-mono text-[11px] text-muted" title={e.providerRef ?? ""}>{e.providerRef ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <LegalNotice />
      </div>
    </>
  );
}
