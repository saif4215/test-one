/**
 * Inbound webhooks. Each is authenticated by signature, de-duplicated, and
 * treated only as a prompt: the signature webhook triggers a fresh read from
 * the provider's API rather than trusting the payload's claims.
 */
import { eq } from "drizzle-orm";
import { emailLog, signatureRequests, webhookEvents } from "@/lib/db/schema";
import { recordEvent } from "./audit";
import { resendConfig } from "./config";
import type { Deps } from "./deps";
import { verifySvix } from "./email/mailer";
import { reconcileRequest } from "./signing";
import { sha256Hex } from "./security";

export interface WebhookOutcome {
  status: number;
  body: string;
}

function remember(deps: Deps, id: string, source: string, outcome: string): boolean {
  const res = deps.db.insert(webhookEvents).values({ id, source, receivedAt: deps.now().toISOString(), outcome }).onConflictDoNothing().run();
  return res.changes > 0;
}

export async function handleSignatureWebhook(deps: Deps, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const verdict = deps.provider.verifyWebhook(rawBody, headers);
  if (!verdict.ok) {
    recordEvent(deps.db, { type: "webhook.rejected", actorType: "provider", metadata: { source: deps.provider.name, reason: verdict.reason ?? "invalid" } }, deps.now());
    return { status: 401, body: "invalid signature" };
  }
  // The same body delivered twice (a provider retry) is processed once.
  if (!remember(deps, `${deps.provider.name}:${sha256Hex(rawBody)}`, deps.provider.name, "received")) return { status: 200, body: "duplicate" };
  if (!verdict.envelopeId) return { status: 200, body: "ignored" };
  const request = deps.db.select().from(signatureRequests).where(eq(signatureRequests.providerEnvelopeId, verdict.envelopeId)).get();
  if (!request) return { status: 200, body: "unknown envelope" };
  const r = await reconcileRequest(deps, request.id, "webhook");
  if (r.ok) return { status: 200, body: "ok" };
  // A failed read-back is reported as 500 so the provider retries, and the retry must not be treated as a duplicate.
  deps.db.delete(webhookEvents).where(eq(webhookEvents.id, `${deps.provider.name}:${sha256Hex(rawBody)}`)).run();
  return { status: 500, body: "could not verify with provider" };
}

const EMAIL_EVENT_STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

export async function handleEmailWebhook(deps: Deps, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const cfg = resendConfig();
  const secret = cfg.ok ? cfg.config.webhookSecret : undefined;
  if (!secret) return { status: 503, body: "email webhook not configured" };
  const v = verifySvix(rawBody, headers, secret, deps.now().getTime());
  if (!v.ok) {
    recordEvent(deps.db, { type: "webhook.rejected", actorType: "provider", metadata: { source: "resend", reason: v.reason } }, deps.now());
    return { status: 401, body: "invalid signature" };
  }
  if (!remember(deps, `resend:${v.id}`, "resend", "received")) return { status: 200, body: "duplicate" };
  let evt: { type?: string; data?: { email_id?: string } };
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: "bad json" };
  }
  const status = evt.type ? EMAIL_EVENT_STATUS[evt.type] : undefined;
  const messageId = evt.data?.email_id;
  if (!status || !messageId) return { status: 200, body: "ignored" };
  const row = deps.db.select().from(emailLog).where(eq(emailLog.providerMessageId, messageId)).get();
  if (!row) return { status: 200, body: "unknown message" };
  // Never move backwards from a terminal state (events can arrive out of order).
  if (row.status === "delivered" && status === "delayed") return { status: 200, body: "ok" };
  const now = deps.now().toISOString();
  deps.db.update(emailLog).set({ status, updatedAt: now, deliveredAt: status === "delivered" ? now : row.deliveredAt }).where(eq(emailLog.id, row.id)).run();
  if (row.kind === "invitation" || row.kind === "reminder") {
    if (status === "delivered") recordEvent(deps.db, { agreementId: row.agreementId, type: "invitation.delivery_confirmed", actorType: "provider", providerRef: messageId, metadata: { to: row.toEmail, kind: row.kind } }, deps.now());
    if (status === "bounced" || status === "failed" || status === "complained") recordEvent(deps.db, { agreementId: row.agreementId, type: "invitation.delivery_failed", actorType: "provider", providerRef: messageId, metadata: { to: row.toEmail, kind: row.kind, outcome: status } }, deps.now());
  }
  return { status: 200, body: "ok" };
}
