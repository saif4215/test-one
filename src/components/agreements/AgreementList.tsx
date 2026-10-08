import Link from "next/link";
import { cancelAction } from "@/app/actions/agreements";
import { EmptyState } from "@/components/ui";
import { caps, listAgreements } from "@/lib/agreements/repo";
import type { Actor } from "@/lib/agreements/permissions";
import { formatMoney } from "@/lib/agreements/money";
import { PARTY_LABEL, type AgreementStatus } from "@/lib/agreements/status";
import type { DB } from "@/lib/db/client";
import { ActionForm } from "./ActionForm";
import { StatusPill, fmtDate, fmtStamp } from "./parts";

const ACTIVITY: Record<string, string> = {
  "agreement.created": "Created",
  "agreement.updated": "Edited",
  "agreement.submitted_for_review": "Submitted for review",
  "signature.requested": "Sent for signature",
  "signer.viewed": "Viewed (reported by e-signature service)",
  "signer.signed": "Signature confirmed",
  "signer.declined": "Declined",
  "request.completed": "Completed",
  "request.expired": "Expired",
  "agreement.cancelled": "Cancelled",
  "version.created": "New version created",
  "invitation.email_accepted": "Invitation email accepted",
  "invitation.email_failed": "Invitation email failed",
  "invitation.delivery_confirmed": "Invitation delivery confirmed",
};

export function AgreementList({ db, actor, status, emptyHint }: { db: DB; actor: Actor; status?: AgreementStatus; emptyHint?: React.ReactNode }) {
  const rows = listAgreements(db, actor, { status });
  if (!rows.length) {
    return <EmptyState title="No agreements here yet">{emptyHint ?? "Agreements you can access will appear here."}</EmptyState>;
  }
  return (
    <ul className="space-y-3">
      {rows.map(({ agreement: a, outstanding, lastActivity }) => {
        const c = caps(db, actor, a.id);
        const editable = c.edit && (a.status === "draft" || a.status === "awaiting_review");
        const signed = a.status === "fully_signed";
        const cancellable = c.cancel && !["fully_signed", "cancelled"].includes(a.status);
        return (
          <li key={a.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/agreements/${a.id}`} className="font-mono text-sm font-semibold hover:underline">
                  {a.id}
                </Link>
                <span className="ml-2 text-xs text-muted">v{a.currentVersionNo}</span>
                <div className="mt-1 text-sm">
                  <span className="text-muted">Buyer</span> {a.buyerName || "—"} <span className="mx-1 text-muted">→</span> <span className="text-muted">Seller</span> {a.sellerName || "—"}
                </div>
              </div>
              <StatusPill status={a.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted">Purchase price</dt><dd className="num">{formatMoney(a.purchasePrice) ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">Created</dt><dd>{fmtDate(a.createdAt)}</dd></div>
              <div><dt className="text-xs text-muted">Expected closing</dt><dd>{fmtDate(a.closingDate)}</dd></div>
              <div>
                <dt className="text-xs text-muted">Outstanding signatures</dt>
                <dd>{outstanding.length ? outstanding.map((p) => PARTY_LABEL[p]).join(", ") : signed ? "None" : "—"}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">
              Last activity: {lastActivity ? `${ACTIVITY[lastActivity.type] ?? lastActivity.type.replace(/[._]/g, " ")} · ${fmtStamp(lastActivity.at)}` : "—"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {editable && <Link href={`/agreements/${a.id}/edit`} className="btn btn-sm">Continue editing</Link>}
              <Link href={`/agreements/${a.id}/preview`} className="btn btn-secondary btn-sm">Preview</Link>
              {c.send && a.status === "awaiting_review" && <Link href={`/agreements/${a.id}/send`} className="btn btn-secondary btn-sm">Send for signature</Link>}
              {signed && <a href={`/agreements/${a.id}/pdf?kind=signed`} className="btn btn-sm">Download signed agreement</a>}
              <Link href={`/agreements/${a.id}`} className="btn btn-secondary btn-sm">Signing history</Link>
              {cancellable && (
                <details className="inline-block">
                  <summary className="btn btn-danger btn-sm cursor-pointer list-none">Cancel / revoke</summary>
                  <div className="mt-2">
                    <ActionForm action={cancelAction} fields={{ agreementId: a.id }} label="Confirm cancel" className="btn btn-danger btn-sm" confirm="Cancel this agreement? Any signing links stop working.">
                      <input name="reason" required placeholder="Reason" aria-label="Reason for cancelling" className="input !w-56" />
                    </ActionForm>
                  </div>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
