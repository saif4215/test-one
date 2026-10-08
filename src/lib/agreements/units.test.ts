import { createHmac, generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { emailLog, userSessions, users } from "@/lib/db/schema";
import { openDatabase } from "@/lib/db/client";
import { buildDocument, findPlaceholders } from "./document";
import { ResendMailer, verifySvix } from "./email/mailer";
import { centsToString, formatMoney, parseCents, remainingBalance, sumCents } from "./money";
import { capabilities } from "./permissions";
import { DocuSignProvider } from "./providers/docusign";
import { defaultAgreementData } from "./schema";
import { decryptBytes, encryptBytes, hashPassword, passwordProblem, rateLimit, resetRateLimits, verifyPassword } from "./security";
import { deriveSigningStatus } from "./status";
import { validateUpload } from "./storage";
import { DEFAULT_CLAUSES, fillTokens } from "./template";
import { acceptInvite, bootstrapAdmin, bootstrapFromEnv, inviteUser, login, userForSession } from "./users";
import { handleEmailWebhook } from "./webhooks";
import { FakeMailer, FakeProvider } from "./test-helpers";
import { notify } from "./notify";

describe("money", () => {
  it("parses and formats exact cents", () => {
    expect(parseCents("1,250.50")).toBe(125050);
    expect(parseCents("$10")).toBe(1000);
    expect(parseCents("10.999")).toBeNull();
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("")).toBeNull();
    expect(centsToString(5)).toBe("0.05");
    expect(formatMoney("1234.5")).toBe("$1,234.50");
    expect(sumCents(["0.10", "0.20", "bad", null])).toBe(30); // no floating-point drift
  });
  it("computes the remaining balance", () => {
    expect(remainingBalance("1000", "250.25")).toBe(74975);
    expect(remainingBalance("", "10")).toBeNull();
    expect(remainingBalance("1000", "-1")).toBeNull();
  });
});

describe("security helpers", () => {
  it("hashes passwords, never stores plaintext, and enforces a minimum length", async () => {
    const h = await hashPassword("a-very-long-password");
    expect(h).not.toContain("a-very-long-password");
    expect(await verifyPassword("a-very-long-password", h)).toBe(true);
    expect(await verifyPassword("wrong-password-123", h)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(passwordProblem("short")).toMatch(/12/);
    expect(passwordProblem("a-very-long-password")).toBeNull();
  });
  it("encrypts with AES-GCM and detects tampering", () => {
    const key = Buffer.alloc(32, 9);
    const enc = encryptBytes(Buffer.from("secret contract"), key);
    expect(enc.includes("secret contract")).toBe(false);
    expect(decryptBytes(enc, key).toString()).toBe("secret contract");
    enc[enc.length - 1] ^= 1;
    expect(() => decryptBytes(enc, key)).toThrow();
    expect(() => decryptBytes(encryptBytes(Buffer.from("x"), key), null)).toThrow(/FILE_ENCRYPTION_KEY/);
  });
  it("rate limits per key and window", () => {
    resetRateLimits();
    expect([1, 2, 3].map(() => rateLimit("k", 2, 1000, 0).ok)).toEqual([true, true, false]);
    expect(rateLimit("k", 2, 1000, 2000).ok).toBe(true);
  });
});

describe("upload validation", () => {
  it("checks type, size, and real signatures", () => {
    expect(validateUpload("a.pdf", Buffer.from("%PDF-1.7\n%%EOF")).ok).toBe(true);
    expect(validateUpload("a.png", Buffer.from("%PDF-1.7")).ok).toBe(false);
    expect(validateUpload("a.exe", Buffer.from("MZ")).ok).toBe(false);
    expect(validateUpload("../../etc/passwd.pdf", Buffer.from("%PDF-1.7")).ok && true).toBe(true);
    const r = validateUpload("../../x/evil name.pdf", Buffer.from("%PDF-1.7"));
    expect(r.ok && r.value.fileName).toBe("evil name.pdf");
    expect(validateUpload("big.pdf", Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(11 * 1024 * 1024)])).ok).toBe(false);
    expect(validateUpload("e.pdf", Buffer.alloc(0)).ok).toBe(false);
  });
});

describe("accounts and sessions", () => {
  let db: ReturnType<typeof openDatabase>;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  it("invites, activates, and signs in; locks after repeated failures; ends idle sessions", async () => {
    const inv = inviteUser(db, { email: "New@Example.test", name: "New", role: "buyer" });
    if (!inv.ok) throw new Error(inv.error);
    expect(inv.value.user.email).toBe("new@example.test");
    const stored = db.select().from(users).get()!;
    expect(stored.inviteTokenHash).not.toBe(inv.value.inviteToken); // only a hash is stored
    expect((await acceptInvite(db, "bad-token", "a-long-test-password")).ok).toBe(false);
    expect((await acceptInvite(db, inv.value.inviteToken, "short")).ok).toBe(false);
    expect((await acceptInvite(db, inv.value.inviteToken, "a-long-test-password")).ok).toBe(true);
    expect((await acceptInvite(db, inv.value.inviteToken, "a-long-test-password")).ok).toBe(false); // single use

    const t0 = new Date("2026-10-08T12:00:00Z");
    for (let i = 0; i < 5; i++) expect((await login(db, "new@example.test", "wrong-wrong-wrong", {}, t0)).ok).toBe(false);
    const locked = await login(db, "new@example.test", "a-long-test-password", {}, t0);
    expect(!locked.ok && locked.error).toMatch(/Too many/);
    const later = new Date(t0.getTime() + 16 * 60_000);
    const ok = await login(db, "new@example.test", "a-long-test-password", {}, later);
    if (!ok.ok) throw new Error(ok.error);
    expect(db.select().from(userSessions).get()!.tokenHash).not.toBe(ok.value.token);
    expect(userForSession(db, ok.value.token, new Date(later.getTime() + 60_000))?.email).toBe("new@example.test");
    expect(userForSession(db, ok.value.token, new Date(later.getTime() + 3 * 3600_000))).toBeNull(); // idle > 2h
    expect(userForSession(db, "garbage", later)).toBeNull();
  });
  it("re-inviting an active user resets their password and signs them out", async () => {
    const inv = inviteUser(db, { email: "p@example.test", name: "P", role: "seller" });
    if (!inv.ok) throw new Error(inv.error);
    await acceptInvite(db, inv.value.inviteToken, "first-long-password");
    const s = await login(db, "p@example.test", "first-long-password");
    if (!s.ok) throw new Error(s.error);
    const again = inviteUser(db, { email: "p@example.test", name: "ignored", role: "admin" });
    if (!again.ok) throw new Error(again.error);
    expect(again.value.user.role).toBe("seller"); // role is not changed by a reset
    expect((await login(db, "p@example.test", "first-long-password")).ok).toBe(true); // old password works until the link is used
    await acceptInvite(db, again.value.inviteToken, "second-long-password");
    expect(userForSession(db, s.value.token)).toBeNull();
    expect((await login(db, "p@example.test", "first-long-password")).ok).toBe(false);
    expect((await login(db, "p@example.test", "second-long-password")).ok).toBe(true);
  });
  it("an unknown email and a wrong password give the same message", async () => {
    await bootstrapAdmin(db, "a@example.test", "A", "a-long-test-password");
    const a = await login(db, "a@example.test", "nope-nope-nope-1");
    const b = await login(db, "ghost@example.test", "nope-nope-nope-1");
    expect(!a.ok && !b.ok && a.error === b.error).toBe(true);
  });
  it("disabled users can't use an existing session", async () => {
    await bootstrapAdmin(db, "a@example.test", "A", "a-long-test-password");
    const s = await login(db, "a@example.test", "a-long-test-password");
    if (!s.ok) throw new Error();
    db.update(users).set({ status: "disabled" }).where(eq(users.id, s.value.user.id)).run();
    expect(userForSession(db, s.value.token)).toBeNull();
  });
  it("creates the first administrator from the environment only when no users exist", async () => {
    const env = { BOOTSTRAP_ADMIN_EMAIL: "first@example.test", BOOTSTRAP_ADMIN_PASSWORD: "a-long-test-password" } as unknown as NodeJS.ProcessEnv;
    expect(await bootstrapFromEnv(db, {} as NodeJS.ProcessEnv)).toBe(false);
    expect(await bootstrapFromEnv(db, env)).toBe(true);
    expect((await login(db, "first@example.test", "a-long-test-password")).ok).toBe(true);
    expect(await bootstrapFromEnv(db, { ...env, BOOTSTRAP_ADMIN_EMAIL: "second@example.test" } as NodeJS.ProcessEnv)).toBe(false);
  });
  it("role capabilities", () => {
    expect(capabilities("viewer")).toMatchObject({ view: true, edit: false, send: false, cancel: false });
    expect(capabilities("editor")).toMatchObject({ edit: true, send: true, cancel: false });
    expect(capabilities("owner")).toMatchObject({ cancel: true, manageAccess: true });
    expect(capabilities(null).view).toBe(false);
  });
});

describe("agreement text never invents facts", () => {
  it("an empty agreement shows explicit placeholders and no names, prices, or addresses", () => {
    const doc = buildDocument({ agreementId: "X", versionNo: 1, data: defaultAgreementData(), snapshot: DEFAULT_CLAUSES, attachments: [], draft: true });
    const text = JSON.stringify(doc.blocks);
    const missing = findPlaceholders(doc);
    expect(missing).toEqual(expect.arrayContaining(["Seller legal name", "total purchase price", "effective date", "exact street address"]));
    expect(/\$\d/.test(text)).toBe(false); // no dollar amount appears anywhere
    expect(text.includes("DRAFT")).toBe(true);
    expect(text.includes("not a substitute for legal advice")).toBe(true);
  });
  it("does not treat an asset purchase as a purchase of the entity, and keeps liabilities from transferring automatically", () => {
    const d = defaultAgreementData();
    d.business.transactionType = "asset_purchase";
    const text = JSON.stringify(buildDocument({ agreementId: "X", versionNo: 1, data: d, snapshot: DEFAULT_CLAUSES, attachments: [], draft: true }).blocks);
    for (const phrase of ["It is not a purchase of", "Liabilities do not transfer automatically", "does not bind any creditor", "No license, permit, or registration is represented to be transferable"]) {
      expect(text.includes(phrase), phrase).toBe(true);
    }
  });
  it("fills tokens and marks unknown ones", () => {
    expect(fillTokens("A {{x}} B {{y}} {{zClause}}", { x: "1", y: "", zClause: "" })).toBe("A 1 B [TO BE COMPLETED: y] ");
  });
});

describe("signing status derivation", () => {
  it("only reports fully signed when everyone signed AND the provider verified", () => {
    const s = (...st: string[]) => st.map((status) => ({ status }));
    expect(deriveSigningStatus(s("signed", "signed"), false)).toBe("partially_signed");
    expect(deriveSigningStatus(s("signed", "signed"), true)).toBe("fully_signed");
    expect(deriveSigningStatus(s("signed", "invited"), true)).toBe("partially_signed");
    expect(deriveSigningStatus(s("viewed", "pending"), false)).toBe("viewed");
    expect(deriveSigningStatus(s("invited", "pending"), false)).toBe("sent_for_signature");
    expect(deriveSigningStatus(s("signed", "declined"), true)).toBe("declined");
  });
});

describe("DocuSign adapter (HTTP mocked; NOT a substitute for a sandbox test)", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const env = { DOCUSIGN_ENV: "demo", DOCUSIGN_INTEGRATION_KEY: "ik", DOCUSIGN_USER_ID: "uid", DOCUSIGN_ACCOUNT_ID: "acct", DOCUSIGN_PRIVATE_KEY: privateKey, DOCUSIGN_CONNECT_HMAC_SECRET: "hmac-secret" } as unknown as NodeJS.ProcessEnv;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/oauth/token")) return j({ access_token: "tok", expires_in: 3600 });
    if (url.endsWith("/oauth/userinfo")) return j({ accounts: [{ account_id: "acct", base_uri: "https://demo.docusign.net" }] });
    if (url.endsWith("/envelopes")) return j({ envelopeId: "E1" });
    if (url.endsWith("/views/recipient")) return j({ url: "https://demo.docusign.net/sign/abc" });
    if (url.includes("/envelopes/E1?include=recipients")) return j({ envelopeId: "E1", status: "Sent", recipients: { signers: [{ recipientId: "1", clientUserId: "c1", email: "a@b.c", status: "Completed", signedDateTime: "2026-10-09T10:00:00Z" }] } });
    return j({ errorCode: "NOPE", message: "unexpected" }, 404);
  }) as unknown as typeof fetch;
  const provider = new DocuSignProvider(env, fakeFetch, () => 1_800_000_000_000);

  it("reports missing configuration without calling the network", () => {
    expect(new DocuSignProvider({} as NodeJS.ProcessEnv, fakeFetch).configuration()).toMatchObject({ ok: false });
    expect(provider.configuration()).toEqual({ ok: true });
  });
  it("authenticates with a signed JWT, then builds the envelope with embedded signers and positioned tabs", async () => {
    const out = await provider.createEnvelope({ pdf: new Uint8Array([37, 80, 68, 70]), documentName: "d.pdf", subject: "s", signers: [{ party: "buyer", name: "B", email: "b@x.test", clientUserId: "c1", routingOrder: 1, recipientId: "1", sign: { page: 3, x: 68.4, y: 174 }, date: { page: 3, x: 338, y: 180 } }] });
    expect(out.envelopeId).toBe("E1");
    const tokenCall = calls.find((c) => c.url.endsWith("/oauth/token"))!;
    const form = new URLSearchParams(String(tokenCall.init!.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [h, c] = form.get("assertion")!.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toMatchObject({ iss: "ik", sub: "uid", aud: "account-d.docusign.com", scope: "signature impersonation" });
    const env1 = calls.find((x) => x.url.endsWith("/envelopes"))!;
    expect(env1.url).toBe("https://demo.docusign.net/restapi/v2.1/accounts/acct/envelopes");
    expect((env1.init!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(String(env1.init!.body));
    expect(body.status).toBe("sent");
    expect(body.recipients.signers[0]).toMatchObject({ clientUserId: "c1", routingOrder: "1", recipientId: "1" });
    expect(body.recipients.signers[0].tabs.signHereTabs[0]).toMatchObject({ pageNumber: "3", xPosition: "68", yPosition: "174" });
    expect(body.documents[0].documentBase64).toBe(Buffer.from([37, 80, 68, 70]).toString("base64"));
  });
  it("requests an embedded signing view that states how the signer was authenticated", async () => {
    const s = await provider.createSigningSession({ envelopeId: "E1", signer: { name: "B", email: "b@x.test", clientUserId: "c1", recipientId: "1" }, returnUrl: "https://app/return", authentication: { method: "Email", at: "2026-10-09T09:00:00Z", assertionId: "sig-1" } });
    expect(s.url).toContain("docusign");
    const call = calls.filter((x) => x.url.endsWith("/views/recipient")).pop()!;
    expect(JSON.parse(String(call.init!.body))).toMatchObject({ returnUrl: "https://app/return", authenticationMethod: "Email", clientUserId: "c1" });
  });
  it("maps provider status to normalized lower case", async () => {
    const e = await provider.getEnvelope("E1");
    expect(e.status).toBe("sent");
    expect(e.recipients[0]).toMatchObject({ clientUserId: "c1", status: "completed", signedAt: "2026-10-09T10:00:00Z" });
  });
  it("surfaces provider errors as readable errors", async () => {
    await expect(provider.getEnvelope("missing")).rejects.toThrow(/NOPE/);
  });
  it("verifies Connect HMAC signatures", () => {
    const body = JSON.stringify({ event: "envelope-completed", data: { envelopeId: "E1" } });
    const good = createHmac("sha256", "hmac-secret").update(body).digest("base64");
    expect(provider.verifyWebhook(body, new Headers({ "x-docusign-signature-1": good }))).toMatchObject({ ok: true, envelopeId: "E1" });
    expect(provider.verifyWebhook(body, new Headers({ "x-docusign-signature-1": "AAAA" })).ok).toBe(false);
    expect(provider.verifyWebhook(body, new Headers()).ok).toBe(false);
    expect(provider.verifyWebhook(body + " ", new Headers({ "x-docusign-signature-1": good })).ok).toBe(false); // body changed
  });
});

describe("email", () => {
  const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "Maruf Cafe <deals@example.test>" } as unknown as NodeJS.ProcessEnv;
  it("sends through Resend with an idempotency key, and reports failures honestly", async () => {
    let seen: { headers: Record<string, string>; body: Record<string, unknown> } | null = null;
    const ok = new ResendMailer(env, (async (_u: string, init: RequestInit) => {
      seen = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(await ok.send({ to: "a@b.test", subject: "S", text: "t", html: "<p>t</p>", idempotencyKey: "k1" })).toEqual({ ok: true, messageId: "msg_1" });
    expect(seen!.headers["Idempotency-Key"]).toBe("k1");
    expect(seen!.body.from).toBe("Maruf Cafe <deals@example.test>");
    const rejected = new ResendMailer(env, (async () => new Response(JSON.stringify({ name: "validation_error", message: "bad from" }), { status: 422 })) as unknown as typeof fetch);
    expect((await rejected.send({ to: "a@b.test", subject: "S", text: "t", html: "t", idempotencyKey: "k" })).ok).toBe(false);
    const down = new ResendMailer(env, (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch);
    const r = await down.send({ to: "a@b.test", subject: "S", text: "t", html: "t", idempotencyKey: "k" });
    expect(!r.ok && r.error).toMatch(/ECONNRESET/);
    expect((await new ResendMailer({} as NodeJS.ProcessEnv).send({ to: "a@b.test", subject: "S", text: "t", html: "t", idempotencyKey: "k" })).ok).toBe(false);
  });

  const secret = `whsec_${Buffer.from("svix-test-secret-bytes").toString("base64")}`;
  const signed = (body: string, id = "evt_1", ts = String(Math.floor(Date.now() / 1000))) => ({
    body,
    headers: new Headers({ "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${createHmac("sha256", Buffer.from("svix-test-secret-bytes")).update(`${id}.${ts}.${body}`).digest("base64")}` }),
  });
  it("verifies Svix webhook signatures and rejects stale or altered ones", () => {
    const { body, headers } = signed("{}");
    expect(verifySvix(body, headers, secret).ok).toBe(true);
    expect(verifySvix("{ }", headers, secret).ok).toBe(false);
    const old = signed("{}", "e", String(Math.floor(Date.now() / 1000) - 3600));
    expect(verifySvix(old.body, old.headers, secret).ok).toBe(false);
    expect(verifySvix(body, new Headers(), secret).ok).toBe(false);
  });

  it("records delivery only when the email service confirms it, ignoring duplicates and unsigned events", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "x@example.test";
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const db = openDatabase(":memory:");
    const mailer = new FakeMailer();
    const deps = { db, provider: new FakeProvider(), mailer, baseUrl: "https://app.test", now: () => new Date() };
    await notify(deps, { kind: "invitation", agreementId: null, to: "a@b.test", subject: "S", heading: "H", paragraphs: ["p"], dedupeKey: "d1" });
    const row = db.select().from(emailLog).get()!;
    expect(row.status).toBe("accepted"); // accepted, NOT delivered
    expect(row.deliveredAt).toBeNull();
    const evt = (type: string, id: string) => signed(JSON.stringify({ type, data: { email_id: row.providerMessageId } }), id);
    const bad = await handleEmailWebhook(deps, "{}", new Headers({ "svix-id": "x", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,AAAA" }));
    expect(bad.status).toBe(401);
    expect(db.select().from(emailLog).get()!.status).toBe("accepted");
    const d1 = evt("email.delivered", "evt_d");
    expect((await handleEmailWebhook(deps, d1.body, d1.headers)).status).toBe(200);
    expect(db.select().from(emailLog).get()!.status).toBe("delivered");
    expect((await handleEmailWebhook(deps, d1.body, d1.headers)).body).toBe("duplicate");
    const late = evt("email.delivery_delayed", "evt_late");
    await handleEmailWebhook(deps, late.body, late.headers);
    expect(db.select().from(emailLog).get()!.status).toBe("delivered"); // never moves backwards
  });

  it("de-duplicates notifications and allows a retry after failure", async () => {
    const db = openDatabase(":memory:");
    const mailer = new FakeMailer();
    const deps = { db, provider: new FakeProvider(), mailer, baseUrl: "https://app.test", now: () => new Date() };
    const n = { kind: "cancelled" as const, to: "a@b.test", subject: "S", heading: "H", paragraphs: ["p"], dedupeKey: "same" };
    mailer.failNext = 1;
    expect((await notify(deps, n)).status).toBe("failed");
    expect((await notify(deps, n)).status).toBe("accepted"); // retried
    expect((await notify(deps, n)).status).toBe("skipped"); // not sent twice
    expect(mailer.sent).toHaveLength(1);
  });
});
