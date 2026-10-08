/** Test-only fakes and fixtures. Never imported by application code. */
import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { openDatabase, type DB } from "@/lib/db/client";
import type { Deps } from "./deps";
import type { Mailer, OutgoingEmail, SendResult } from "./email/mailer";
import { ProviderError, type EnvelopeState, type SignatureProvider, type SignerSpec, type WebhookVerdict } from "./providers/types";
import { bootstrapAdmin, inviteUser, acceptInvite, type UserRow } from "./users";
import { createAgreement, grantAccess, saveStep, type EditableStep } from "./repo";
import { defaultAgreementData, type AgreementData } from "./schema";
import type { Actor } from "./permissions";

export const WEBHOOK_SECRET = "test-connect-secret";

export class FakeProvider implements SignatureProvider {
  readonly name = "fake-test-provider";
  configured = true;
  failCreate: string | null = null;
  failVoid = false;
  failDownload = false;
  envelopes = new Map<string, { status: string; signers: SignerSpec[]; states: Map<string, string>; pdf: Uint8Array; voidedReason?: string }>();
  sessions: Array<{ envelopeId: string; clientUserId: string; returnUrl: string; auth: unknown }> = [];
  private n = 0;

  configuration(): { ok: true } | { ok: false; missing: string[] } {
    return this.configured ? { ok: true } : { ok: false, missing: ["TEST_KEY"] };
  }
  async createEnvelope(input: { pdf: Uint8Array; signers: SignerSpec[] }) {
    if (this.failCreate) throw new ProviderError(this.failCreate);
    const envelopeId = `env-${++this.n}`;
    this.envelopes.set(envelopeId, { status: "sent", signers: input.signers, states: new Map(input.signers.map((s) => [s.clientUserId, "sent"])), pdf: input.pdf });
    return { envelopeId };
  }
  async createSigningSession(input: { envelopeId: string; signer: { clientUserId: string }; returnUrl: string; authentication: unknown }) {
    const e = this.envelopes.get(input.envelopeId);
    if (!e || e.status === "voided") throw new ProviderError("envelope not available");
    this.sessions.push({ envelopeId: input.envelopeId, clientUserId: input.signer.clientUserId, returnUrl: input.returnUrl, auth: input.authentication });
    return { url: `https://sign.example.test/${input.envelopeId}/${input.signer.clientUserId}` };
  }
  async getEnvelope(envelopeId: string): Promise<EnvelopeState> {
    const e = this.envelopes.get(envelopeId);
    if (!e) throw new ProviderError("not found", 404);
    const all = [...e.states.values()];
    const status = e.status === "voided" ? "voided" : all.some((s) => s === "declined") ? "declined" : all.every((s) => s === "completed") ? "completed" : "sent";
    return {
      envelopeId,
      status,
      completedAt: status === "completed" ? "2026-10-20T12:00:00Z" : undefined,
      voidedReason: e.voidedReason,
      recipients: e.signers.map((s) => ({ recipientId: s.recipientId, clientUserId: s.clientUserId, email: s.email, status: e.states.get(s.clientUserId)!, signedAt: e.states.get(s.clientUserId) === "completed" ? "2026-10-20T12:00:00Z" : undefined })),
    };
  }
  async voidEnvelope(envelopeId: string, reason: string) {
    if (this.failVoid) throw new ProviderError("void failed");
    const e = this.envelopes.get(envelopeId)!;
    e.status = "voided";
    e.voidedReason = reason;
  }
  async downloadSigned() {
    if (this.failDownload) throw new ProviderError("download failed");
    const d = await PDFDocument.create();
    d.addPage();
    return d.save();
  }
  async downloadCertificate() {
    const d = await PDFDocument.create();
    d.addPage();
    return d.save();
  }
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerdict {
    const sig = headers.get("x-docusign-signature-1");
    const expected = createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("base64");
    if (sig !== expected) return { ok: false, reason: "bad signature" };
    const j = JSON.parse(rawBody) as { event?: string; data?: { envelopeId?: string } };
    return { ok: true, envelopeId: j.data?.envelopeId, eventType: j.event };
  }

  // --- test controls: what the real provider does when a person acts ---
  setState(envelopeId: string, clientUserId: string, state: string) {
    this.envelopes.get(envelopeId)!.states.set(clientUserId, state);
  }
  clientIdFor(envelopeId: string, party: "buyer" | "seller") {
    return this.envelopes.get(envelopeId)!.signers.find((s) => s.party === party)!.clientUserId;
  }
  private hooks = 0;
  /** A validly signed notification. Each call differs slightly (like real timestamps) unless `same` is given. */
  webhookFor(envelopeId: string, same?: number) {
    const body = JSON.stringify({ event: "recipient-completed", generatedDateTime: `t${same ?? ++this.hooks}`, data: { envelopeId } });
    return { body, headers: new Headers({ "x-docusign-signature-1": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("base64") }) };
  }
}

export class FakeMailer implements Mailer {
  readonly name = "fake-test-mailer";
  isConfigured = true;
  sent: OutgoingEmail[] = [];
  failNext = 0;
  configured() {
    return this.isConfigured;
  }
  async send(email: OutgoingEmail): Promise<SendResult> {
    if (this.failNext > 0) {
      this.failNext--;
      return { ok: false, error: "simulated outage" };
    }
    if (this.sent.some((e) => e.idempotencyKey === email.idempotencyKey)) return { ok: true, messageId: `msg-${email.idempotencyKey}` };
    this.sent.push(email);
    return { ok: true, messageId: `msg-${this.sent.length}` };
  }
  linkTo(toEmail: string): string {
    const mail = [...this.sent].reverse().find((e) => e.to === toEmail && /\/sign\//.test(e.text));
    const m = mail?.text.match(/https?:\/\/\S+\/sign\/[A-Za-z0-9_-]+/);
    if (!m) throw new Error(`no signing link emailed to ${toEmail}`);
    return m[0];
  }
  lastCode(toEmail: string): string {
    const mail = [...this.sent].reverse().find((e) => e.to === toEmail && /one-time code/.test(e.text));
    const m = mail?.text.match(/code is (\d{6})/);
    if (!m) throw new Error(`no code emailed to ${toEmail}`);
    return m[1];
  }
}

export interface World {
  db: DB;
  deps: Deps;
  provider: FakeProvider;
  mailer: FakeMailer;
  admin: UserRow;
  buyer: UserRow;
  seller: UserRow;
  outsider: UserRow;
  clock: { now: Date };
}

export const actorOf = (u: UserRow): Actor => ({ id: u.id, role: u.role as Actor["role"] });

export async function world(): Promise<World> {
  const db = openDatabase(":memory:");
  const provider = new FakeProvider();
  const mailer = new FakeMailer();
  const clock = { now: new Date("2026-10-08T12:00:00Z") };
  const deps: Deps = { db, provider, mailer, baseUrl: "https://app.example.test", now: () => clock.now };
  const a = await bootstrapAdmin(db, "admin@example.test", "Admin", "correct horse battery");
  const mk = async (email: string, role: "buyer" | "seller") => {
    const inv = inviteUser(db, { email, name: email.split("@")[0], role });
    if (!inv.ok) throw new Error(inv.error);
    const acc = await acceptInvite(db, inv.value.inviteToken, "a-long-test-password");
    if (!acc.ok) throw new Error(acc.error);
    return acc.value;
  };
  return { db, deps, provider, mailer, clock, admin: a.ok ? a.value : (undefined as never), buyer: await mk("buyer-user@example.test", "buyer"), seller: await mk("seller-user@example.test", "seller"), outsider: await mk("outsider@example.test", "buyer") };
}

/** A complete, valid agreement (all fictional data). */
export function completeData(): AgreementData {
  const d = defaultAgreementData();
  d.buyer = { ...d.buyer, legalName: "SAMPLE Buyer Person", email: "buyer@sample.test", address: "1 Sample Way, Staten Island, NY", phone: "555-0100", signingCapacity: "individual" };
  d.seller = { ...d.seller, legalName: "SAMPLE Seller Person", entityName: "SAMPLE Seller LLC", entityType: "LLC", email: "seller@sample.test", address: "2 Sample Ave, Staten Island, NY", repName: "SAMPLE Seller Person", repTitle: "Member", authorityBasis: "Operating agreement, section 4 (to be verified)", signingCapacity: "entity_representative" };
  d.business = { ...d.business, streetAddress: "100 Sample St", owningEntity: "SAMPLE Seller LLC", sellerInterest: "100%", transactionType: "asset_purchase", effectiveDate: "2026-10-10", proposedClosingDate: "2026-12-01" };
  d.assets.categories = { kitchenEquipment: "included", goodwill: "included" };
  d.assets.schedule = [{ name: "Espresso machine", description: "2-group", quantity: "1", condition: "Used", serial: "SN-1", agreedValue: "2500.00", status: "included" }];
  d.price = { ...d.price, totalPrice: "100000.00", deposit: "10000.00", depositDue: "2026-10-15", paymentMethod: "Wire transfer", depositTerms: "Returned if landlord consent is not obtained", payments: [{ description: "Deposit", amount: "10000.00", dueDate: "2026-10-15", status: "scheduled" }, { description: "Balance at closing", amount: "90000.00", dueDate: "2026-12-01", status: "scheduled" }] };
  d.closing = { closingDate: "2026-12-01", location: "Attorney's office", possessionDate: "2026-12-01", controlDate: "2026-12-01", transferDocuments: "Bill of sale\nAssignment of lease" };
  d.lease = { ...d.lease, tenure: "leased", landlordName: "SAMPLE Landlord", landlordConsent: "required", assignmentTerms: "Assignment subject to landlord consent" };
  d.liabilities = { items: [{ category: "vendors", description: "Supplier balance", creditor: "SAMPLE Supplier", amount: "500.00", allocation: "seller_retains", notes: "" }], noneDisclosed: ["debts", "taxes", "equipmentLoans", "liens", "claims", "wages", "customerOrders", "giftCards", "other"] };
  d.permits = d.permits.map((p) => ({ ...p, applicable: "yes" as const, responsible: "buyer" as const }));
  d.terms = { ...d.terms, venue: "Courts located in New York County, subject to counsel review" };
  d.checkpoints = { ...d.checkpoints, sellerAuthorityVerified: true, ownershipVerified: true, leaseReviewed: true, attorneyReviewed: true, attorneyName: "SAMPLE Attorney" };
  return d;
}

export function applyData(db: DB, actor: Actor, agreementId: string, d: AgreementData) {
  const steps: Array<[EditableStep, unknown]> = [
    ["buyer", { buyer: d.buyer }],
    ["seller", { seller: d.seller }],
    ["business", { business: d.business }],
    ["assets", { assets: d.assets }],
    ["price", { price: d.price }],
    ["terms", { lease: d.lease, closing: d.closing, liabilities: d.liabilities, conditions: d.conditions, permits: d.permits, employment: d.employment, terms: d.terms, additionalConditions: d.additionalConditions }],
    ["submit", { checkpoints: d.checkpoints }],
  ];
  for (const [step, slice] of steps) {
    const r = saveStep(db, actor, agreementId, step, slice);
    if (!r.ok) throw new Error(`${step}: ${r.error} ${JSON.stringify(r.fields)}`);
  }
}

export function newCompleteAgreement(w: World, mutate?: (d: AgreementData) => void) {
  const actor = actorOf(w.admin);
  const created = createAgreement(w.db, actor);
  if (!created.ok) throw new Error(created.error);
  const id = created.value.agreement.id;
  const d = completeData();
  mutate?.(d);
  applyData(w.db, actor, id, d);
  grantAccess(w.db, actor, id, w.buyer.email, "viewer", "buyer");
  grantAccess(w.db, actor, id, w.seller.email, "viewer", "seller");
  return id;
}

/** A complete quick (short-form) agreement, fictional data. */
export function newQuickAgreement(w: World, mutate?: (d: AgreementData) => void) {
  const actor = actorOf(w.admin);
  const created = createAgreement(w.db, actor, { mode: "quick" });
  if (!created.ok) throw new Error(created.error);
  const id = created.value.agreement.id;
  const d = completeData();
  d.buyer.entityName = "";
  d.buyer.signingCapacity = "";
  d.seller.signingCapacity = "";
  mutate?.(d);
  const r = saveStep(w.db, actor, id, "quick", { buyer: d.buyer, seller: d.seller, business: d.business, assets: d.assets, price: d.price, lease: d.lease, closing: d.closing, quick: { buyerAssumes: "" }, checkpoints: d.checkpoints });
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.fields)}`);
  grantAccess(w.db, actor, id, w.buyer.email, "viewer", "buyer");
  grantAccess(w.db, actor, id, w.seller.email, "viewer", "seller");
  return id;
}
