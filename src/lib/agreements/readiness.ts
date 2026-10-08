/**
 * "Is this agreement ready to be reviewed and signed?" Drafts may be saved
 * incomplete; these checks gate submitting for review and sending for signature.
 */
import { buildDocument, findPlaceholders, type AttachmentInfo } from "./document";
import { parseCents, sumCents } from "./money";
import { LIABILITY_CATEGORIES, type AgreementData, type Party } from "./schema";
import { quickIssues } from "./quick";
import type { IssueStep, StepKey } from "./steps";

export interface Issue {
  step: IssueStep;
  message: string;
}

function partyIssues(p: Party, step: "buyer" | "seller", label: string): Issue[] {
  const out: Issue[] = [];
  const add = (message: string) => out.push({ step, message });
  if (!p.legalName) add(`${label}: enter the full legal name.`);
  if (!p.email) add(`${label}: enter an email address (needed to send the signing invitation).`);
  if (!p.address) add(`${label}: enter an address.`);
  if (p.entityName) {
    if (!p.repName) add(`${label}: enter the authorized representative's name.`);
    if (!p.repTitle) add(`${label}: enter the representative's title.`);
    if (!p.authorityBasis) add(`${label}: describe the representative's authority to sign for the entity.`);
  }
  if (!p.signingCapacity) add(`${label}: say whether the signer signs as an individual or for an entity.`);
  return out;
}

export function readinessIssues(
  d: AgreementData,
  ctx: { snapshot: Record<string, string>; attachments: AttachmentInfo[]; agreementId?: string; versionNo?: number },
): Issue[] {
  if (d.mode === "quick") {
    const out = quickIssues(d, ctx);
    const doc = buildDocument({ agreementId: ctx.agreementId ?? "preview", versionNo: ctx.versionNo ?? 1, data: d, snapshot: ctx.snapshot, attachments: ctx.attachments, draft: true });
    const left = findPlaceholders(doc);
    if (left.length) out.push({ step: "quick", message: `Still to fill in: ${left.slice(0, 6).join("; ")}${left.length > 6 ? "…" : ""}.` });
    return out;
  }
  const out: Issue[] = [];
  const add = (step: StepKey, message: string) => out.push({ step, message });

  out.push(...partyIssues(d.buyer, "buyer", "Buyer"), ...partyIssues(d.seller, "seller", "Seller"));
  if (d.buyer.email && d.buyer.email.toLowerCase() === d.seller.email.toLowerCase()) {
    add("seller", "Buyer and Seller need different email addresses so each can receive their own signing invitation.");
  }

  const b = d.business;
  if (!b.name) add("business", "Enter the business name.");
  if (!b.streetAddress) add("business", "Enter the exact street address of the Business.");
  if (!b.owningEntity) add("business", "Identify the legal entity (or person) that owns the Business.");
  if (!b.sellerInterest) add("business", "State the Seller's ownership interest.");
  if (!b.transactionType) add("business", "Select the type of transaction.");
  if (b.transactionType === "other" && !b.transactionOther) add("business", "Describe the other transaction.");
  if (!b.effectiveDate) add("business", "Enter the effective date.");
  if (!b.proposedClosingDate) add("business", "Enter the proposed closing date.");
  if (b.effectiveDate && b.proposedClosingDate && b.proposedClosingDate < b.effectiveDate) add("business", "The closing date is before the effective date.");

  const total = parseCents(d.price.totalPrice);
  if (total === null || total <= 0) add("price", "Enter the total purchase price.");
  const dep = parseCents(d.price.deposit);
  if (d.price.deposit === "") add("price", "Enter the deposit amount (0.00 if there is none).");
  if (total !== null && dep !== null && dep > total) add("price", "The deposit is larger than the purchase price.");
  if (!d.price.paymentMethod) add("price", "Enter the payment method.");
  if (!d.price.depositTerms) add("price", "State the conditions for returning or retaining the deposit.");
  if (!d.price.payments.length) add("price", "Add the payment schedule.");
  d.price.payments.forEach((p, i) => {
    if (parseCents(p.amount) === null) add("price", `Payment ${i + 1}: enter an amount.`);
    if (!p.dueDate) add("price", `Payment ${i + 1}: enter a due date.`);
  });
  if (total !== null && d.price.payments.length) {
    const sum = sumCents(d.price.payments.map((p) => p.amount));
    if (sum !== total) add("price", `The payment schedule totals ${(sum / 100).toFixed(2)} but the purchase price is ${(total / 100).toFixed(2)}.`);
  }

  if (!d.assets.schedule.length && !Object.values(d.assets.categories).includes("included")) {
    add("assets", "Specify at least one included asset or asset category.");
  }
  d.assets.schedule.forEach((a, i) => {
    if (!a.name) add("assets", `Asset row ${i + 1}: enter an item name.`);
  });

  if (!d.closing.closingDate) add("terms", "Enter the closing date.");
  if (!d.closing.location) add("terms", "Enter the closing location or method.");
  if (!d.closing.possessionDate) add("terms", "Enter the date possession transfers.");
  if (!d.closing.controlDate) add("terms", "Enter the date operational control transfers.");
  if (!d.closing.transferDocuments) add("terms", "List the required transfer documents.");
  if (!d.lease.tenure) add("terms", "Say whether the premises are owned or leased.");
  if (d.lease.tenure === "leased") {
    if (!d.lease.landlordName) add("terms", "Enter the landlord's name.");
    if (!d.lease.landlordConsent) add("terms", "Say whether landlord consent is required.");
  }
  for (const [key, label] of LIABILITY_CATEGORIES) {
    const has = d.liabilities.items.some((l) => l.category === key);
    if (!has && !d.liabilities.noneDisclosed.includes(key)) add("terms", `Liabilities: list items for "${label}" or mark that none are disclosed.`);
  }
  d.liabilities.items.forEach((l, i) => {
    if (l.allocation === "tbd") add("terms", `Liability ${i + 1}: choose who is responsible (Buyer assumes or Seller retains).`);
  });
  d.permits.forEach((p) => {
    if (!p.responsible) add("terms", `Permits: choose the responsible party for "${p.name || "(unnamed)"}".`);
  });
  if (!d.conditions.length) add("terms", "Add at least one closing condition.");
  if (d.terms.cureAgreed && !d.terms.cureDays) add("terms", "Enter the number of cure days or turn off the cure period.");
  if (!d.terms.governingLaw) add("terms", "Enter the governing law.");
  if (!d.terms.venue) add("terms", "Enter the court jurisdiction and venue.");
  if (d.terms.arbitration && !d.terms.arbitrationNotes) add("terms", "Describe the arbitration terms or turn arbitration off.");

  const c = d.checkpoints;
  if (!c.sellerAuthorityVerified) add("submit", "Confirm that the Seller's authority to sell has been verified.");
  if (!c.ownershipVerified) add("submit", "Confirm that ownership of the Business, assets, or interests has been verified.");

  // Anything still showing a placeholder in the finished document.
  const doc = buildDocument({
    agreementId: ctx.agreementId ?? "preview",
    versionNo: ctx.versionNo ?? 1,
    data: d,
    snapshot: ctx.snapshot,
    attachments: ctx.attachments,
    draft: true,
  });
  const left = findPlaceholders(doc);
  if (left.length) add("preview", `The document still has ${left.length} unfinished placeholder${left.length === 1 ? "" : "s"}: ${left.slice(0, 6).join("; ")}${left.length > 6 ? "…" : ""}.`);
  return out;
}

/** Points worth double-checking (with an attorney or accountant, if you use one). Prompts, not legal conclusions. */
export function attorneyFlags(d: AgreementData): string[] {
  const f: string[] = [];
  const t = d.business.transactionType;
  if (t === "asset_purchase" || t === "operations_goodwill" || t === "other") {
    f.push("Sale of business assets in New York: the bulk-sale notification rules of the New York Department of Taxation and Finance may apply to the purchaser. Check with whoever advises you (for example an attorney or accountant) whether notice is required and when.");
  }
  if (t === "equity_purchase") f.push("Purchase of equity interests: check the entity's governing documents for consent, transfer, and approval requirements, and the effect on its existing liabilities.");
  if (d.lease.tenure !== "owned") f.push("Commercial lease: assignment usually needs the landlord's written consent. Do not assume the Buyer can occupy until that consent or a new lease is in hand.");
  if (d.lease.separateRealEstate || d.lease.tenure === "owned") f.push("A real estate transaction may need separate documents with their own formalities (for example, a deed with an acknowledgment and recording). Those are not covered by this agreement.");
  const alcohol = d.permits.find((p) => /alcohol/i.test(p.name));
  if (alcohol && alcohol.applicable !== "no") f.push("Alcohol licensing: licenses are typically issued by the regulator to a named licensee and may not be transferable. Confirm the approval process before closing.");
  f.push("Food-service permits and health approvals are generally issued to a specific operator; confirm with the NYC Department of Health and Mental Hygiene whether Buyer needs its own permit.");
  if (d.terms.includeNotary || d.terms.includeWitness) f.push("Witness or notarial acknowledgment is selected: these must be completed in person or by a method that is valid for your situation. This application does not notarize.");
  f.push("Electronic signatures: federal ESIGN and the New York Electronic Signatures and Records Act generally support electronic signing of commercial contracts, but some documents are excluded or have special requirements. Confirm this transaction qualifies.");
  if (d.liabilities.items.some((l) => l.category === "taxes" || l.category === "wages")) f.push("Tax and wage liabilities can follow the business or its successor regardless of what the parties agree. Check with whoever advises you how to protect Buyer.");
  return f;
}
