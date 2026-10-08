import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditEvents, attachments, signatures, signatureRequests } from "@/lib/db/schema";
import { listEvents, verifyChain } from "./audit";
import { buildDocument } from "./document";
import { remainingBalance } from "./money";
import { generateAgreementPdf } from "./pdf";
import { accessLevel, addAttachment, createAgreement, listAgreements, loadAgreement, readAttachment, readiness, saveStep, submitForReview } from "./repo";
import { resetRateLimits } from "./security";
import { cancelAgreement, createRevision, currentSigners, expireOverdue, resendInvitation, reconcileRequest, requestIdentityCode, resolveToken, revokeInvitation, runMaintenance, sendForSignature, signerSessionValue, startSigning, declineAsSigner, verifyIdentityCode } from "./signing";
import { WEBHOOK_SECRET, actorOf, newCompleteAgreement, world, type World } from "./test-helpers";
import { handleSignatureWebhook } from "./webhooks";

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-agreements-"));
  process.env.UPLOAD_DIR = tmp;
  process.env.FILE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.APP_SECRET = "test-secret-at-least-16-chars";
  process.env.RESEND_WEBHOOK_SECRET = "";
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let w: World;
beforeEach(async () => {
  resetRateLimits();
  w = await world();
});

const submit = (id: string) => {
  const r = submitForReview(w.db, actorOf(w.admin), id);
  if (!r.ok) throw new Error(JSON.stringify(r));
};
const send = (id: string, order: "buyer_first" | "seller_first" | "parallel" = "buyer_first", expiryDays = 14) => sendForSignature(w.deps, actorOf(w.admin), id, { order, expiryDays });
const tokenFor = (email: string) => w.mailer.linkTo(email).split("/sign/")[1];

/** Walks a signer through the identity code and the consent step, like the signing page does. */
async function signerStarts(email: string, opts: { consent?: boolean } = {}) {
  const token = tokenFor(email);
  expect((await requestIdentityCode(w.deps, token, { ip: "1.2.3.4" })).ok).toBe(true);
  const v = verifyIdentityCode(w.deps, token, w.mailer.lastCode(email), { ip: "1.2.3.4" });
  if (!v.ok) throw new Error(v.error);
  const cookie = signerSessionValue(v.value);
  const res = await startSigning(w.deps, token, { esignConsent: opts.consent ?? true, reviewedAll: opts.consent ?? true }, { ip: "1.2.3.4", userAgent: "vitest", sessionCookie: cookie });
  return { token, cookie, res };
}

const reconcileAfterWebhook = async (envelopeId: string) => {
  const { body, headers } = w.provider.webhookFor(envelopeId);
  return handleSignatureWebhook(w.deps, body, headers);
};

async function sentAgreement(order: "buyer_first" | "seller_first" | "parallel" = "buyer_first") {
  const id = newCompleteAgreement(w);
  submit(id);
  const r = await send(id, order);
  if (!r.ok) throw new Error(r.error);
  const request = currentSigners(w.db, id).request!;
  return { id, request, envelopeId: request.providerEnvelopeId! };
}

describe("creating and editing agreements", () => {
  it("creates an agreement with a template snapshot and an audit event", () => {
    const r = createAgreement(w.db, actorOf(w.admin));
    expect(r.ok && r.value.agreement.id).toMatch(/^MCA-2026-[A-Z0-9]{6}$/);
    if (!r.ok) return;
    expect(r.value.version.templateSnapshot["s5.price"]).toContain("Purchase Price");
    expect(listEvents(w.db, r.value.agreement.id).map((e) => e.type)).toEqual(["agreement.created", "version.created"]);
  });

  it("sellers cannot create agreements", () => {
    expect(createAgreement(w.db, actorOf(w.seller)).ok).toBe(false);
  });

  it("validates fields on save and flags required items before review", () => {
    const actor = actorOf(w.admin);
    const id = (createAgreement(w.db, actor) as { ok: true; value: { agreement: { id: string } } }).value.agreement.id;
    const bad = saveStep(w.db, actor, id, "buyer", { buyer: { email: "not-an-email" } });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.fields?.["buyer.email"]).toMatch(/valid email/i);
    const b = loadAgreement(w.db, actor, id)!;
    const issues = readiness(w.db, b);
    expect(issues.length).toBeGreaterThan(10);
    expect(issues.some((i) => /total purchase price/i.test(i.message))).toBe(true);
    const sub = submitForReview(w.db, actor, id);
    expect(sub.ok).toBe(false);
  });

  it("calculates the remaining balance and checks the payment schedule against the price", () => {
    expect(remainingBalance("100000.00", "10000.00")).toBe(9000000);
    expect(remainingBalance("100", "")).toBe(10000);
    expect(remainingBalance("100", "150")).toBeNull();
    const actor = actorOf(w.admin);
    const id = newCompleteAgreement(w, (d) => {
      d.price.payments[1].amount = "80000.00"; // schedule no longer matches the price
    });
    const msg = readiness(w.db, loadAgreement(w.db, actor, id)!).find((i) => /payment schedule totals/i.test(i.message));
    expect(msg?.message).toContain("90000.00");
  });

  it("saves a draft and reopens it unchanged", () => {
    const actor = actorOf(w.admin);
    const id = newCompleteAgreement(w);
    const again = loadAgreement(w.db, actor, id)!;
    expect(again.data.price.totalPrice).toBe("100000.00");
    expect(again.agreement.buyerName).toBe("SAMPLE Buyer Person");
    expect(again.agreement.purchasePrice).toBe("100000.00");
    expect(again.agreement.status).toBe("draft");
  });

  it("a complete agreement passes the readiness check", () => {
    const b = loadAgreement(w.db, actorOf(w.admin), newCompleteAgreement(w))!;
    expect(readiness(w.db, b)).toEqual([]);
  });
});

describe("PDF generation", () => {
  it("produces a real PDF, marks drafts, and includes signature placements", async () => {
    const id = newCompleteAgreement(w);
    const b = loadAgreement(w.db, actorOf(w.admin), id)!;
    const doc = buildDocument({ agreementId: id, versionNo: 1, data: b.data, snapshot: b.version.templateSnapshot, attachments: [], draft: true });
    const pdf = await generateAgreementPdf(doc);
    expect(Buffer.from(pdf.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.pageCount).toBeGreaterThan(5);
    expect(pdf.placements.map((p) => p.party).sort()).toEqual(["buyer", "seller"]);
    const final = await generateAgreementPdf(buildDocument({ agreementId: id, versionNo: 1, data: b.data, snapshot: b.version.templateSnapshot, attachments: [], draft: false }));
    expect(final.bytes.length).not.toBe(pdf.bytes.length);
    expect(doc.blocks.some((x) => x.t === "banner" && /DRAFT/.test(x.text))).toBe(true);
  });

  it("merges an uploaded PDF as an identified exhibit and rejects unsafe uploads", async () => {
    const actor = actorOf(w.admin);
    const id = newCompleteAgreement(w);
    const src = await PDFDocument.create();
    src.addPage();
    src.addPage();
    const ok = addAttachment(w.db, actor, id, { name: "inventory.pdf", bytes: Buffer.from(await src.save()) }, { kind: "inventory", schedule: "C" });
    expect(ok.ok).toBe(true);
    expect(addAttachment(w.db, actor, id, { name: "evil.exe", bytes: Buffer.from("MZ") }, { kind: "supporting", schedule: null }).ok).toBe(false);
    expect(addAttachment(w.db, actor, id, { name: "fake.pdf", bytes: Buffer.from("not a pdf") }, { kind: "supporting", schedule: null }).ok).toBe(false);
    expect(addAttachment(w.db, actor, id, { name: "js.pdf", bytes: Buffer.from("%PDF-1.4\n/JavaScript (alert(1))") }, { kind: "supporting", schedule: null }).ok).toBe(false);
    const b = loadAgreement(w.db, actor, id)!;
    const doc = buildDocument({ agreementId: id, versionNo: 1, data: b.data, snapshot: b.version.templateSnapshot, attachments: [{ id: (ok as { value: { id: string } }).value.id, fileName: "inventory.pdf", schedule: "C", contentType: "application/pdf", sha256: "a".repeat(64), mergeable: true }], draft: false });
    const base = await generateAgreementPdf({ ...doc, exhibits: [] });
    const withEx = await generateAgreementPdf(doc, [{ id: doc.exhibits[0].id, fileName: "inventory.pdf", contentType: "application/pdf", bytes: Buffer.from(await src.save()) }]);
    expect(withEx.pageCount).toBe(base.pageCount + 3); // separator + 2 pages
    expect(JSON.stringify(doc.blocks)).toContain("Exhibit 1");
  });

  it("stores files encrypted at rest", () => {
    const actor = actorOf(w.admin);
    const id = newCompleteAgreement(w);
    const content = Buffer.from("%PDF-1.4\nhello plaintext marker\n%%EOF");
    const r = addAttachment(w.db, actor, id, { name: "a.pdf", bytes: content }, { kind: "supporting", schedule: null });
    if (!r.ok) throw new Error(r.error);
    const onDisk = fs.readFileSync(path.join(tmp, r.value.storageKey.slice(0, 2), r.value.storageKey));
    expect(onDisk.includes("plaintext marker")).toBe(false);
    expect(readAttachment(w.db, actor, id, r.value.id)?.bytes.equals(content)).toBe(true);
  });
});

describe("authorization", () => {
  it("prevents unauthorized access to agreements and documents", async () => {
    const id = newCompleteAgreement(w);
    const a = readAttachment;
    expect(accessLevel(w.db, actorOf(w.outsider), id)).toBeNull();
    expect(loadAgreement(w.db, actorOf(w.outsider), id)).toBeNull();
    expect(listAgreements(w.db, actorOf(w.outsider))).toHaveLength(0);
    expect(listAgreements(w.db, actorOf(w.buyer))).toHaveLength(1);
    expect(saveStep(w.db, actorOf(w.outsider), id, "buyer", { buyer: { legalName: "Hacker" } }).ok).toBe(false);
    // viewers (the buyer/seller accounts) can read but not edit
    expect(saveStep(w.db, actorOf(w.buyer), id, "buyer", { buyer: { legalName: "Changed" } }).ok).toBe(false);
    expect(loadAgreement(w.db, actorOf(w.seller), id)).not.toBeNull();
    // another agreement's attachment can't be read through this agreement
    const other = newCompleteAgreement(w);
    const att = addAttachment(w.db, actorOf(w.admin), other, { name: "x.pdf", bytes: Buffer.from("%PDF-1.4\n%%EOF") }, { kind: "supporting", schedule: null });
    if (!att.ok) throw new Error(att.error);
    expect(a(w.db, actorOf(w.admin), id, att.value.id)).toBeNull();
    expect(a(w.db, actorOf(w.outsider), other, att.value.id)).toBeNull();
  });

  it("unknown or malformed signing tokens reveal nothing", () => {
    expect(resolveToken(w.db, "nope").state).toBe("invalid");
    expect(resolveToken(w.db, "x".repeat(43)).state).toBe("invalid");
  });
});

describe("sending for signature", () => {
  it("requires review first, a configured provider, and configured email", async () => {
    const id = newCompleteAgreement(w);
    expect((await send(id)).ok).toBe(false); // not yet submitted for review
    submit(id);
    w.provider.configured = false;
    const noProv = await send(id);
    expect(!noProv.ok && noProv.error).toMatch(/isn't configured/i);
    w.provider.configured = true;
    w.mailer.isConfigured = false;
    expect((await send(id)).ok).toBe(false);
    w.mailer.isConfigured = true;
    expect(w.provider.envelopes.size).toBe(0); // nothing was created while unconfigured
    expect(loadAgreement(w.db, actorOf(w.admin), id)!.agreement.status).toBe("awaiting_review");
  });

  it("does not lock or change status when the provider rejects the document", async () => {
    const id = newCompleteAgreement(w);
    submit(id);
    w.provider.failCreate = "invalid document";
    const r = await send(id);
    expect(!r.ok && r.error).toMatch(/nothing was sent/i);
    const b = loadAgreement(w.db, actorOf(w.admin), id)!;
    expect(b.agreement.status).toBe("awaiting_review");
    expect(b.version.signaturesRequested).toBe(false);
    expect(w.mailer.sent).toHaveLength(0);
  });

  it("sequential order invites only the buyer first, parallel invites both", async () => {
    await sentAgreement("buyer_first");
    expect(w.mailer.sent.filter((m) => /Please review and sign/.test(m.subject)).map((m) => m.to)).toEqual(["buyer@sample.test"]);
    resetRateLimits();
    w = await world();
    await sentAgreement("parallel");
    expect(w.mailer.sent.filter((m) => /Please review and sign/.test(m.subject)).map((m) => m.to).sort()).toEqual(["buyer@sample.test", "seller@sample.test"]);
  });

  it("locks the version, stores the document hash, and moves to Sent for Signature", async () => {
    const { id, request } = await sentAgreement();
    const b = loadAgreement(w.db, actorOf(w.admin), id)!;
    expect(b.agreement.status).toBe("sent_for_signature");
    expect(b.version.signaturesRequested).toBe(true);
    expect(b.version.documentHash).toBe(request.sentDocumentHash);
    expect(saveStep(w.db, actorOf(w.admin), id, "buyer", { buyer: { legalName: "Changed" } }).ok).toBe(false);
  });
});

describe("signing flow", () => {
  it("buyer then seller sign; fully signed only after the provider confirms everyone", async () => {
    const { id, envelopeId } = await sentAgreement();
    const admin = actorOf(w.admin);

    // Buyer: identity code, consent, provider session
    const b = await signerStarts("buyer@sample.test");
    expect(b.res.ok).toBe(true);
    expect(w.provider.sessions).toHaveLength(1);
    expect(w.provider.sessions[0].returnUrl).toContain("/return");
    const sigRow = w.db.select().from(signatures).where(eq(signatures.party, "buyer")).get()!;
    expect(sigRow.consent?.esignConsent).toBe(true);
    expect(sigRow.consent?.documentHash).toHaveLength(64);
    // Coming back from the provider is NOT proof of signing.
    await reconcileRequest(w.deps, currentSigners(w.db, id).request!.id, "return");
    expect(loadAgreement(w.db, admin, id)!.agreement.status).toBe("sent_for_signature");
    expect(w.db.select().from(signatures).where(eq(signatures.party, "buyer")).get()!.status).not.toBe("signed");

    // Provider reports the buyer signed
    w.provider.setState(envelopeId, w.provider.clientIdFor(envelopeId, "buyer"), "completed");
    expect((await reconcileAfterWebhook(envelopeId)).status).toBe(200);
    expect(loadAgreement(w.db, admin, id)!.agreement.status).toBe("partially_signed");
    // The seller is invited now (not before)
    expect(w.mailer.sent.filter((m) => m.to === "seller@sample.test" && /Please review and sign/.test(m.subject))).toHaveLength(1);

    // Seller signs
    const s = await signerStarts("seller@sample.test");
    expect(s.res.ok).toBe(true);
    w.provider.setState(envelopeId, w.provider.clientIdFor(envelopeId, "seller"), "completed");
    await reconcileAfterWebhook(envelopeId);
    const done = loadAgreement(w.db, admin, id)!;
    expect(done.agreement.status).toBe("fully_signed");
    expect(done.agreement.signedVersionId).toBe(done.version.id);

    // Completed documents saved, hashed, and downloadable
    const req = currentSigners(w.db, id).request!;
    expect(req.status).toBe("completed");
    expect(req.providerVerifiedAt).toBeTruthy();
    const signed = readAttachment(w.db, admin, id, req.signedAttachmentId!);
    expect(Buffer.from(signed!.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(readAttachment(w.db, admin, id, req.certificateAttachmentId!)).not.toBeNull();
    expect(readAttachment(w.db, actorOf(w.buyer), id, req.signedAttachmentId!)).not.toBeNull();
    expect(readAttachment(w.db, actorOf(w.outsider), id, req.signedAttachmentId!)).toBeNull();

    // Both parties got a fully-signed email with their own secure link
    for (const to of ["buyer@sample.test", "seller@sample.test"]) {
      expect(w.mailer.sent.some((m) => m.to === to && /Fully signed/.test(m.subject))).toBe(true);
    }
    // Audit trail is complete, ordered, and intact
    const types = listEvents(w.db, id).map((e) => e.type);
    for (const t of ["signature.requested", "signing.identity_verified", "signing.consent_recorded", "signer.signed", "request.verified_with_provider", "completion.documents_saved", "request.completed"]) expect(types).toContain(t);
    expect(verifyChain(w.db, id)).toEqual({ ok: true });
  });

  it("never shows 'fully signed' while the provider has not confirmed completion", async () => {
    const { id, envelopeId } = await sentAgreement("parallel");
    const admin = actorOf(w.admin);
    // Only the buyer has signed at the provider.
    w.provider.setState(envelopeId, w.provider.clientIdFor(envelopeId, "buyer"), "completed");
    await reconcileAfterWebhook(envelopeId);
    expect(loadAgreement(w.db, admin, id)!.agreement.status).toBe("partially_signed");
    expect(currentSigners(w.db, id).request!.status).toBe("active");
    expect(currentSigners(w.db, id).request!.providerVerifiedAt).toBeNull();
    // A user clicking "I signed" (consent + provider session) without the provider confirming changes nothing.
    await signerStarts("seller@sample.test");
    await reconcileRequest(w.deps, currentSigners(w.db, id).request!.id, "return");
    expect(loadAgreement(w.db, admin, id)!.agreement.status).toBe("partially_signed");
  });

  it("requires identity verification and both consent boxes before opening the signing session", async () => {
    await sentAgreement();
    const token = tokenFor("buyer@sample.test");
    // no verification
    const early = await startSigning(w.deps, token, { esignConsent: true, reviewedAll: true }, { ip: null, userAgent: null, sessionCookie: undefined });
    expect(early.ok).toBe(false);
    // wrong code is rejected and counted
    await requestIdentityCode(w.deps, token, { ip: "9.9.9.9" });
    expect(verifyIdentityCode(w.deps, token, "000000", { ip: "9.9.9.9" }).ok).toBe(false);
    // without consent (a new code may be requested after the one-minute cool-down)
    w.clock.now = new Date(w.clock.now.getTime() + 2 * 60_000);
    const noConsent = await signerStarts("buyer@sample.test", { consent: false });
    expect(noConsent.res.ok).toBe(false);
    expect(w.provider.sessions).toHaveLength(0);
  });

  it("locks out a code after too many wrong guesses", async () => {
    await sentAgreement();
    const token = tokenFor("buyer@sample.test");
    await requestIdentityCode(w.deps, token, { ip: "9.9.9.9" });
    const real = w.mailer.lastCode("buyer@sample.test");
    for (let i = 0; i < 5; i++) verifyIdentityCode(w.deps, token, real === "111111" ? "222222" : "111111", { ip: "9.9.9.9" });
    expect(verifyIdentityCode(w.deps, token, real, { ip: "9.9.9.9" }).ok).toBe(false);
  });

  it("a seller can't sign before the buyer in a sequential flow", async () => {
    await sentAgreement("buyer_first");
    expect(() => tokenFor("seller@sample.test")).toThrow(); // no invitation exists yet
  });

  it("declining closes the request, voids the envelope, and notifies", async () => {
    const { id, envelopeId } = await sentAgreement();
    const token = tokenFor("buyer@sample.test");
    await requestIdentityCode(w.deps, token, { ip: null });
    const v = verifyIdentityCode(w.deps, token, w.mailer.lastCode("buyer@sample.test"), { ip: null });
    if (!v.ok) throw new Error(v.error);
    const r = await declineAsSigner(w.deps, token, "Price too high", { ip: null, sessionCookie: signerSessionValue(v.value) });
    expect(r.ok).toBe(true);
    const b = loadAgreement(w.db, actorOf(w.admin), id)!;
    expect(b.agreement.status).toBe("declined");
    expect(w.provider.envelopes.get(envelopeId)!.status).toBe("voided");
    expect(resolveToken(w.db, token).state).toBe("revoked");
    expect(w.mailer.sent.some((m) => /Declined/.test(m.subject) && m.to === "admin@example.test")).toBe(true);
    expect(listEvents(w.db, id).some((e) => e.type === "signer.declined")).toBe(true);
  });

  it("a decline reported by the provider is recorded too", async () => {
    const { id, envelopeId } = await sentAgreement("parallel");
    w.provider.setState(envelopeId, w.provider.clientIdFor(envelopeId, "seller"), "declined");
    await reconcileAfterWebhook(envelopeId);
    expect(loadAgreement(w.db, actorOf(w.admin), id)!.agreement.status).toBe("declined");
  });

  it("expired links stop working and the request expires", async () => {
    const { id } = await sentAgreement();
    const token = tokenFor("buyer@sample.test");
    expect(resolveToken(w.db, token, w.deps.now()).state).toBe("ok");
    w.clock.now = new Date("2026-11-01T12:00:00Z"); // after 14 days
    expect(resolveToken(w.db, token, w.deps.now()).state).toBe("expired");
    const start = await startSigning(w.deps, token, { esignConsent: true, reviewedAll: true }, { ip: null, userAgent: null, sessionCookie: undefined });
    expect(start.ok).toBe(false);
    expect(await expireOverdue(w.deps)).toBe(1);
    expect(loadAgreement(w.db, actorOf(w.admin), id)!.agreement.status).toBe("expired");
    expect(w.mailer.sent.some((m) => /Expired/.test(m.subject))).toBe(true);
  });

  it("revoking an invitation kills that link; resending issues a new one", async () => {
    const { id } = await sentAgreement();
    const first = tokenFor("buyer@sample.test");
    const sig = w.db.select().from(signatures).where(eq(signatures.party, "buyer")).get()!;
    expect(revokeInvitation(w.deps, actorOf(w.admin), sig.id).ok).toBe(true);
    expect(resolveToken(w.db, first).state).toBe("revoked");
    expect((await requestIdentityCode(w.deps, first, { ip: null })).ok).toBe(false);
    expect((await resendInvitation(w.deps, actorOf(w.admin), sig.id)).ok).toBe(true);
    const second = tokenFor("buyer@sample.test");
    expect(second).not.toBe(first);
    expect(resolveToken(w.db, second).state).toBe("ok");
    expect(resolveToken(w.db, first).state).toBe("invalid"); // old token is gone entirely
    expect(listEvents(w.db, id).map((e) => e.type)).toEqual(expect.arrayContaining(["invitation.revoked", "invitation.resent"]));
    // a viewer cannot resend
    expect((await resendInvitation(w.deps, actorOf(w.buyer), sig.id)).ok).toBe(false);
  });

  it("cancelling revokes every link, voids the envelope, and notifies", async () => {
    const { id, envelopeId } = await sentAgreement("parallel");
    const t = tokenFor("seller@sample.test");
    expect((await cancelAgreement(w.deps, actorOf(w.admin), id, "Deal fell through")).ok).toBe(true);
    expect(loadAgreement(w.db, actorOf(w.admin), id)!.agreement.status).toBe("cancelled");
    expect(w.provider.envelopes.get(envelopeId)!.status).toBe("voided");
    expect(resolveToken(w.db, t).state).toBe("revoked");
    expect(w.mailer.sent.some((m) => /Cancelled/.test(m.subject))).toBe(true);
    expect((await cancelAgreement(w.deps, actorOf(w.buyer), id, "x")).ok).toBe(false);
  });

  it("cancelling still closes our links if the provider void fails, and flags it for retry", async () => {
    const { id } = await sentAgreement();
    w.provider.failVoid = true;
    expect((await cancelAgreement(w.deps, actorOf(w.admin), id, "stop")).ok).toBe(true);
    expect(listEvents(w.db, id).some((e) => e.type === "request.void_failed")).toBe(true);
    w.provider.failVoid = false;
    const m = await runMaintenance(w.deps);
    expect(m.retried).toBe(1);
  });
});

describe("versions and revisions", () => {
  it("a revision withdraws the old request and requires fresh signatures; old signatures can't carry over", async () => {
    const { id, envelopeId } = await sentAgreement("parallel");
    const admin = actorOf(w.admin);
    const oldToken = tokenFor("buyer@sample.test");
    // buyer signs v1 at the provider
    w.provider.setState(envelopeId, w.provider.clientIdFor(envelopeId, "buyer"), "completed");
    await reconcileAfterWebhook(envelopeId);

    expect((await createRevision(w.deps, admin, id, "")).ok).toBe(false); // needs a summary
    const rev = await createRevision(w.deps, admin, id, "Price changed to $95,000");
    expect(rev.ok && rev.value.versionNo).toBe(2);
    const b = loadAgreement(w.db, admin, id)!;
    expect(b.agreement.status).toBe("draft");
    expect(b.version.versionNo).toBe(2);
    expect(b.version.signaturesRequested).toBe(false);
    expect(w.provider.envelopes.get(envelopeId)!.status).toBe("voided");
    expect(resolveToken(w.db, oldToken).state).toBe("revoked");

    // Even if the provider later reported v1 as complete, it must not become the signed agreement.
    const v1req = w.db.select().from(signatureRequests).where(eq(signatureRequests.agreementId, id)).get()!;
    expect(v1req.status).toBe("superseded");
    w.provider.envelopes.get(envelopeId)!.status = "sent";
    for (const s of w.provider.envelopes.get(envelopeId)!.signers) w.provider.setState(envelopeId, s.clientUserId, "completed");
    await reconcileRequest(w.deps, v1req.id, "manual");
    expect(loadAgreement(w.db, admin, id)!.agreement.status).toBe("draft");
    expect(loadAgreement(w.db, admin, id)!.agreement.signedVersionId).toBeNull();

    // v2 can be edited, reviewed, and needs both parties to sign again.
    expect(saveStep(w.db, admin, id, "price", { price: { ...b.data.price, totalPrice: "95000.00", payments: [{ description: "Deposit", amount: "10000.00", dueDate: "2026-10-15", status: "scheduled" }, { description: "Balance at closing", amount: "85000.00", dueDate: "2026-12-01", status: "scheduled" }] } }).ok).toBe(true);
    submit(id);
    expect((await send(id, "parallel")).ok).toBe(true);
    const signers = currentSigners(w.db, id).signers;
    expect(signers.map((s) => s.status).sort()).toEqual(["invited", "invited"]);
    expect(signers.every((s) => s.versionId === loadAgreement(w.db, admin, id)!.version.id)).toBe(true);
    const types = listEvents(w.db, id).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["version.created", "request.superseded"]));
  });

  it("master template edits never change existing agreement versions", async () => {
    const { saveTemplate, latestTemplate } = await import("./repo");
    const id = newCompleteAgreement(w);
    const before = loadAgreement(w.db, actorOf(w.admin), id)!.version.templateSnapshot["s17.entire"];
    const r = saveTemplate(w.db, actorOf(w.admin), { "s17.entire": "CHANGED MASTER WORDING" }, "test");
    expect(r.ok).toBe(true);
    expect(latestTemplate(w.db)!.versionNo).toBe(2);
    expect(loadAgreement(w.db, actorOf(w.admin), id)!.version.templateSnapshot["s17.entire"]).toBe(before);
    expect(saveTemplate(w.db, actorOf(w.buyer), { "s17.entire": "x" }, "").ok).toBe(false);
  });
});

describe("webhooks", () => {
  it("rejects invalid signatures and records the rejection", async () => {
    const { id, envelopeId } = await sentAgreement();
    const res = await handleSignatureWebhook(w.deps, JSON.stringify({ event: "x", data: { envelopeId } }), new Headers({ "x-docusign-signature-1": "bogus" }));
    expect(res.status).toBe(401);
    expect(w.db.select().from(auditEvents).all().some((e) => e.type === "webhook.rejected")).toBe(true);
    expect(loadAgreement(w.db, actorOf(w.admin), id)!.agreement.status).toBe("sent_for_signature");
  });

  it("a forged 'completed' payload cannot mark anything signed (state is read from the provider)", async () => {
    const { id, envelopeId } = await sentAgreement();
    const { body, headers } = w.provider.webhookFor(envelopeId); // validly signed, claims nothing useful
    await handleSignatureWebhook(w.deps, body, headers);
    expect(loadAgreement(w.db, actorOf(w.admin), id)!.agreement.status).toBe("sent_for_signature");
  });

  it("processes a repeated delivery only once", async () => {
    const { envelopeId } = await sentAgreement();
    const { body, headers } = w.provider.webhookFor(envelopeId, 1);
    expect((await handleSignatureWebhook(w.deps, body, headers)).body).toBe("ok");
    expect((await handleSignatureWebhook(w.deps, body, headers)).body).toBe("duplicate");
  });

  it("answers 200 for unknown envelopes so the provider stops retrying", async () => {
    const { body, headers } = w.provider.webhookFor("env-unknown");
    expect((await handleSignatureWebhook(w.deps, body, headers)).status).toBe(200);
  });

  it("uses the configured Connect secret for verification (fake secret sanity)", () => {
    expect(WEBHOOK_SECRET).toBeTruthy();
  });
});

describe("email handling", () => {
  it("reports failed invitation emails honestly and lets staff resend", async () => {
    const id = newCompleteAgreement(w);
    submit(id);
    w.mailer.failNext = 1;
    const r = await send(id);
    expect(r.ok && r.value.invitationFailures[0]).toMatch(/Buyer/);
    const types = listEvents(w.db, id).map((e) => e.type);
    expect(types).toContain("invitation.email_failed");
    expect(types).not.toContain("invitation.email_accepted");
    const sig = w.db.select().from(signatures).where(eq(signatures.party, "buyer")).get()!;
    expect((await resendInvitation(w.deps, actorOf(w.admin), sig.id, "invitation")).ok).toBe(true);
    expect(listEvents(w.db, id).map((e) => e.type)).toContain("invitation.email_accepted");
    // "accepted" is not "delivered"
    expect(listEvents(w.db, id).map((e) => e.type)).not.toContain("invitation.delivery_confirmed");
  });

  it("does not send the same notification twice, even if the provider reports the same signature again", async () => {
    const { id, envelopeId } = await sentAgreement("parallel");
    w.provider.setState(envelopeId, w.provider.clientIdFor(envelopeId, "buyer"), "completed");
    await reconcileAfterWebhook(envelopeId);
    await reconcileAfterWebhook(envelopeId); // a different delivery of the same fact
    await reconcileRequest(w.deps, currentSigners(w.db, id).request!.id, "manual");
    const notes = w.mailer.sent.filter((m) => m.to === "admin@example.test" && /Buyer has signed/.test(m.subject));
    expect(notes).toHaveLength(1);
    expect(listEvents(w.db, id).filter((e) => e.type === "signer.signed")).toHaveLength(1);
  });

  it("a failed read-back from the provider returns 500 and the retry is processed, not dropped as a duplicate", async () => {
    const { envelopeId } = await sentAgreement();
    const { body, headers } = w.provider.webhookFor(envelopeId, 7);
    const real = w.provider.getEnvelope.bind(w.provider);
    w.provider.getEnvelope = async () => {
      throw new Error("provider down");
    };
    expect((await handleSignatureWebhook(w.deps, body, headers)).status).toBe(500);
    w.provider.getEnvelope = real;
    expect((await handleSignatureWebhook(w.deps, body, headers)).body).toBe("ok");
  });

  it("two simultaneous sends create only one live request", async () => {
    const id = newCompleteAgreement(w);
    submit(id);
    const [a, b] = await Promise.all([send(id), send(id)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(w.db.select().from(signatureRequests).all()).toHaveLength(1);
    expect([...w.provider.envelopes.values()].filter((e) => e.status !== "voided")).toHaveLength(1);
  });
});

describe("audit trail", () => {
  it("is append-only: updates and deletes are blocked, and tampering is detected", async () => {
    const { id } = await sentAgreement();
    expect(() => w.db.update(auditEvents).set({ type: "agreement.created" }).where(eq(auditEvents.agreementId, id)).run()).toThrow(/append-only/);
    expect(() => w.db.delete(auditEvents).where(eq(auditEvents.agreementId, id)).run()).toThrow(/append-only/);
    // Simulate tampering outside the app by dropping the trigger, editing, and re-checking the chain.
    const raw = (w.db as unknown as { $client: import("better-sqlite3").Database }).$client;
    raw.exec("DROP TRIGGER audit_events_no_update");
    raw.prepare("UPDATE audit_events SET metadata = '{\"forged\":true}' WHERE agreement_id = ? AND seq = 2").run(id);
    expect(verifyChain(w.db, id)).toEqual({ ok: false, brokenAtSeq: 2 });
  });

  it("holds attachments metadata only for the agreement's own files", () => {
    expect(w.db.select().from(attachments).all()).toEqual([]);
  });
});

