/**
 * The signing workflow: sending for signature, secure invitations, signer
 * identity checks and consent, provider reconciliation, completion, revision,
 * cancellation and expiry.
 *
 * Source of truth: the signature provider. Local state moves to "signed" or
 * "fully signed" only after reading it back from the provider's API; webhooks
 * and browser redirects merely prompt that re-check and are never trusted
 * on their own.
 */
import { eq } from "drizzle-orm";
import { agreementVersions, agreements, attachments, signatureRequests, signatures, users, type SignerConsent } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";
import { recordEvent } from "./audit";
import { CONSENT_VERSION, consentTextHash } from "./consent";
import type { Deps } from "./deps";
import { notify } from "./notify";
import { renderVersionPdf } from "./pdfService";
import type { Actor } from "./permissions";
import type { EnvelopeState } from "./providers/types";
import { caps, getAgreementRow, getVersionRow, readiness, touchAgreement, versionData, type AgreementRow, type Result, type VersionRow } from "./repo";
import { appSecret, hmacHex, newId, randomCode, randomToken, rateLimit, safeEqualStr, sha256Hex } from "./security";
import { PARTY_LABEL, deriveSigningStatus, type AgreementStatus } from "./status";
import { putFile } from "./storage";

export type RequestRow = typeof signatureRequests.$inferSelect;
export type SignerRow = typeof signatures.$inferSelect;
export type SigningOrder = "buyer_first" | "seller_first" | "parallel";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
export const VERIFIED_WINDOW_MS = 30 * 60 * 1000;
export const COMPLETED_ACCESS_DAYS = 30;
export const MAX_EXPIRY_DAYS = 60;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function signersFor(db: DB, requestId: string): SignerRow[] {
  return db.select().from(signatures).where(eq(signatures.requestId, requestId)).all().sort((a, b) => a.routingOrder - b.routingOrder || a.party.localeCompare(b.party));
}
export const getRequest = (db: DB, id: string): RequestRow | null => db.select().from(signatureRequests).where(eq(signatureRequests.id, id)).get() ?? null;
export function requestsFor(db: DB, agreementId: string): RequestRow[] {
  return db.select().from(signatureRequests).where(eq(signatureRequests.agreementId, agreementId)).all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function setAgreementStatus(db: DB, agreement: AgreementRow, status: AgreementStatus, now: Date, extra: Partial<typeof agreements.$inferInsert> = {}) {
  touchAgreement(db, agreement.id, now, { status, ...extra });
}

/* ------------------------------------------------------------------ */
/* Invitations                                                         */
/* ------------------------------------------------------------------ */

function issueToken(db: DB, sig: SignerRow, expiresAt: string): string {
  const token = randomToken();
  db.update(signatures).set({ tokenHash: sha256Hex(token), tokenExpiresAt: expiresAt, tokenRevokedAt: null, otpHash: null, otpExpiresAt: null, otpAttempts: 0, verifiedAt: null }).where(eq(signatures.id, sig.id)).run();
  return token;
}

function otherParty(p: string) {
  return p === "buyer" ? "seller" : "buyer";
}

async function sendInvitation(deps: Deps, sig: SignerRow, kind: "invitation" | "reminder"): Promise<{ ok: boolean; error?: string }> {
  const { db } = deps;
  const request = getRequest(db, sig.requestId)!;
  const agreement = getAgreementRow(db, sig.agreementId)!;
  const token = issueToken(db, sig, request.expiresAt);
  const now = deps.now();
  db.update(signatures).set({ invitedAt: iso(now), status: sig.status === "pending" ? "invited" : sig.status }).where(eq(signatures.id, sig.id)).run();
  const label = PARTY_LABEL[sig.party as "buyer" | "seller"];
  const res = await notify(deps, {
    kind,
    agreementId: agreement.id,
    signatureId: sig.id,
    to: sig.email,
    subject: `${kind === "reminder" ? "Reminder: " : ""}Please review and sign the Maruf Cafe purchase agreement (${agreement.id})`,
    heading: kind === "reminder" ? "Your signature is still needed" : "You've been asked to sign an agreement",
    paragraphs: [
      `Hello ${sig.name},`,
      `You are asked to review and sign the Business Purchase and Sale Agreement for Maruf Cafe as the ${label}. Agreement ${agreement.id}, version ${agreement.currentVersionNo}.`,
      `This link is personal to you and expires on ${request.expiresAt.slice(0, 10)}. You will confirm your email with a one-time code before you can see the agreement. Do not forward this email.`,
    ],
    cta: { label: "Review and sign", url: `${deps.baseUrl}/sign/${token}` },
    footnote: "This agreement is a template-based document and is not legal advice. Read it carefully before you sign; you may ask an attorney to review it if you wish.",
    dedupeKey: `${kind}:${sig.id}:${sha256Hex(token).slice(0, 16)}`,
  });
  return res.status === "failed" ? { ok: false, error: res.error } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Sending for signature                                               */
/* ------------------------------------------------------------------ */

export async function sendForSignature(
  deps: Deps,
  actor: Actor,
  agreementId: string,
  opts: { order: SigningOrder; expiryDays: number },
): Promise<Result<{ requestId: string; invitationFailures: string[] }>> {
  const { db } = deps;
  const now = deps.now();
  if (!caps(db, actor, agreementId).send) return fail("You don't have permission to send this agreement for signature.");
  const agreement = getAgreementRow(db, agreementId);
  const version = agreement?.currentVersionId ? getVersionRow(db, agreement.currentVersionId) : null;
  if (!agreement || !version) return fail("Agreement not found.");
  if (agreement.status !== "awaiting_review") return fail("Submit the agreement for review (Step 9) before sending it for signature.");
  if (version.signaturesRequested) return fail("Signatures were already requested for this version.");
  if (!["buyer_first", "seller_first", "parallel"].includes(opts.order)) return fail("Choose a signing order.");
  const days = Math.floor(opts.expiryDays);
  if (!(days >= 1 && days <= MAX_EXPIRY_DAYS)) return fail(`Choose an expiration between 1 and ${MAX_EXPIRY_DAYS} days.`);

  const prov = deps.provider.configuration();
  if (!prov.ok) return fail(`The e-signature service isn't configured yet (missing: ${prov.missing.join(", ")}). See docs/AGREEMENTS.md. Nothing was sent.`);
  if (!deps.mailer.configured()) return fail("Email isn't configured, so signing invitations can't be sent. Set RESEND_API_KEY and EMAIL_FROM. Nothing was sent.");

  const data = versionData(version);
  const issues = readiness(db, { agreement, version, data });
  if (issues.length) return fail(`The agreement isn't ready: ${issues[0].message}${issues.length > 1 ? ` (and ${issues.length - 1} more)` : ""}`);

  // Build the exact PDF that will be signed.
  const pdf = await renderVersionPdf(db, agreement, version, false);
  if (pdf.mergeFailures.length) return fail(`These attachments couldn't be added to the signing document: ${pdf.mergeFailures.map((f) => `${f.fileName} (${f.reason})`).join("; ")}. Remove or replace them and try again.`);
  const documentHash = sha256Hex(pdf.bytes);

  const order = opts.order;
  const routing = (party: "buyer" | "seller") => (order === "parallel" ? 1 : order === "buyer_first" ? (party === "buyer" ? 1 : 2) : party === "seller" ? 1 : 2);
  const parties = (["buyer", "seller"] as const).map((party) => {
    const p = data[party];
    const place = pdf.placements.find((x) => x.party === party);
    if (!place) throw new Error("Signature block not found in the generated document.");
    return {
      party,
      name: p.signingCapacity === "entity_representative" && p.repName ? p.repName : p.legalName,
      email: p.email,
      clientUserId: newId(),
      routingOrder: routing(party),
      recipientId: party === "buyer" ? "1" : "2",
      sign: { page: place.page, x: place.signX, y: place.signTop },
      date: { page: place.page, x: place.dateX, y: place.dateTop },
    };
  });

  let envelopeId: string;
  try {
    ({ envelopeId } = await deps.provider.createEnvelope({
      pdf: pdf.bytes,
      documentName: `Maruf Cafe Purchase Agreement ${agreementId} v${version.versionNo}.pdf`,
      subject: `Maruf Cafe Business Purchase and Sale Agreement (${agreementId})`,
      signers: parties,
    }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "The e-signature service returned an error.";
    recordEvent(db, { agreementId, versionId: version.id, type: "signature.request_failed", actorType: "user", actorRef: actor.id, metadata: { error: message } }, now);
    return fail(`The e-signature service did not accept the document, so nothing was sent. ${message}`);
  }

  // Another click or tab may have sent this version while we were waiting for the provider; never leave a second live envelope behind.
  const latest = getVersionRow(db, version.id);
  if (latest?.signaturesRequested) {
    try {
      await deps.provider.voidEnvelope(envelopeId, "Duplicate request");
    } catch {
      /* the duplicate has no signing links of its own, so nobody can sign it */
    }
    return fail("This version was already sent for signature.");
  }

  const requestId = newId();
  const expiresAt = iso(addDays(now, days));
  const storedPdf = putFile(Buffer.from(pdf.bytes));
  const sentAttachmentId = newId();
  db.transaction((tx) => {
    tx.insert(attachments).values({ id: sentAttachmentId, agreementId, kind: "sent_pdf", schedule: null, storageKey: storedPdf.key, fileName: `Agreement ${agreementId} v${version.versionNo} (sent for signature).pdf`, contentType: "application/pdf", size: pdf.bytes.length, sha256: storedPdf.sha256, versionId: version.id, uploadedBy: actor.id, uploadedAt: iso(now), deletedAt: null }).run();
    tx.insert(signatureRequests).values({ id: requestId, agreementId, versionId: version.id, provider: deps.provider.name, providerEnvelopeId: envelopeId, signingOrder: order, status: "active", sentDocumentHash: documentHash, expiresAt, createdBy: actor.id, createdAt: iso(now) }).run();
    for (const p of parties) {
      tx.insert(signatures).values({ id: newId(), requestId, agreementId, versionId: version.id, party: p.party, name: p.name, email: p.email.toLowerCase(), routingOrder: p.routingOrder, clientUserId: p.clientUserId, providerRecipientId: p.recipientId, status: "pending" }).run();
    }
    tx.update(agreementVersions).set({ signaturesRequested: true, signaturesRequestedAt: iso(now), documentHash }).where(eq(agreementVersions.id, version.id)).run();
    touchAgreement(tx as unknown as DB, agreementId, now, { status: "sent_for_signature" });
  });
  recordEvent(db, { agreementId, versionId: version.id, type: "document.sent_copy_saved", actorType: "system", metadata: { documentHash, pages: pdf.pageCount } }, now);
  recordEvent(db, { agreementId, versionId: version.id, type: "signature.requested", actorType: "user", actorRef: actor.id, providerRef: envelopeId, metadata: { provider: deps.provider.name, order, expiresAt, documentHash, versionNo: version.versionNo } }, now);

  // Invite the first wave. A sequential flow invites the second signer only after the first has signed.
  const failures: string[] = [];
  const firstOrder = Math.min(...parties.map((p) => p.routingOrder));
  for (const s of signersFor(db, requestId).filter((x) => x.routingOrder === firstOrder)) {
    const r = await sendInvitation(deps, s, "invitation");
    if (!r.ok) failures.push(`${PARTY_LABEL[s.party as "buyer" | "seller"]}: ${r.error}`);
  }
  return { ok: true, value: { requestId, invitationFailures: failures } };
}

/** Staff action: issue a fresh link (the old one stops working) and email it again. */
export async function resendInvitation(deps: Deps, actor: Actor, signatureId: string, kind: "invitation" | "reminder" = "reminder"): Promise<Result> {
  const { db } = deps;
  const sig = db.select().from(signatures).where(eq(signatures.id, signatureId)).get();
  if (!sig || !caps(db, actor, sig.agreementId).send) return fail("Invitation not found.");
  const request = getRequest(db, sig.requestId)!;
  if (request.status !== "active") return fail("This signature request is no longer active.");
  if (new Date(request.expiresAt) < deps.now()) return fail("This signature request has expired. Create a new request to continue.");
  if (sig.status === "signed") return fail("This person has already signed.");
  if (sig.status === "pending") return fail("This person isn't invited yet; they're next in the signing order.");
  const r = await sendInvitation(deps, sig, kind);
  recordEvent(db, { agreementId: sig.agreementId, versionId: sig.versionId, type: "invitation.resent", actorType: "user", actorRef: actor.id, metadata: { signatureId, party: sig.party, kind, emailAccepted: r.ok } }, deps.now());
  return r.ok ? { ok: true, value: true } : fail(`The email service did not accept the message: ${r.error}`);
}

export function revokeInvitation(deps: Deps, actor: Actor, signatureId: string): Result {
  const { db } = deps;
  const sig = db.select().from(signatures).where(eq(signatures.id, signatureId)).get();
  if (!sig || !caps(db, actor, sig.agreementId).send) return fail("Invitation not found.");
  const now = deps.now();
  db.update(signatures).set({ tokenRevokedAt: iso(now), otpHash: null, verifiedAt: null }).where(eq(signatures.id, signatureId)).run();
  recordEvent(db, { agreementId: sig.agreementId, versionId: sig.versionId, type: "invitation.revoked", actorType: "user", actorRef: actor.id, metadata: { signatureId, party: sig.party } }, now);
  return { ok: true, value: true };
}

/* ------------------------------------------------------------------ */
/* Signer-facing: token lookup, identity, consent                       */
/* ------------------------------------------------------------------ */

export type TokenState = "ok" | "invalid" | "revoked" | "expired" | "cancelled" | "superseded" | "declined";

export interface TokenView {
  state: TokenState;
  sig?: SignerRow;
  request?: RequestRow;
  agreement?: AgreementRow;
  version?: VersionRow;
}

/** Resolves a link token. Unknown tokens reveal nothing. */
export function resolveToken(db: DB, token: string, now = new Date()): TokenView {
  if (!token || token.length < 20 || token.length > 100) return { state: "invalid" };
  const sig = db.select().from(signatures).where(eq(signatures.tokenHash, sha256Hex(token))).get();
  if (!sig) return { state: "invalid" };
  const request = getRequest(db, sig.requestId);
  const agreement = getAgreementRow(db, sig.agreementId);
  const version = getVersionRow(db, sig.versionId);
  if (!request || !agreement || !version) return { state: "invalid" };
  const view = { sig, request, agreement, version };
  if (sig.tokenRevokedAt) return { state: "revoked", ...view };
  if (sig.tokenExpiresAt && new Date(sig.tokenExpiresAt) < now) return { state: "expired", ...view };
  if (request.status === "superseded") return { state: "superseded", ...view };
  if (request.status === "cancelled") return { state: "cancelled", ...view };
  if (request.status === "expired") return { state: "expired", ...view };
  if (request.status === "declined") return { state: "declined", ...view };
  if (request.status === "active") {
    if (new Date(request.expiresAt) < now) return { state: "expired", ...view };
    if (agreement.currentVersionId !== sig.versionId) return { state: "superseded", ...view };
  }
  return { state: "ok", ...view };
}

export function isVerified(sig: SignerRow, now = new Date()): boolean {
  return !!sig.verifiedAt && now.getTime() - new Date(sig.verifiedAt).getTime() < VERIFIED_WINDOW_MS;
}

/** Value stored in the signer's browser after the email code is confirmed. Tied to this token and verification time. */
export function signerSessionValue(sig: SignerRow): string {
  return `${sig.id}.${hmacHex(appSecret(), `signer-session|${sig.id}|${sig.tokenHash}|${sig.verifiedAt}`)}`;
}
export function signerSessionValid(sig: SignerRow, cookie: string | undefined, now = new Date()): boolean {
  return !!cookie && isVerified(sig, now) && safeEqualStr(cookie, signerSessionValue(sig));
}

const otpHash = (sigId: string, code: string) => hmacHex(appSecret(), `otp|${sigId}|${code}`);

export async function requestIdentityCode(deps: Deps, token: string, ctx: { ip: string | null }): Promise<Result> {
  const { db } = deps;
  const now = deps.now();
  const view = resolveToken(db, token, now);
  if (view.state !== "ok" || !view.sig) return fail("This link can't be used.");
  const sig = view.sig;
  if (!rateLimit(`otp:${sig.id}`, 5, 60 * 60 * 1000).ok) return fail("Too many codes requested. Try again in an hour.");
  if (!rateLimit(`otp-ip:${ctx.ip ?? "?"}`, 20, 60 * 60 * 1000).ok) return fail("Too many requests. Try again later.");
  if (sig.otpExpiresAt && new Date(sig.otpExpiresAt).getTime() - OTP_TTL_MS + 60_000 > now.getTime()) return fail("A code was just sent. Please wait a minute before asking for another.");
  const code = randomCode();
  db.update(signatures).set({ otpHash: otpHash(sig.id, code), otpExpiresAt: iso(new Date(now.getTime() + OTP_TTL_MS)), otpAttempts: 0 }).where(eq(signatures.id, sig.id)).run();
  const res = await notify(deps, {
    kind: "otp",
    agreementId: sig.agreementId,
    signatureId: sig.id,
    to: sig.email,
    subject: "Your verification code",
    heading: "Your verification code",
    paragraphs: [`Your one-time code is ${code}. It expires in 10 minutes.`, "If you did not ask for this code, ignore this email. Do not share it with anyone."],
    dedupeKey: `otp:${sig.id}:${newId()}`,
  });
  recordEvent(db, { agreementId: sig.agreementId, versionId: sig.versionId, type: "signing.identity_code_sent", actorType: "signer", actorRef: sig.id, metadata: { party: sig.party, emailAccepted: res.status === "accepted" } }, now);
  return res.status === "failed" ? fail("We couldn't send the code right now. Please try again shortly or contact the sender.") : { ok: true, value: true };
}

export function verifyIdentityCode(deps: Deps, token: string, code: string, ctx: { ip: string | null }): Result<SignerRow> {
  const { db } = deps;
  const now = deps.now();
  const view = resolveToken(db, token, now);
  if (view.state !== "ok" || !view.sig) return fail("This link can't be used.");
  const sig = view.sig;
  if (!rateLimit(`otp-verify-ip:${ctx.ip ?? "?"}`, 30, 60 * 60 * 1000).ok) return fail("Too many attempts. Try again later.");
  if (!sig.otpHash || !sig.otpExpiresAt || new Date(sig.otpExpiresAt) < now) return fail("That code has expired. Ask for a new one.");
  if (sig.otpAttempts >= OTP_MAX_ATTEMPTS) return fail("Too many wrong codes. Ask for a new one.");
  if (!safeEqualStr(otpHash(sig.id, code.trim()), sig.otpHash)) {
    db.update(signatures).set({ otpAttempts: sig.otpAttempts + 1 }).where(eq(signatures.id, sig.id)).run();
    recordEvent(db, { agreementId: sig.agreementId, versionId: sig.versionId, type: "signing.identity_failed", actorType: "signer", actorRef: sig.id, metadata: { party: sig.party, ip: ctx.ip } }, now);
    return fail("That code isn't right.");
  }
  db.update(signatures).set({ verifiedAt: iso(now), otpHash: null, otpExpiresAt: null, otpAttempts: 0 }).where(eq(signatures.id, sig.id)).run();
  recordEvent(db, { agreementId: sig.agreementId, versionId: sig.versionId, type: "signing.identity_verified", actorType: "signer", actorRef: sig.id, metadata: { party: sig.party, method: "email_one_time_code", ip: ctx.ip } }, now);
  return { ok: true, value: db.select().from(signatures).where(eq(signatures.id, sig.id)).get()! };
}

/**
 * Called when the verified signer presses "Review and Sign Agreement". Records
 * the consent evidence, then asks the provider for a one-time signing session.
 */
export async function startSigning(
  deps: Deps,
  token: string,
  input: { esignConsent: boolean; reviewedAll: boolean },
  ctx: { ip: string | null; userAgent: string | null; sessionCookie: string | undefined },
): Promise<Result<{ url: string }>> {
  const { db } = deps;
  const now = deps.now();
  const view = resolveToken(db, token, now);
  if (view.state !== "ok" || !view.sig || !view.request || !view.agreement) return fail("This link can't be used.");
  const { sig, request, agreement } = view;
  if (!signerSessionValid(sig, ctx.sessionCookie, now)) return fail("Please confirm your email with a code first.");
  if (request.status !== "active") return fail("This agreement is no longer open for signing.");
  if (sig.status === "signed") return fail("You have already signed.");
  if (sig.status === "pending") return fail("It isn't your turn to sign yet. You'll get an email when it is.");
  if (agreement.currentVersionId !== sig.versionId || request.versionId !== sig.versionId) return fail("This is not the current version of the agreement.");
  if (!input.esignConsent || !input.reviewedAll) return fail("Please tick both boxes to confirm your consent and that you reviewed the agreement.");
  if (!rateLimit(`sign:${sig.id}`, 10, 60 * 60 * 1000).ok) return fail("Too many attempts. Try again later.");
  if (!view.version?.documentHash || view.version.documentHash !== request.sentDocumentHash) return fail("The document on file doesn't match what was sent. Please contact the sender.");
  // Sequential order: everyone with an earlier routing order must already have signed.
  const earlier = signersFor(db, request.id).filter((s) => s.routingOrder < sig.routingOrder);
  if (earlier.some((s) => s.status !== "signed")) return fail("It isn't your turn to sign yet.");

  const consent: SignerConsent = {
    consentVersion: CONSENT_VERSION,
    consentTextSha256: consentTextHash(),
    esignConsent: true,
    reviewedAll: true,
    documentHash: request.sentDocumentHash,
    acceptedAt: iso(now),
    ip: ctx.ip,
    userAgent: ctx.userAgent?.slice(0, 300) ?? null,
    authMethod: "email_one_time_code",
    authVerifiedAt: sig.verifiedAt!,
  };
  db.update(signatures).set({ consent }).where(eq(signatures.id, sig.id)).run();
  recordEvent(db, { agreementId: agreement.id, versionId: sig.versionId, type: "signing.consent_recorded", actorType: "signer", actorRef: sig.id, metadata: { party: sig.party, ...consent } }, now);

  try {
    const session = await deps.provider.createSigningSession({
      envelopeId: request.providerEnvelopeId!,
      signer: { name: sig.name, email: sig.email, clientUserId: sig.clientUserId, recipientId: sig.providerRecipientId ?? "1" },
      returnUrl: `${deps.baseUrl}/sign/${token}/return`,
      authentication: { method: "Email", at: sig.verifiedAt!, assertionId: sig.id },
    });
    recordEvent(db, { agreementId: agreement.id, versionId: sig.versionId, type: "signing.session_started", actorType: "signer", actorRef: sig.id, providerRef: request.providerEnvelopeId, metadata: { party: sig.party } }, now);
    return { ok: true, value: { url: session.url } };
  } catch (e) {
    return fail(`The e-signature service could not open the signing page. ${e instanceof Error ? e.message : ""}`.trim());
  }
}

/** The signer chooses not to sign. Our link is closed at once; the provider envelope is voided on a best-effort basis. */
export async function declineAsSigner(deps: Deps, token: string, reason: string, ctx: { ip: string | null; sessionCookie: string | undefined }): Promise<Result> {
  const { db } = deps;
  const now = deps.now();
  const view = resolveToken(db, token, now);
  if (view.state !== "ok" || !view.sig || !view.request || !view.agreement) return fail("This link can't be used.");
  const { sig, request, agreement } = view;
  if (!signerSessionValid(sig, ctx.sessionCookie, now)) return fail("Please confirm your email with a code first.");
  if (request.status !== "active" || sig.status === "signed" || sig.status === "pending") return fail("You can't decline this agreement right now.");
  const text = reason.trim().slice(0, 500);
  db.transaction((tx) => {
    tx.update(signatures).set({ status: "declined", declinedAt: iso(now), declineReason: text || null }).where(eq(signatures.id, sig.id)).run();
    tx.update(signatureRequests).set({ status: "declined" }).where(eq(signatureRequests.id, request.id)).run();
    revokeAllTokens(tx as unknown as DB, request.id, now);
    setAgreementStatus(tx as unknown as DB, agreement, "declined", now);
  });
  recordEvent(db, { agreementId: agreement.id, versionId: sig.versionId, type: "signer.declined", actorType: "signer", actorRef: sig.id, metadata: { party: sig.party, reason: text, via: "signing page", ip: ctx.ip } }, now);
  await voidAtProvider(deps, request, `Declined by ${sig.party}${text ? `: ${text}` : ""}`);
  await notifyOutcome(deps, agreement.id, request.id, "declined", { by: sig.party, reason: text });
  return { ok: true, value: true };
}

function revokeAllTokens(db: DB, requestId: string, now: Date) {
  db.update(signatures).set({ tokenRevokedAt: iso(now), otpHash: null, verifiedAt: null }).where(eq(signatures.requestId, requestId)).run();
}

async function voidAtProvider(deps: Deps, request: RequestRow, reason: string): Promise<boolean> {
  if (!request.providerEnvelopeId) return true;
  try {
    await deps.provider.voidEnvelope(request.providerEnvelopeId, reason);
    recordEvent(deps.db, { agreementId: request.agreementId, versionId: request.versionId, type: "request.voided_at_provider", actorType: "system", providerRef: request.providerEnvelopeId, metadata: { reason } }, deps.now());
    return true;
  } catch (e) {
    deps.db.update(signatureRequests).set({ lastProviderStatus: "void_failed" }).where(eq(signatureRequests.id, request.id)).run();
    recordEvent(deps.db, { agreementId: request.agreementId, versionId: request.versionId, type: "request.void_failed", actorType: "system", providerRef: request.providerEnvelopeId, metadata: { reason, error: e instanceof Error ? e.message : "unknown" } }, deps.now());
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Reconciliation with the provider                                     */
/* ------------------------------------------------------------------ */

export type ReconcileResult = { ok: true; status: AgreementStatus; changed: boolean } | { ok: false; error: string };

export async function reconcileRequest(deps: Deps, requestId: string, source: "webhook" | "return" | "manual" | "maintenance"): Promise<ReconcileResult> {
  const { db } = deps;
  const request = getRequest(db, requestId);
  if (!request?.providerEnvelopeId) return { ok: false, error: "No provider envelope for this request." };
  const agreement = getAgreementRow(db, request.agreementId)!;
  if (request.status !== "active" && !(request.status === "completed" && !request.signedAttachmentId)) {
    return { ok: true, status: agreement.status as AgreementStatus, changed: false };
  }

  let env: EnvelopeState;
  try {
    env = await deps.provider.getEnvelope(request.providerEnvelopeId);
  } catch (e) {
    return { ok: false, error: `Could not read the signing status from the provider: ${e instanceof Error ? e.message : "error"}` };
  }
  const now = deps.now();
  let changed = false;
  db.update(signatureRequests).set({ lastProviderStatus: env.status }).where(eq(signatureRequests.id, request.id)).run();

  const signers = signersFor(db, request.id);
  const newlySigned: SignerRow[] = [];
  for (const s of signers) {
    const r = env.recipients.find((x) => x.clientUserId === s.clientUserId);
    if (!r) continue;
    if (r.status === "completed" && s.status !== "signed") {
      db.update(signatures).set({ status: "signed", signedAt: iso(now), providerSignedAt: r.signedAt ?? null, tokenRevokedAt: null }).where(eq(signatures.id, s.id)).run();
      recordEvent(db, { agreementId: agreement.id, versionId: s.versionId, type: "signer.signed", actorType: "provider", actorRef: s.id, providerRef: `${env.envelopeId}/${r.recipientId}`, metadata: { party: s.party, providerSignedAt: r.signedAt ?? null, source } }, now);
      newlySigned.push(s);
      changed = true;
    } else if (r.status === "declined" && s.status !== "declined") {
      db.update(signatures).set({ status: "declined", declinedAt: r.declinedAt ?? iso(now), declineReason: r.declineReason ?? null }).where(eq(signatures.id, s.id)).run();
      recordEvent(db, { agreementId: agreement.id, versionId: s.versionId, type: "signer.declined", actorType: "provider", actorRef: s.id, providerRef: `${env.envelopeId}/${r.recipientId}`, metadata: { party: s.party, reason: r.declineReason ?? null, source } }, now);
      changed = true;
    } else if (r.status === "delivered" && (s.status === "invited" || s.status === "pending")) {
      db.update(signatures).set({ status: "viewed", viewedAt: iso(now) }).where(eq(signatures.id, s.id)).run();
      recordEvent(db, { agreementId: agreement.id, versionId: s.versionId, type: "signer.viewed", actorType: "provider", actorRef: s.id, providerRef: `${env.envelopeId}/${r.recipientId}`, metadata: { party: s.party, note: "Reported by the signature provider.", source } }, now);
      changed = true;
    }
  }

  const fresh = signersFor(db, request.id);
  const providerAllCompleted = fresh.length > 0 && fresh.every((s) => env.recipients.find((x) => x.clientUserId === s.clientUserId)?.status === "completed");

  // --- provider says the envelope is declined or voided ---
  if (request.status === "active" && fresh.some((s) => s.status === "declined")) {
    db.update(signatureRequests).set({ status: "declined" }).where(eq(signatureRequests.id, request.id)).run();
    revokeAllTokens(db, request.id, now);
    setAgreementStatus(db, agreement, "declined", now);
    await notifyOutcome(deps, agreement.id, request.id, "declined", { by: fresh.find((s) => s.status === "declined")!.party, reason: fresh.find((s) => s.status === "declined")!.declineReason ?? "" });
    return { ok: true, status: "declined", changed: true };
  }
  if (request.status === "active" && env.status === "voided") {
    db.update(signatureRequests).set({ status: "cancelled" }).where(eq(signatureRequests.id, request.id)).run();
    revokeAllTokens(db, request.id, now);
    recordEvent(db, { agreementId: agreement.id, versionId: request.versionId, type: "request.cancelled", actorType: "provider", providerRef: env.envelopeId, metadata: { note: "The envelope was voided at the signature provider.", reason: env.voidedReason ?? null } }, now);
    setAgreementStatus(db, agreement, "cancelled", now);
    return { ok: true, status: "cancelled", changed: true };
  }

  // --- completion: only when the provider confirms the envelope AND every recipient completed ---
  if (env.status === "completed" && providerAllCompleted) {
    const current = agreement.currentVersionId === request.versionId;
    if (request.status === "active") {
      if (!current) {
        db.update(signatureRequests).set({ status: "superseded" }).where(eq(signatureRequests.id, request.id)).run();
        recordEvent(db, { agreementId: agreement.id, versionId: request.versionId, type: "request.superseded", actorType: "system", providerRef: env.envelopeId, metadata: { note: "The provider reports completion, but this is not the agreement's current version, so it is NOT treated as the signed agreement." } }, now);
        return { ok: true, status: agreement.status as AgreementStatus, changed: true };
      }
      db.transaction((tx) => {
        tx.update(signatureRequests).set({ status: "completed", completedAt: env.completedAt ?? iso(now), providerVerifiedAt: iso(now) }).where(eq(signatureRequests.id, request.id)).run();
        setAgreementStatus(tx as unknown as DB, agreement, "fully_signed", now, { signedVersionId: request.versionId });
      });
      recordEvent(db, { agreementId: agreement.id, versionId: request.versionId, type: "request.verified_with_provider", actorType: "provider", providerRef: env.envelopeId, metadata: { providerStatus: env.status, recipients: env.recipients.map((r) => ({ id: r.recipientId, status: r.status, signedAt: r.signedAt ?? null })) } }, now);
      recordEvent(db, { agreementId: agreement.id, versionId: request.versionId, type: "request.completed", actorType: "provider", providerRef: env.envelopeId, metadata: { completedAt: env.completedAt ?? null } }, now);
      changed = true;
    }
    await saveCompletedDocuments(deps, getRequest(db, request.id)!);
    if (changed) await notifyOutcome(deps, agreement.id, request.id, "fully_signed", {});
    return { ok: true, status: "fully_signed", changed };
  }

  // --- still in progress ---
  if (request.status === "active") {
    const status = deriveSigningStatus(fresh, false);
    if (status !== agreement.status) {
      setAgreementStatus(db, agreement, status, now);
      changed = true;
    }
    for (const s of newlySigned) await notifyOutcome(deps, agreement.id, request.id, "signed", { by: s.party });
    // Sequential flow: the next signer is invited as soon as the one before has signed.
    for (const next of fresh.filter((x) => x.status === "pending")) {
      if (fresh.filter((x) => x.routingOrder < next.routingOrder).every((x) => x.status === "signed")) await sendInvitation(deps, next, "invitation");
    }
    return { ok: true, status, changed };
  }
  return { ok: true, status: agreement.status as AgreementStatus, changed };
}

/** Downloads and stores the provider's signed PDF and its completion certificate. Safe to call again if it failed before. */
export async function saveCompletedDocuments(deps: Deps, request: RequestRow): Promise<boolean> {
  const { db } = deps;
  if (request.signedAttachmentId || !request.providerEnvelopeId) return true;
  const now = deps.now();
  try {
    const signed = Buffer.from(await deps.provider.downloadSigned(request.providerEnvelopeId));
    if (signed.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("The provider did not return a PDF.");
    let cert: Buffer | null = null;
    try {
      cert = Buffer.from(await deps.provider.downloadCertificate(request.providerEnvelopeId));
      if (cert.subarray(0, 5).toString("latin1") !== "%PDF-") cert = null;
    } catch {
      cert = null; // The certificate is offered "if available".
    }
    const put = (buf: Buffer, kind: "signed_pdf" | "certificate", name: string) => {
      const s = putFile(buf);
      const id = newId();
      db.insert(attachments).values({ id, agreementId: request.agreementId, kind, schedule: null, storageKey: s.key, fileName: name, contentType: "application/pdf", size: buf.length, sha256: s.sha256, versionId: request.versionId, uploadedBy: null, uploadedAt: iso(now), deletedAt: null }).run();
      return { id, sha256: s.sha256 };
    };
    const a = put(signed, "signed_pdf", `Signed agreement ${request.agreementId}.pdf`);
    const c = cert ? put(cert, "certificate", `Signing certificate ${request.agreementId}.pdf`) : null;
    db.update(signatureRequests).set({ signedAttachmentId: a.id, certificateAttachmentId: c?.id ?? null }).where(eq(signatureRequests.id, request.id)).run();
    recordEvent(db, { agreementId: request.agreementId, versionId: request.versionId, type: "completion.documents_saved", actorType: "system", providerRef: request.providerEnvelopeId, metadata: { signedSha256: a.sha256, certificateSha256: c?.sha256 ?? null } }, now);
    return true;
  } catch (e) {
    recordEvent(db, { agreementId: request.agreementId, versionId: request.versionId, type: "completion.documents_failed", actorType: "system", providerRef: request.providerEnvelopeId, metadata: { error: e instanceof Error ? e.message : "unknown" } }, now);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Notifications about outcomes                                        */
/* ------------------------------------------------------------------ */

type Outcome = "signed" | "fully_signed" | "declined" | "expired" | "cancelled";

async function notifyOutcome(deps: Deps, agreementId: string, requestId: string, outcome: Outcome, info: { by?: string; reason?: string; note?: string }) {
  const { db } = deps;
  const agreement = getAgreementRow(db, agreementId)!;
  const request = getRequest(db, requestId)!;
  const signers = signersFor(db, requestId);
  const creator = db.select().from(users).where(eq(users.id, agreement.createdBy)).get();
  const ref = `${agreement.id} (version ${agreement.currentVersionNo})`;
  const link = `${deps.baseUrl}/agreements/${agreement.id}`;
  const base = (to: string, subject: string, heading: string, paragraphs: string[], key: string, kind: Parameters<typeof notify>[1]["kind"], sigId?: string, cta?: { label: string; url: string }) =>
    notify(deps, { kind, agreementId, signatureId: sigId, to, subject, heading, paragraphs, cta, dedupeKey: `${kind}:${requestId}:${key}` });

  const staff = new Set<string>();
  if (creator?.email) staff.add(creator.email);

  if (outcome === "signed" && info.by) {
    const who = PARTY_LABEL[info.by as "buyer" | "seller"];
    const kind = info.by === "buyer" ? "buyer_signed" : "seller_signed";
    for (const to of staff) await base(to, `${who} has signed ${agreement.id}`, `${who} signed the agreement`, [`The ${who} signed agreement ${ref}, as confirmed by the e-signature service. The agreement is not fully signed until every party has signed.`], `${info.by}:${to}`, kind, undefined, { label: "View agreement", url: link });
    const other = signers.find((s) => s.party === otherParty(info.by!));
    if (other && other.status !== "pending") await base(other.email, `${who} has signed — your signature is still needed`, `${who} has signed`, [`The ${who} has signed agreement ${ref}. Your signature is still needed. Use the link in your invitation email.`], `${info.by}:notify-other`, kind, other.id);
  } else if (outcome === "fully_signed") {
    const ts = deps.now();
    const completedExpiry = iso(addDays(ts, COMPLETED_ACCESS_DAYS));
    for (const s of signers) {
      const token = issueToken(db, s, completedExpiry);
      await base(s.email, `Fully signed: Maruf Cafe agreement ${agreement.id}`, "The agreement is fully signed", [`Every party has signed agreement ${ref}. The e-signature service has confirmed completion.`, `Use the secure link below to download your signed copy and the signing certificate. You will confirm your email with a one-time code. The link works for ${COMPLETED_ACCESS_DAYS} days.`], `all:${s.id}`, "fully_signed", s.id, { label: "Download signed agreement", url: `${deps.baseUrl}/sign/${token}` });
    }
    for (const to of staff) await base(to, `Fully signed: ${agreement.id}`, "The agreement is fully signed", [`Every party has signed agreement ${ref}, as confirmed by the e-signature service.`], `all:staff:${to}`, "fully_signed", undefined, { label: "Open agreement", url: link });
  } else if (outcome === "declined") {
    const who = info.by ? PARTY_LABEL[info.by as "buyer" | "seller"] : "A party";
    const msg = [`${who} declined to sign agreement ${ref}.${info.reason ? ` Reason given: ${info.reason}` : ""}`, "The signature request is closed and the signing links no longer work."];
    for (const to of new Set([...staff, ...signers.map((s) => s.email)])) await base(to, `Declined: ${agreement.id}`, "A party declined to sign", msg, `d:${to}`, "declined");
  } else if (outcome === "expired") {
    const msg = [`The signature request for agreement ${ref} expired on ${request.expiresAt.slice(0, 10)} before every party signed. The signing links no longer work.`, "The sender can create a new request."];
    for (const to of new Set([...staff, ...signers.map((s) => s.email)])) await base(to, `Expired: ${agreement.id}`, "The signature request expired", msg, `e:${to}`, "expired");
  } else if (outcome === "cancelled") {
    const msg = [`Agreement ${ref} was cancelled${info.note ? ` (${info.note})` : ""}. The signing links no longer work. You do not need to take any action.`];
    for (const to of new Set([...staff, ...signers.map((s) => s.email)])) await base(to, `Cancelled: ${agreement.id}`, "The agreement was cancelled", msg, `c:${to}`, "cancelled");
  }
}

/* ------------------------------------------------------------------ */
/* Cancel, revise, expire                                              */
/* ------------------------------------------------------------------ */

export async function cancelAgreement(deps: Deps, actor: Actor, agreementId: string, reason: string): Promise<Result> {
  const { db } = deps;
  const now = deps.now();
  if (!caps(db, actor, agreementId).cancel) return fail("You don't have permission to cancel this agreement.");
  const agreement = getAgreementRow(db, agreementId);
  if (!agreement) return fail("Agreement not found.");
  if (agreement.status === "fully_signed") return fail("A fully signed agreement can't be cancelled here. Any change after signing needs a signed amendment or termination agreement; ask your attorney.");
  if (agreement.status === "cancelled") return fail("This agreement is already cancelled.");
  const open = requestsFor(db, agreementId).filter((r) => r.status === "active");
  db.transaction((tx) => {
    for (const r of open) {
      tx.update(signatureRequests).set({ status: "cancelled" }).where(eq(signatureRequests.id, r.id)).run();
      revokeAllTokens(tx as unknown as DB, r.id, now);
    }
    setAgreementStatus(tx as unknown as DB, agreement, "cancelled", now);
  });
  recordEvent(db, { agreementId, type: "agreement.cancelled", actorType: "user", actorRef: actor.id, metadata: { reason: reason.trim().slice(0, 500) } }, now);
  for (const r of open) {
    recordEvent(db, { agreementId, versionId: r.versionId, type: "request.cancelled", actorType: "user", actorRef: actor.id, providerRef: r.providerEnvelopeId, metadata: { reason } }, now);
    await voidAtProvider(deps, r, `Cancelled: ${reason}`.slice(0, 200));
    await notifyOutcome(deps, agreementId, r.id, "cancelled", { note: reason.trim().slice(0, 200) });
  }
  return { ok: true, value: true };
}

/**
 * Starts a new version from a version that already went out for signature (or was
 * signed). The old request is withdrawn; nobody's earlier signature carries over.
 */
export async function createRevision(deps: Deps, actor: Actor, agreementId: string, summary: string): Promise<Result<{ versionNo: number }>> {
  const { db } = deps;
  const now = deps.now();
  if (!caps(db, actor, agreementId).edit) return fail("You don't have permission to revise this agreement.");
  const agreement = getAgreementRow(db, agreementId);
  const current = agreement?.currentVersionId ? getVersionRow(db, agreement.currentVersionId) : null;
  if (!agreement || !current) return fail("Agreement not found.");
  if (agreement.status === "cancelled") return fail("This agreement was cancelled.");
  if (!current.signaturesRequested) return fail("This version hasn't been sent for signature, so you can simply edit it.");
  const text = summary.trim().slice(0, 500);
  if (!text) return fail("Briefly describe what is changing.");

  const open = requestsFor(db, agreementId).filter((r) => r.status === "active");
  const versionNo = Math.max(...listVersionNos(db, agreementId)) + 1;
  const versionId = newId();
  db.transaction((tx) => {
    for (const r of open) {
      tx.update(signatureRequests).set({ status: "superseded" }).where(eq(signatureRequests.id, r.id)).run();
      revokeAllTokens(tx as unknown as DB, r.id, now);
    }
    tx.update(agreementVersions).set({ supersededAt: iso(now) }).where(eq(agreementVersions.id, current.id)).run();
    tx.insert(agreementVersions).values({ id: versionId, agreementId, versionNo, data: current.data, attachmentRefs: current.attachmentRefs, templateId: current.templateId, templateSnapshot: current.templateSnapshot, contentHash: current.contentHash, signaturesRequested: false, changeSummary: text, createdBy: actor.id, createdAt: iso(now) }).run();
    tx.update(agreements).set({ currentVersionId: versionId, currentVersionNo: versionNo }).where(eq(agreements.id, agreementId)).run();
    setAgreementStatus(tx as unknown as DB, agreement, "draft", now);
  });
  recordEvent(db, { agreementId, versionId, type: "version.created", actorType: "user", actorRef: actor.id, metadata: { versionNo, basedOn: current.versionNo, summary: text } }, now);
  for (const r of open) {
    recordEvent(db, { agreementId, versionId: r.versionId, type: "request.superseded", actorType: "user", actorRef: actor.id, providerRef: r.providerEnvelopeId, metadata: { newVersionNo: versionNo, summary: text } }, now);
    await voidAtProvider(deps, r, `Superseded by version ${versionNo}`);
    const signers = signersFor(db, r.id);
    for (const s of signers.filter((x) => x.status !== "pending")) {
      await notify(deps, { kind: "cancelled", agreementId, signatureId: s.id, to: s.email, subject: `Agreement ${agreementId} was revised — earlier signing link withdrawn`, heading: "The agreement was revised", paragraphs: [`Agreement ${agreementId} changed (${text}). The earlier version can no longer be signed and any signature on it will not apply to the revised version. You will receive a new invitation when the revised version is ready.`], dedupeKey: `superseded:${r.id}:${s.id}` });
    }
  }
  return { ok: true, value: { versionNo } };
}

const listVersionNos = (db: DB, agreementId: string) => db.select({ n: agreementVersions.versionNo }).from(agreementVersions).where(eq(agreementVersions.agreementId, agreementId)).all().map((r) => r.n);

export async function expireOverdue(deps: Deps): Promise<number> {
  const { db } = deps;
  const now = deps.now();
  const live = db.select().from(signatureRequests).where(eq(signatureRequests.status, "active")).all().filter((r) => new Date(r.expiresAt) < now);
  for (const r of live) {
    const agreement = getAgreementRow(db, r.agreementId)!;
    db.transaction((tx) => {
      tx.update(signatureRequests).set({ status: "expired" }).where(eq(signatureRequests.id, r.id)).run();
      revokeAllTokens(tx as unknown as DB, r.id, now);
      setAgreementStatus(tx as unknown as DB, agreement, "expired", now);
    });
    recordEvent(db, { agreementId: r.agreementId, versionId: r.versionId, type: "request.expired", actorType: "system", providerRef: r.providerEnvelopeId, metadata: { expiresAt: r.expiresAt } }, now);
    await voidAtProvider(deps, r, "Signature request expired");
    await notifyOutcome(deps, r.agreementId, r.id, "expired", {});
  }
  return live.length;
}

/** Scheduled housekeeping: expire old requests, retry failed voids and document saves, remind slow signers. */
export async function runMaintenance(deps: Deps, opts: { reminderAfterDays?: number } = {}) {
  const { db } = deps;
  const now = deps.now();
  const expired = await expireOverdue(deps);
  let retried = 0;
  let reminders = 0;
  for (const r of db.select().from(signatureRequests).all()) {
    if (r.lastProviderStatus === "void_failed" && r.status !== "active") {
      if (await voidAtProvider(deps, r, "Retry: request closed")) {
        db.update(signatureRequests).set({ lastProviderStatus: "voided" }).where(eq(signatureRequests.id, r.id)).run();
        retried++;
      }
    }
    if (r.status === "completed" && !r.signedAttachmentId) {
      if (await saveCompletedDocuments(deps, r)) retried++;
    }
    if (r.status === "active") {
      await reconcileRequest(deps, r.id, "maintenance");
      const days = opts.reminderAfterDays ?? 3;
      for (const s of signersFor(db, r.id)) {
        const ref = s.invitedAt ? new Date(s.invitedAt) : null;
        if ((s.status === "invited" || s.status === "viewed") && ref && now.getTime() - ref.getTime() > days * 86_400_000) {
          const fresh = db.select().from(signatures).where(eq(signatures.id, s.id)).get()!;
          if ((await sendInvitation(deps, fresh, "reminder")).ok) reminders++;
        }
      }
    }
  }
  return { expired, retried, reminders };
}

/** For the "Viewed"/"Outstanding" columns and UI. */
export function currentSigners(db: DB, agreementId: string): { request: RequestRow | null; signers: SignerRow[] } {
  const reqs = requestsFor(db, agreementId);
  const request = reqs.find((r) => r.status === "active") ?? reqs[0] ?? null;
  return { request, signers: request ? signersFor(db, request.id) : [] };
}

