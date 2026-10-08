/**
 * Email notifications. Each message is logged before it is sent, de-duplicated
 * by a key, and only ever described as "accepted by the email service" until a
 * delivery webhook says otherwise. We never claim an email arrived on our own.
 */
import { eq } from "drizzle-orm";
import { emailLog } from "@/lib/db/schema";
import { recordEvent, type AuditType } from "./audit";
import type { Deps } from "./deps";
import { renderEmail } from "./email/mailer";
import { newId } from "./security";

export type NotifyKind =
  | "invitation"
  | "reminder"
  | "buyer_signed"
  | "seller_signed"
  | "fully_signed"
  | "declined"
  | "expired"
  | "cancelled"
  | "otp"
  | "user_invite";

export interface NotifyInput {
  kind: NotifyKind;
  agreementId?: string | null;
  signatureId?: string | null;
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footnote?: string;
  /** Same key twice = one email. */
  dedupeKey: string;
}

export type NotifyResult = { status: "accepted" | "failed" | "skipped"; error?: string };

const AUDITED: Partial<Record<NotifyKind, { ok: AuditType; fail: AuditType }>> = {
  invitation: { ok: "invitation.email_accepted", fail: "invitation.email_failed" },
  reminder: { ok: "invitation.email_accepted", fail: "invitation.email_failed" },
};

export async function notify(deps: Deps, n: NotifyInput): Promise<NotifyResult> {
  const { db } = deps;
  const now = deps.now().toISOString();
  const existing = db.select().from(emailLog).where(eq(emailLog.idempotencyKey, n.dedupeKey)).get();
  if (existing && existing.status !== "failed") return { status: "skipped" };

  const id = existing?.id ?? newId();
  if (!existing) {
    db.insert(emailLog).values({ id, agreementId: n.agreementId ?? null, signatureId: n.signatureId ?? null, kind: n.kind, toEmail: n.to, subject: n.subject, idempotencyKey: n.dedupeKey, provider: deps.mailer.name, status: "failed", error: "not sent yet", createdAt: now, updatedAt: now }).run();
  }
  const body = renderEmail({ heading: n.heading, paragraphs: n.paragraphs, cta: n.cta, footnote: n.footnote });
  // A retry after a failure uses a fresh provider idempotency key so the earlier failed attempt can't mask it.
  const key = existing ? `${n.dedupeKey}:retry:${Date.parse(now)}` : n.dedupeKey;
  const res = await deps.mailer.send({ to: n.to, subject: n.subject, text: body.text, html: body.html, idempotencyKey: key });

  const audit = AUDITED[n.kind];
  const type = (ok: boolean): AuditType => (audit ? (ok ? audit.ok : audit.fail) : ok ? "notification.sent" : "notification.failed");
  if (res.ok) {
    db.update(emailLog).set({ status: "accepted", providerMessageId: res.messageId, error: null, updatedAt: now }).where(eq(emailLog.id, id)).run();
    if (n.kind !== "otp") recordEvent(db, { agreementId: n.agreementId, type: type(true), actorType: "system", providerRef: res.messageId, metadata: { kind: n.kind, to: n.to, signatureId: n.signatureId ?? null, note: "Accepted by the email service; delivery is confirmed separately." } }, deps.now());
    return { status: "accepted" };
  }
  db.update(emailLog).set({ status: "failed", error: res.error, updatedAt: now }).where(eq(emailLog.id, id)).run();
  if (n.kind !== "otp") recordEvent(db, { agreementId: n.agreementId, type: type(false), actorType: "system", metadata: { kind: n.kind, to: n.to, signatureId: n.signatureId ?? null, error: res.error } }, deps.now());
  return { status: "failed", error: res.error };
}

export function listEmails(db: Deps["db"], agreementId: string) {
  return db.select().from(emailLog).where(eq(emailLog.agreementId, agreementId)).all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const EMAIL_STATUS_LABEL: Record<string, string> = {
  failed: "Failed to send",
  accepted: "Accepted by email service (delivery not yet confirmed)",
  delivered: "Delivery confirmed",
  delayed: "Delivery delayed",
  bounced: "Bounced",
  complained: "Marked as spam by recipient",
};
