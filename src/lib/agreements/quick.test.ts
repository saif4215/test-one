import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildDocument, findPlaceholders } from "./document";
import { generateAgreementPdf } from "./pdf";
import { loadAgreement, readiness, saveStep, submitForReview, createAgreement } from "./repo";
import { resetRateLimits } from "./security";
import { currentSigners, reconcileRequest, requestIdentityCode, sendForSignature, signerSessionValue, startSigning, verifyIdentityCode } from "./signing";
import { actorOf, newQuickAgreement, world, type World } from "./test-helpers";
import { defaultAgreementData } from "./schema";
import { DEFAULT_CLAUSES } from "./template";

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mc-quick-"));
  process.env.UPLOAD_DIR = tmp;
  process.env.FILE_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  process.env.APP_SECRET = "test-secret-at-least-16-chars";
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let w: World;
beforeEach(async () => {
  resetRateLimits();
  w = await world();
});

const text = (blocks: unknown) => JSON.stringify(blocks);

describe("quick agreement", () => {
  it("creates in quick mode and fills the unasked fields with stated defaults, not invented facts", () => {
    const id = newQuickAgreement(w);
    const b = loadAgreement(w.db, actorOf(w.admin), id)!;
    expect(b.data.mode).toBe("quick");
    expect(b.data.business.proposedClosingDate).toBe(b.data.closing.closingDate);
    expect(b.data.price.payments.map((p) => [p.description, p.amount])).toEqual([["Deposit", "10000.00"], ["Balance at closing", "90000.00"]]);
    expect(b.data.buyer.signingCapacity).toBe("individual");
    expect(b.data.seller.signingCapacity).toBe("entity_representative"); // a company was named
    expect(b.data.seller.repName).toBe("SAMPLE Seller Person");
  });

  it("a complete quick agreement is ready, and an empty one lists plain-language problems", () => {
    const ok = loadAgreement(w.db, actorOf(w.admin), newQuickAgreement(w))!;
    expect(readiness(w.db, ok)).toEqual([]);
    const created = createAgreement(w.db, actorOf(w.admin), { mode: "quick" });
    if (!created.ok) throw new Error();
    const empty = loadAgreement(w.db, actorOf(w.admin), created.value.agreement.id)!;
    const issues = readiness(w.db, empty).map((i) => i.message);
    expect(issues.length).toBeGreaterThan(8);
    expect(issues.some((m) => /total price/i.test(m))).toBe(true);
    expect(submitForReview(w.db, actorOf(w.admin), created.value.agreement.id).ok).toBe(false);
  });

  it("seller authority and ownership checks are still required, attorney review is not asked", () => {
    const id = newQuickAgreement(w, (d) => {
      d.checkpoints.sellerAuthorityVerified = false;
      d.checkpoints.ownershipVerified = false;
      d.checkpoints.attorneyReviewed = false;
    });
    const msgs = readiness(w.db, loadAgreement(w.db, actorOf(w.admin), id)!).map((i) => i.message);
    expect(msgs).toHaveLength(2);
    expect(msgs.join(" ")).not.toMatch(/attorney/i);
  });

  it("a company seller or buyer must say what proves they can sign for it", () => {
    const id = newQuickAgreement(w, (d) => {
      d.seller.authorityBasis = "";
    });
    expect(readiness(w.db, loadAgreement(w.db, actorOf(w.admin), id)!).some((i) => /can sign for/i.test(i.message))).toBe(true);
  });

  it("produces a short document with the key protections and no invented values", async () => {
    const empty = buildDocument({ agreementId: "X", versionNo: 1, data: { ...defaultAgreementData(), mode: "quick" }, snapshot: DEFAULT_CLAUSES, attachments: [], draft: true });
    expect(findPlaceholders(empty).length).toBeGreaterThan(5);
    expect(/\$\d/.test(text(empty.blocks))).toBe(false);

    const id = newQuickAgreement(w);
    const b = loadAgreement(w.db, actorOf(w.admin), id)!;
    const doc = buildDocument({ agreementId: id, versionNo: 1, data: b.data, snapshot: b.version.templateSnapshot, attachments: [], draft: false });
    expect(findPlaceholders(doc)).toEqual([]);
    const all = text(doc.blocks);
    for (const phrase of [
      "Anything not listed here is not sold",
      "does not change what Seller or the Business owes anyone else",
      "No license, permit, or registration",
      "Nothing here promises that Buyer can use the premises",
      "No penalty or forfeiture applies",
      "not a substitute for legal advice",
    ]) expect(all.includes(phrase), phrase).toBe(true);
    expect(all.includes("DRAFT")).toBe(false); // execution copy
    const pdf = await generateAgreementPdf(doc);
    expect(pdf.pageCount).toBeLessThanOrEqual(6);
    expect(pdf.placements.map((p) => p.party).sort()).toEqual(["buyer", "seller"]);
    const full = await generateAgreementPdf(buildDocument({ agreementId: id, versionNo: 1, data: { ...b.data, mode: "full" }, snapshot: b.version.templateSnapshot, attachments: [], draft: false }));
    expect(pdf.pageCount).toBeLessThan(full.pageCount);
  });

  it("the equity and goodwill choices don't claim an asset-only sale", () => {
    const id = newQuickAgreement(w, (d) => {
      d.business.transactionType = "equity_purchase";
    });
    const b = loadAgreement(w.db, actorOf(w.admin), id)!;
    const all = text(buildDocument({ agreementId: id, versionNo: 1, data: b.data, snapshot: b.version.templateSnapshot, attachments: [], draft: true }).blocks);
    expect(all.includes("the company that owns the Business")).toBe(true);
    expect(all.includes("Buyer is not buying")).toBe(false);
  });

  it("editing a submitted quick agreement returns it to draft, and the fixed payment schedule follows the price", () => {
    const actor = actorOf(w.admin);
    const id = newQuickAgreement(w);
    expect(submitForReview(w.db, actor, id).ok).toBe(true);
    const b = loadAgreement(w.db, actor, id)!;
    const r = saveStep(w.db, actor, id, "quick", { price: { ...b.data.price, totalPrice: "80000.00", deposit: "5000.00" } });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(loadAgreement(w.db, actor, id)!.data.buyer.legalName).toBe("SAMPLE Buyer Person"); // untouched parts are kept
    const after = loadAgreement(w.db, actor, id)!;
    expect(after.agreement.status).toBe("draft");
    expect(after.data.price.payments.map((p) => p.amount)).toEqual(["5000.00", "75000.00"]);
  });

  it("goes through the same secure send, sign, and provider-verified completion as the full agreement", async () => {
    const actor = actorOf(w.admin);
    const id = newQuickAgreement(w);
    expect(submitForReview(w.db, actor, id).ok).toBe(true);
    const sent = await sendForSignature(w.deps, actor, id, { order: "parallel", expiryDays: 7 });
    if (!sent.ok) throw new Error(sent.error);
    const request = currentSigners(w.db, id).request!;
    const env = request.providerEnvelopeId!;
    // buyer verifies and gets a signing session
    const link = w.mailer.linkTo("buyer@sample.test");
    const token = link.split("/sign/")[1];
    await requestIdentityCode(w.deps, token, { ip: null });
    const v = verifyIdentityCode(w.deps, token, w.mailer.lastCode("buyer@sample.test"), { ip: null });
    if (!v.ok) throw new Error(v.error);
    const started = await startSigning(w.deps, token, { esignConsent: true, reviewedAll: true }, { ip: null, userAgent: null, sessionCookie: signerSessionValue(v.value) });
    expect(started.ok).toBe(true);
    // still not signed until the provider says so
    await reconcileRequest(w.deps, request.id, "return");
    expect(loadAgreement(w.db, actor, id)!.agreement.status).toBe("sent_for_signature");
    for (const party of ["buyer", "seller"] as const) w.provider.setState(env, w.provider.clientIdFor(env, party), "completed");
    await reconcileRequest(w.deps, request.id, "manual");
    expect(loadAgreement(w.db, actor, id)!.agreement.status).toBe("fully_signed");
  });
});
