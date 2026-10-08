/**
 * The quick (short-form) agreement: one page of questions, a short plain-English
 * contract, and the same secure e-signature flow. It reuses the full data model;
 * answers the short form doesn't ask for are filled with neutral, stated defaults
 * (nothing is invented about the parties, price, assets, debts, or premises).
 */
import { dash, describeParty, exhibitLabel, fmtDate, type AttachmentInfo, type Block, type BuildInput, type BuiltDocument } from "./docCommon";
import { formatCents, formatMoney, parseCents, remainingBalance, sumCents } from "./money";
import type { Issue } from "./readiness";
import type { AgreementData } from "./schema";
import { tbc, LEGAL_NOTICE } from "./template";

const DEFAULT_TRANSFER_DOCS = "A bill of sale and any other papers needed to hand over what is sold";

/** Fills the fields the quick form doesn't ask for, so every part of the shared data model stays consistent. */
export function applyQuickDefaults(d: AgreementData): AgreementData {
  const next = structuredClone(d);
  next.mode = "quick";
  next.business.proposedClosingDate = next.closing.closingDate;
  next.closing.possessionDate = next.closing.closingDate;
  next.closing.controlDate = next.closing.closingDate;
  if (!next.closing.transferDocuments.trim()) next.closing.transferDocuments = DEFAULT_TRANSFER_DOCS;
  if (!next.price.depositDue) next.price.depositDue = next.business.effectiveDate;
  next.terms.governingLaw = "State of New York";
  for (const p of [next.buyer, next.seller]) {
    p.signingCapacity = p.entityName ? "entity_representative" : "individual";
    if (p.entityName && !p.repName) p.repName = p.legalName;
  }
  next.assets.schedule = next.assets.schedule.map((a) => ({ ...a, status: "included" as const }));

  const total = parseCents(next.price.totalPrice);
  const dep = next.price.deposit === "" ? null : parseCents(next.price.deposit);
  const bal = remainingBalance(next.price.totalPrice, next.price.deposit);
  if (total !== null && dep !== null && bal !== null) {
    next.price.payments = [
      ...(dep > 0 ? [{ description: "Deposit", amount: next.price.deposit, dueDate: next.price.depositDue, status: "scheduled" as const }] : []),
      ...(bal > 0 ? [{ description: "Balance at closing", amount: (bal / 100).toFixed(2), dueDate: next.closing.closingDate, status: "scheduled" as const }] : []),
    ];
  } else {
    next.price.payments = [];
  }
  return next;
}

export function quickIssues(d: AgreementData, ctx: { attachments: AttachmentInfo[]; agreementId?: string; versionNo?: number }): Issue[] {
  const out: Issue[] = [];
  const add = (message: string) => out.push({ step: "quick", message });
  for (const [k, label] of [["buyer", "Buyer"], ["seller", "Seller"]] as const) {
    const p = d[k];
    if (!p.legalName) add(`${label}: enter the full legal name.`);
    if (!p.email) add(`${label}: enter an email address (the signing link goes here).`);
    if (!p.address) add(`${label}: enter an address.`);
    if (p.entityName && !p.authorityBasis) add(`${label}: say what proves the signer can sign for ${p.entityName}.`);
  }
  if (d.buyer.email && d.buyer.email.toLowerCase() === d.seller.email.toLowerCase()) add("Buyer and Seller need different email addresses.");
  const b = d.business;
  if (!b.streetAddress) add("Enter the street address of Maruf Cafe.");
  if (!b.owningEntity) add("Say who legally owns Maruf Cafe today.");
  if (!b.transactionType) add("Choose what is being sold.");
  if (b.transactionType === "equity_purchase" && !b.sellerInterest) add("Say how much of the company is being sold.");
  if (b.transactionType === "other") add("The quick agreement can't describe an 'other' deal. Use the full agreement.");
  if (!b.effectiveDate) add("Enter the date of the agreement.");
  if (!d.closing.closingDate) add("Enter the closing date.");
  if (b.effectiveDate && d.closing.closingDate && d.closing.closingDate < b.effectiveDate) add("The closing date is before the agreement date.");
  if (!d.closing.location) add("Say where or how you will close.");
  const hasItems = d.assets.schedule.some((a) => a.name.trim());
  if (!hasItems && b.transactionType !== "operations_goodwill") add("List at least one thing that is being sold.");
  const total = parseCents(d.price.totalPrice);
  if (total === null || total <= 0) add("Enter the total price.");
  if (d.price.deposit === "") add("Enter the deposit (0.00 if none).");
  const dep = parseCents(d.price.deposit);
  if (total !== null && dep !== null && dep > total) add("The deposit is more than the price.");
  if (!d.price.paymentMethod) add("Enter how the buyer will pay.");
  if (!d.price.depositTerms) add("Say what happens to the deposit if the sale doesn't go through.");
  if (!d.lease.tenure) add("Say whether the cafe's premises are owned or leased.");
  if (d.lease.tenure === "leased" && !d.lease.landlordConsent) add("Say whether the landlord must approve the transfer.");
  if (!d.checkpoints.sellerAuthorityVerified) add("Confirm that you have checked the seller's right to sell (and to sign).");
  if (!d.checkpoints.ownershipVerified) add("Confirm that you have checked who owns the cafe.");
  void ctx;
  return out;
}

export function buildQuickDocument(input: BuildInput): BuiltDocument {
  const d = input.data;
  const exhibits = input.attachments.map((a, i) => ({ ...a, label: exhibitLabel(i) }));
  const blocks: Block[] = [];
  const money = (v: string, label: string) => formatMoney(v) ?? tbc(label);
  const need = (v: string, label: string) => (v && v.trim() ? v.trim() : tbc(label));
  const buyerName = d.buyer.entityName || d.buyer.legalName;
  const sellerName = d.seller.entityName || d.seller.legalName;
  const closing = fmtDate(d.closing.closingDate) || tbc("closing date");
  const bal = remainingBalance(d.price.totalPrice, d.price.deposit);
  const owner = need(d.business.owningEntity, "who owns Maruf Cafe");
  let n = 0;
  const h = (t: string) => blocks.push({ t: "h1", text: `${++n}. ${t}` });
  const p = (text: string) => blocks.push({ t: "p", text, num: `${n}.${++sub}` });
  let sub = 0;
  const section = (t: string, ...paras: string[]) => {
    h(t);
    sub = 0;
    paras.forEach(p);
  };

  blocks.push({ t: "title", text: "MARUF CAFE", sub: "BUSINESS PURCHASE AND SALE AGREEMENT" });
  if (input.draft) blocks.push({ t: "banner", tone: "warn", text: "DRAFT — NOT SIGNED. This document has not been signed by every required party and is not a binding agreement." });
  blocks.push({
    t: "kv",
    rows: [
      ["Agreement ID", input.agreementId],
      ["Document version", `Version ${input.versionNo} (short form)`],
      ["Date of agreement", fmtDate(d.business.effectiveDate) || tbc("date of agreement")],
    ],
  });
  blocks.push({ t: "banner", tone: "info", text: LEGAL_NOTICE });

  section(
    "The people",
    `This agreement is made on ${fmtDate(d.business.effectiveDate) || tbc("date of agreement")} between ${describeParty(d.seller, "Seller")} ("Seller") and ${describeParty(d.buyer, "Buyer")} ("Buyer") about the business called ${need(d.business.name, "business name")}, ${need(d.business.location, "location")}, at ${need(d.business.streetAddress, "street address")} (the "Business").`,
  );
  blocks.push({
    t: "table",
    head: ["", "Seller", "Buyer"],
    rows: [
      ["Name", dash(sellerName), dash(buyerName)],
      ["Email", dash(d.seller.email), dash(d.buyer.email)],
      ["Phone", dash(d.seller.phone), dash(d.buyer.phone)],
      ["Signs as", d.seller.entityName ? `Representative of ${d.seller.entityName}` : "Individual", d.buyer.entityName ? `Representative of ${d.buyer.entityName}` : "Individual"],
    ],
    widths: [0.2, 0.4, 0.4],
  });

  const tx = d.business.transactionType;
  const included = d.assets.schedule.filter((a) => a.name.trim());
  const excluded = d.assets.excluded.filter((e) => e.description.trim());
  section(
    "What Buyer is buying",
    tx === "equity_purchase"
      ? `Seller sells and Buyer buys ${need(d.business.sellerInterest, "how much of the company is sold")} of ${owner}, the company that owns the Business. The company stays in existence, so its existing debts stay with the company; section 6 says who pays what between Buyer and Seller.`
      : tx === "operations_goodwill"
        ? `Seller sells and Buyer buys the operations and goodwill of the Business (to the extent Seller can transfer them), together with the items listed below. Buyer is not buying ${owner} or any share of it.`
        : tx === "asset_purchase"
          ? `Seller sells and Buyer buys only the items listed below. Buyer is not buying ${owner} or any share of it.`
          : tbc("what is being sold"),
    "Anything not listed here is not sold.",
  );
  blocks.push(
    included.length
      ? { t: "table", head: ["Item sold", "Details", "Agreed value"], rows: included.map((a) => [a.name, [a.quantity && `Qty ${a.quantity}`, a.description, a.condition, a.serial && `Serial ${a.serial}`].filter(Boolean).join("; ") || "—", formatMoney(a.agreedValue) ?? "—"]), align: ["l", "l", "r"], widths: [0.35, 0.45, 0.2] }
      : { t: "p", text: "No individual items are listed." },
  );
  if (d.assets.otherAssetsDescription) blocks.push({ t: "p", text: `Also included: ${d.assets.otherAssetsDescription}` });
  blocks.push({ t: "p", text: excluded.length ? `Not included in the sale: ${excluded.map((e) => e.description).join("; ")}.` : "No items have been listed as excluded." });

  section(
    "Price and payment",
    `The total price is ${money(d.price.totalPrice, "total price")}. Buyer pays a deposit of ${money(d.price.deposit, "deposit (0.00 if none)")}${d.price.deposit && parseCents(d.price.deposit) ? ` by ${fmtDate(d.price.depositDue) || tbc("deposit due date")}` : ""}, and the balance of ${bal === null ? tbc("balance") : formatCents(bal)} at closing. Payment method: ${need(d.price.paymentMethod, "payment method")}.`,
  );
  blocks.push(
    d.price.payments.length
      ? { t: "table", head: ["Payment", "Due", "Amount"], rows: d.price.payments.map((x) => [x.description, fmtDate(x.dueDate) || "—", formatMoney(x.amount) ?? "—"]), align: ["l", "l", "r"], widths: [0.5, 0.3, 0.2] }
      : { t: "p", text: tbc("payment schedule") },
  );
  if (d.price.payments.length) blocks.push({ t: "p", text: `Payments listed total ${formatCents(sumCents(d.price.payments.map((x) => x.amount)))}.` });
  sub = 1;
  p(`If the sale does not go through, the deposit is handled like this: ${need(d.price.depositTerms, "what happens to the deposit")}. No penalty or forfeiture applies unless it is written in this section.`);

  section(
    "Closing",
    `The sale closes on ${closing}. How or where: ${need(d.closing.location, "closing place or method")}. Possession and control of what is sold pass to Buyer at closing unless both sides agree otherwise in writing.`,
    `At closing, the parties sign and hand over: ${d.closing.transferDocuments.split(/\n+/).filter(Boolean).join("; ") || DEFAULT_TRANSFER_DOCS}.`,
    "Closing only happens if, by then, the landlord has approved the transfer (if the premises are leased and approval is needed) and any permit or license Buyer needs has been issued to Buyer. Either side may agree in writing to go ahead without a condition that protects it.",
  );

  const leased = d.lease.tenure === "leased";
  section(
    "The cafe's premises",
    d.lease.tenure === "leased"
      ? `The premises are leased${d.lease.landlordName ? ` from ${d.lease.landlordName}` : ""}. Landlord approval of the transfer is ${{ required: "required", not_required: "not required", unknown: "not yet known", "": tbc("whether landlord approval is needed") }[d.lease.landlordConsent]}.`
      : d.lease.tenure === "owned"
        ? `The premises are owned${d.lease.landlordName ? ` by ${d.lease.landlordName}` : ""}. Any sale or lease of the building needs its own written agreement; this agreement does not transfer the building.`
        : tbc("whether the premises are owned or leased"),
    leased
      ? "Nothing here promises that Buyer can use the premises. Buyer can only occupy them if the landlord agrees in writing, by transferring the lease or signing a new one."
      : "Nothing here promises that Buyer can use the premises unless the owner agrees in writing.",
  );

  section(
    "Debts and bills",
    `Buyer takes on only these debts: ${d.quick.buyerAssumes.trim() || "none"}.`,
    "Seller stays responsible for every other debt, tax, wage, and claim from before closing. This is between Buyer and Seller only. It does not change what Seller or the Business owes anyone else unless that person agrees or the law says so. Debts, employees, contracts, and customer orders do not transfer automatically.",
  );

  section(
    "What each side confirms",
    "Seller confirms that Seller has the right to sell what is described here (and, if Seller is a company, that the person signing may sign for it), and will tell Buyer about any lien, lawsuit, debt, or restriction on the sale that Seller knows about. These are statements to be checked, not facts proven by this document.",
    "Buyer confirms that Buyer has had the chance to inspect the Business and its records, understands what is being bought, and could get legal, tax, and financial advice. Nothing here gives up a right that cannot lawfully be given up.",
    "No license, permit, or registration (such as food service, health, business registration, or alcohol) transfers automatically. Each side handles the approvals it needs, and Buyer must get the ones needed to operate in Buyer's own name.",
  );

  section(
    "If something goes wrong",
    "If one side breaks this agreement (for example, does not pay or does not close), the other side should give written notice describing the problem. Each side keeps the rights the law gives it. The deposit is handled as in section 3. This agreement adds no penalties of its own.",
  );

  section(
    "The small print",
    "This is the whole agreement about this sale and replaces earlier talks. Changes must be in writing and signed by both sides. If part of it is found invalid, the rest stays in force. Notices go to the email addresses above. Neither side may hand this agreement to someone else without the other's written consent. It may be signed in separate copies that together form one agreement.",
    "The parties agree to sign electronically, intending that electronic signatures and records have the same effect as handwritten ones to the extent allowed by the federal ESIGN Act and the New York Electronic Signatures and Records Act. A deed or notarized paper may need a different method.",
    "This agreement is governed by New York law, and disputes will be brought in the state or federal courts in New York. No promise is made that every clause is enforceable in every situation.",
  );

  section("Signatures", "By signing, each side agrees to this agreement. Signatures are added only through the electronic signature service; this document contains no pre-filled or simulated signature.");
  blocks.push({ t: "sig", party: "buyer", printedName: d.buyer.legalName, entity: d.buyer.entityName, rep: d.buyer.entityName ? d.buyer.repName : "", title: d.buyer.repTitle });
  blocks.push({ t: "sig", party: "seller", printedName: d.seller.legalName, entity: d.seller.entityName, rep: d.seller.entityName ? d.seller.repName : "", title: d.seller.repTitle });

  if (exhibits.length) {
    blocks.push({ t: "h1", text: "Attachments" });
    blocks.push({ t: "table", head: ["Exhibit", "File", "SHA-256 (first 16)", "In this document"], rows: exhibits.map((e) => [e.label, e.fileName, e.sha256.slice(0, 16), e.mergeable ? "Yes, attached after this page" : "No, provided separately"]), widths: [0.14, 0.38, 0.25, 0.23] });
  }
  return { title: "Maruf Cafe — Business Purchase and Sale Agreement", agreementId: input.agreementId, versionNo: input.versionNo, draft: input.draft, blocks, exhibits };
}
