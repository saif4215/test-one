/**
 * Append-only audit trail. Each event stores the hash of the previous event for
 * the same agreement, and SQLite triggers reject UPDATE/DELETE, so edits or
 * removals are blocked and, if the file is altered outside the app, detectable.
 * Events are only recorded for things that actually happened; callers must not
 * log an outcome before the relevant service has confirmed it.
 */
import { asc, desc, eq, isNull } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { newId, sha256Hex } from "./security";

export type ActorType = "user" | "signer" | "provider" | "system";

export type AuditType =
  | "agreement.created"
  | "agreement.updated"
  | "agreement.submitted_for_review"
  | "agreement.returned_to_draft"
  | "agreement.template_upgraded"
  | "agreement.cancelled"
  | "agreement.access_granted"
  | "agreement.access_revoked"
  | "version.created"
  | "attachment.uploaded"
  | "attachment.removed"
  | "pdf.generated"
  | "pdf.downloaded"
  | "signature.requested"
  | "signature.request_failed"
  | "invitation.email_accepted"
  | "invitation.email_failed"
  | "invitation.delivery_confirmed"
  | "invitation.delivery_failed"
  | "invitation.resent"
  | "invitation.revoked"
  | "invitation.expired"
  | "signing.page_opened"
  | "signing.identity_code_sent"
  | "signing.identity_verified"
  | "signing.identity_failed"
  | "signing.consent_recorded"
  | "signing.session_started"
  | "signer.viewed"
  | "signer.signed"
  | "signer.declined"
  | "request.superseded"
  | "request.expired"
  | "request.cancelled"
  | "request.completed"
  | "request.verified_with_provider"
  | "completion.documents_saved"
  | "completion.documents_failed"
  | "request.void_failed"
  | "request.voided_at_provider"
  | "document.sent_copy_saved"
  | "notification.sent"
  | "notification.failed"
  | "webhook.rejected"
  | "template.updated"
  | "user.invited"
  | "user.role_changed"
  | "user.disabled"
  | "user.enabled"
  | "user.login"
  | "user.password_changed"
  | "settings.updated";

export interface AuditInput {
  agreementId?: string | null;
  versionId?: string | null;
  type: AuditType;
  actorType: ActorType;
  actorRef?: string | null;
  providerRef?: string | null;
  metadata?: Record<string, unknown>;
}

const GENESIS = "0".repeat(64);

function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}

function eventHash(prev: string, e: { id: string; seq: number; agreementId: string | null; versionId: string | null; type: string; at: string; actorType: string; actorRef: string | null; providerRef: string | null; metadata: unknown }): string {
  return sha256Hex(prev + canonical(e));
}

export function recordEvent(db: DB, input: AuditInput, now = new Date()) {
  const agreementId = input.agreementId ?? null;
  const last = db
    .select()
    .from(auditEvents)
    .where(agreementId ? eq(auditEvents.agreementId, agreementId) : isNull(auditEvents.agreementId))
    .orderBy(desc(auditEvents.seq))
    .limit(1)
    .get();
  const row = {
    id: newId(),
    seq: (last?.seq ?? 0) + 1,
    agreementId,
    versionId: input.versionId ?? null,
    type: input.type,
    at: now.toISOString(),
    actorType: input.actorType,
    actorRef: input.actorRef ?? null,
    providerRef: input.providerRef ?? null,
    metadata: input.metadata ?? {},
  };
  const prevHash = last?.hash ?? GENESIS;
  const hash = eventHash(prevHash, row);
  db.insert(auditEvents).values({ ...row, prevHash, hash }).run();
  return { ...row, prevHash, hash };
}

export function listEvents(db: DB, agreementId: string) {
  return db.select().from(auditEvents).where(eq(auditEvents.agreementId, agreementId)).orderBy(asc(auditEvents.seq)).all();
}

export function lastActivity(db: DB, agreementId: string) {
  return db.select().from(auditEvents).where(eq(auditEvents.agreementId, agreementId)).orderBy(desc(auditEvents.seq)).limit(1).get() ?? null;
}

/** Recomputes the hash chain; returns the first broken event, or null when intact. */
export function verifyChain(db: DB, agreementId: string): { ok: true } | { ok: false; brokenAtSeq: number } {
  let prev = GENESIS;
  for (const e of listEvents(db, agreementId)) {
    const expected = eventHash(prev, {
      id: e.id, seq: e.seq, agreementId: e.agreementId, versionId: e.versionId, type: e.type, at: e.at,
      actorType: e.actorType, actorRef: e.actorRef, providerRef: e.providerRef, metadata: e.metadata,
    });
    if (e.prevHash !== prev || e.hash !== expected) return { ok: false, brokenAtSeq: e.seq };
    prev = e.hash;
  }
  return { ok: true };
}
