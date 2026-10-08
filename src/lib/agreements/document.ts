/**
 * Builds the agreement as a neutral document model from structured data.
 * The on-screen preview and the PDF both render this same model, so what the
 * parties review is exactly what is generated and sent for signature.
 */
import { formatCents, formatMoney, parseCents, remainingBalance, sumCents } from "./money";
import {
  ALLOCATION_LABEL,
  ASSET_CATEGORIES,
  LIABILITY_CATEGORIES,
  TRANSACTION_LABEL,
  type AgreementData,
  type Party,
} from "./schema";
import { CLAUSES, LEGAL_NOTICE, SECTION_TITLES, clauseText, fillTokens, tbc } from "./template";

export type Block =
  | { t: "title"; text: string; sub?: string }
  | { t: "banner"; text: string; tone: "warn" | "info" }
  | { t: "h1"; text: string; anchor?: string }
  | { t: "h2"; text: string }
  | { t: "p"; text: string; num?: string }
  | { t: "list"; items: string[] }
  | { t: "kv"; rows: Array<[string, string]> }
  | { t: "table"; head: string[]; rows: string[][]; align?: Array<"l" | "r">; widths?: number[] }
  | { t: "sig"; party: "buyer" | "seller"; printedName: string; entity: string; rep: string; title: string }
  | { t: "witness" }
  | { t: "notary" }
  | { t: "pagebreak" };

export interface AttachmentInfo {
  id: string;
  fileName: string;
  schedule: string | null;
  contentType: string;
  sha256: string;
  mergeable: boolean;
}

export interface BuiltDocument {
  title: string;
  agreementId: string;
  versionNo: number;
  draft: boolean;
  blocks: Block[];
  /** Attachment index, in exhibit order. */
  exhibits: Array<AttachmentInfo & { label: string }>;
}

const NEUTRAL = "none specified by the Parties";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

const dash = (s: string | undefined | null) => (s && s.trim() ? s.trim() : "—");

function describeParty(p: Party, role: string): string {
  const name = p.entityName || p.legalName;
  if (!name) return tbc(`${role} legal name`);
  let out = name;
  if (p.entityName && p.entityType) out += `, a ${p.entityType}`;
  if (p.address) out += `, with an address at ${p.address.replace(/\s*\n\s*/g, ", ")}`;
  if (p.entityName && (p.repName || p.legalName)) {
    out += `, acting through ${p.repName || p.legalName}${p.repTitle ? `, ${p.repTitle}` : ""}`;
  }
  return out;
}

const noticeAddress = (p: Party) => [p.address.replace(/\s*\n\s*/g, ", "), p.email].filter(Boolean).join("; ") || "";

/** Values for the {{tokens}} used in clause text. Missing required values become explicit markers. */
export function buildTokens(d: AgreementData): Record<string, string> {
  const money = (v: string, label: string) => formatMoney(v) ?? tbc(label);
  const bal = remainingBalance(d.price.totalPrice, d.price.deposit);
  const tenure =
    d.lease.tenure === "leased"
      ? `leased${d.lease.landlordName ? ` from ${d.lease.landlordName}` : ""}`
      : d.lease.tenure === "owned"
        ? "owned"
        : d.lease.tenure === "other"
          ? "held under another arrangement described in Schedule E"
          : tbc("whether the premises are owned or leased");
  const consent = { required: "yes", not_required: "no", unknown: "not yet determined", "": "" }[d.lease.landlordConsent];
  const lines = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean).join("; ");
  const terms = d.terms;
  return {
    effectiveDate: fmtDate(d.business.effectiveDate) || tbc("effective date"),
    sellerDescription: describeParty(d.seller, "Seller"),
    buyerDescription: describeParty(d.buyer, "Buyer"),
    businessName: d.business.name || tbc("business name"),
    businessLocation: d.business.location || tbc("business location"),
    businessAddressClause: `, at ${d.business.streetAddress || tbc("exact street address")}`,
    owningEntityOrPlaceholder: d.business.owningEntity || tbc("legal entity that owns the Business"),
    sellerInterestOrPlaceholder: d.business.sellerInterest || tbc("Seller's ownership interest"),
    transactionOtherOrPlaceholder: d.business.transactionOther || tbc("description of the other transaction"),
    registrationClause: d.business.registration ? `Business registration details: ${d.business.registration.replace(/\s*\n\s*/g, "; ")}. ` : "",
    purchasePrice: money(d.price.totalPrice, "total purchase price"),
    deposit: money(d.price.deposit, "deposit amount (enter 0.00 for none)"),
    depositDue: fmtDate(d.price.depositDue) || tbc("deposit due date"),
    balance: bal === null ? tbc("remaining balance") : formatCents(bal),
    paymentMethod: d.price.paymentMethod || tbc("payment method"),
    financing: d.price.financing || NEUTRAL,
    escrow: d.price.escrow || NEUTRAL,
    depositTerms: d.price.depositTerms || tbc("conditions for returning or retaining the deposit"),
    closingDate: fmtDate(d.closing.closingDate) || tbc("closing date"),
    closingLocation: d.closing.location || tbc("closing location or method"),
    possessionDate: fmtDate(d.closing.possessionDate) || tbc("date possession transfers"),
    controlDate: fmtDate(d.closing.controlDate) || tbc("date operational control transfers"),
    transferDocuments: lines(d.closing.transferDocuments) || tbc("required transfer documents"),
    premisesTenure: tenure,
    landlordConsent: consent || tbc("whether landlord consent is required"),
    assignmentTerms: d.lease.assignmentTerms || (d.lease.tenure === "owned" ? "not applicable" : tbc("lease assignment or replacement terms")),
    utilities: d.lease.utilities || NEUTRAL,
    separateRealEstate: d.lease.separateRealEstate || "no separate real estate transaction has been identified by the Parties",
    existingEmployees: d.employment.existingEmployees || NEUTRAL,
    offers: d.employment.offers || NEUTRAL,
    payroll: d.employment.payroll || NEUTRAL,
    benefits: d.employment.benefits || NEUTRAL,
    vendorAgreements: d.employment.vendorAgreements || NEUTRAL,
    customerOrders: d.employment.customerOrders || NEUTRAL,
    serviceAgreements: d.employment.serviceAgreements || NEUTRAL,
    responsibility: d.employment.responsibility || NEUTRAL,
    terminationNotes: terms.terminationNotes || NEUTRAL,
    cureClause: terms.cureAgreed
      ? terms.cureDays
        ? `The defaulting Party has ${terms.cureDays} days after receiving the notice to cure the default.`
        : tbc("number of cure days")
      : "No cure period has been agreed. The Parties' rights under Applicable Law are not otherwise limited by this Section.",
    governingLaw: terms.governingLaw || tbc("governing law"),
    venue: terms.venue || tbc("court jurisdiction and venue"),
    arbitrationNotes: terms.arbitrationNotes || tbc("arbitration terms"),
    sellerNoticeAddress: noticeAddress(d.seller) || tbc("Seller notice address"),
    buyerNoticeAddress: noticeAddress(d.buyer) || tbc("Buyer notice address"),
  };
}

export interface BuildInput {
  agreementId: string;
  versionNo: number;
  data: AgreementData;
  snapshot: Record<string, string>;
  attachments: AttachmentInfo[];
  /** True until every required signature is verified; drives the DRAFT marking. */
  draft: boolean;
}

export function exhibitLabel(i: number) {
  return `Exhibit ${i + 1}`;
}

export function buildDocument(input: BuildInput): BuiltDocument {
  const { data: d, snapshot } = input;
  const tokens = buildTokens(d);
  const overrides = d.clauseOverrides;
  const text = (key: string) => fillTokens(clauseText(key, snapshot, overrides), tokens);
  const blocks: Block[] = [];
  const exhibits = input.attachments.map((a, i) => ({ ...a, label: exhibitLabel(i) }));

  const buyerName = d.buyer.entityName || d.buyer.legalName;
  const sellerName = d.seller.entityName || d.seller.legalName;

  /* ---- cover ---- */
  blocks.push({ t: "title", text: "MARUF CAFE", sub: "BUSINESS PURCHASE AND SALE AGREEMENT" });
  if (input.draft) {
    blocks.push({ t: "banner", tone: "warn", text: "DRAFT — NOT SIGNED. This document has not been signed by every required party and is not a binding agreement." });
  }
  blocks.push({
    t: "kv",
    rows: [
      ["Agreement ID", input.agreementId],
      ["Document version", `Version ${input.versionNo}`],
      ["Business", `${d.business.name || "—"}${d.business.location ? `, ${d.business.location}` : ""}`],
      ["Seller", sellerName || tbc("Seller legal name")],
      ["Buyer", buyerName || tbc("Buyer legal name")],
      ["Effective date", fmtDate(d.business.effectiveDate) || tbc("effective date")],
      ["Proposed closing date", fmtDate(d.business.proposedClosingDate) || tbc("closing date")],
    ],
  });
  blocks.push({ t: "banner", tone: "info", text: LEGAL_NOTICE });
  blocks.push({
    t: "table",
    head: ["Section", "Title"],
    rows: [
      ...Object.entries(SECTION_TITLES).map(([n, t]) => [String(n), t]),
      ["", "Schedules A–G and Attachment Index"],
    ],
    widths: [0.15, 0.85],
  });
  blocks.push({ t: "pagebreak" });

  const numbered = (section: number, keys: string[]) => {
    keys.forEach((k, i) => blocks.push({ t: "p", num: `${section}.${i + 1}`, text: text(k) }));
  };
  const h = (n: number) => blocks.push({ t: "h1", text: `Section ${n}. ${SECTION_TITLES[n]}`, anchor: `s${n}` });

  /* ---- 1 ---- */
  h(1);
  numbered(1, ["s1.parties", "s1.definitions"]);
  blocks.push({
    t: "table",
    head: ["", "Seller", "Buyer"],
    rows: [
      ["Legal name", dash(d.seller.legalName), dash(d.buyer.legalName)],
      ["Business / entity name", dash(d.seller.entityName), dash(d.buyer.entityName)],
      ["Entity type", dash(d.seller.entityType), dash(d.buyer.entityType)],
      ["Address", dash(d.seller.address), dash(d.buyer.address)],
      ["Email", dash(d.seller.email), dash(d.buyer.email)],
      ["Phone", dash(d.seller.phone), dash(d.buyer.phone)],
      ["Authorized representative", dash(d.seller.repName), dash(d.buyer.repName)],
      ["Title", dash(d.seller.repTitle), dash(d.buyer.repTitle)],
      ["Authority to sign", dash(d.seller.authorityBasis), dash(d.buyer.authorityBasis)],
    ],
    widths: [0.24, 0.38, 0.38],
  });

  /* ---- 2 ---- */
  h(2);
  const tx = d.business.transactionType;
  blocks.push({ t: "kv", rows: [["Type of transaction", TRANSACTION_LABEL[tx]]] });
  const txKey = tx ? `s2.${tx}` : "s2.unselected";
  numbered(2, [txKey, "s2.identification"]);

  /* ---- 3 ---- */
  h(3);
  numbered(3, ["s3.intro"]);
  blocks.push({
    t: "table",
    head: ["Asset category", "Treatment"],
    rows: ASSET_CATEGORIES.map(([key, label]) => {
      const c = d.assets.categories[key] ?? "tbd";
      return [label, c === "included" ? "Included" : c === "excluded" ? "Not included" : "Not yet decided (not sold until decided)"];
    }),
    widths: [0.6, 0.4],
  });
  if (d.assets.otherAssetsDescription) blocks.push({ t: "p", text: `Other specifically identified assets: ${d.assets.otherAssetsDescription}` });
  blocks.push({ t: "p", text: "The itemized asset schedule is Schedule A (Included Assets) and Schedule C (Inventory and Equipment)." });

  /* ---- 4 ---- */
  h(4);
  numbered(4, ["s4.intro"]);
  const excluded = excludedList(d);
  blocks.push(
    excluded.length
      ? { t: "list", items: excluded }
      : { t: "p", text: "No Excluded Assets have been listed by the Parties as of the date this document was generated." },
  );

  /* ---- 5 ---- */
  h(5);
  numbered(5, ["s5.price", "s5.deposit", "s5.financing", "s5.depositTreatment"]);
  blocks.push({ t: "h2", text: "Payment schedule" }, paymentTable(d));
  blocks.push({ t: "p", text: paymentCheckText(d) });

  /* ---- 6 ---- */
  h(6);
  numbered(6, ["s6.closing", "s6.documents", "s6.law"]);

  /* ---- 7 ---- */
  h(7);
  numbered(7, ["s7.intro"]);
  blocks.push({ t: "kv", rows: leaseRows(d) });
  blocks.push({ t: "p", num: "7.2", text: text("s7.occupancy") }, { t: "p", num: "7.3", text: text("s7.lease") });

  /* ---- 8 ---- */
  h(8);
  blocks.push({ t: "p", num: "8.1", text: text("s8.intro") });
  blocks.push(liabilityTable(d));
  const none = d.liabilities.noneDisclosed.map((k) => LIABILITY_CATEGORIES.find(([key]) => key === k)?.[1]).filter(Boolean);
  if (none.length) blocks.push({ t: "p", text: `Categories for which the Parties state that no items are disclosed: ${none.join("; ")}.` });
  blocks.push({ t: "p", num: "8.2", text: text("s8.allocation") });

  /* ---- 9 ---- */
  h(9);
  blocks.push({ t: "banner", tone: "warn", text: "Provisions for attorney review. These are proposed representations, not established facts, and must be verified before signing." });
  blocks.push({ t: "p", num: "9.1", text: text("s9.intro") });
  ["s9.authority", "s9.ownership", "s9.liens", "s9.liabilities", "s9.disputes", "s9.accuracy", "s9.restrictions"].forEach((k, i) =>
    blocks.push({ t: "p", num: `9.${i + 2}`, text: `${CLAUSES.find((c) => c.key === k)?.title ?? ""}. ${text(k)}` }),
  );

  /* ---- 10 ---- */
  h(10);
  blocks.push({ t: "p", num: "10.1", text: text("s10.intro") });
  blocks.push({ t: "list", items: ["s10.inspect", "s10.records", "s10.understanding", "s10.approvals", "s10.advice"].map(text) });

  /* ---- 11 ---- */
  h(11);
  numbered(11, ["s11.employees", "s11.payroll", "s11.contracts", "s11.responsibility"]);

  /* ---- 12 ---- */
  h(12);
  numbered(12, ["s12.intro"]);
  blocks.push({
    t: "table",
    head: ["Authorization", "Applies?", "Responsible party", "Notes"],
    rows: d.permits.map((p) => [dash(p.name), { "": "—", yes: "Yes", no: "No", unknown: "Unknown" }[p.applicable], partyWord(p.responsible), dash(p.notes)]),
    widths: [0.32, 0.12, 0.2, 0.36],
  });

  /* ---- 13 ---- */
  h(13);
  numbered(13, ["s13.intro"]);
  blocks.push(conditionTable(d));

  /* ---- 14 ---- */
  h(14);
  numbered(14, ["s14.failure", "s14.notice", "s14.termination", "s14.remedies"]);

  /* ---- 15 ---- */
  h(15);
  blocks.push(
    d.terms.confidentiality
      ? { t: "p", num: "15.1", text: text("s15.confidentiality") }
      : { t: "p", num: "15.1", text: "The Parties have not elected to include a confidentiality clause in this Agreement." },
  );

  /* ---- 16 ---- */
  h(16);
  blocks.push({ t: "p", num: "16.1", text: text("s16.law") });
  blocks.push({ t: "p", num: "16.2", text: d.terms.mediation ? text("s16.mediation") : "Mediation: not elected by the Parties." });
  blocks.push({ t: "p", num: "16.3", text: d.terms.arbitration ? text("s16.arbitration") : "Arbitration: not elected by the Parties." });

  /* ---- 17 ---- */
  h(17);
  numbered(17, ["s17.entire", "s17.amendments", "s17.severability", "s17.notices", "s17.assignment", "s17.counterparts", "s17.esign", "s17.schedules"]);

  /* ---- 18 ---- */
  h(18);
  blocks.push({ t: "p", num: "18.1", text: text("s18.intro") });
  blocks.push({ t: "sig", party: "buyer", printedName: d.buyer.legalName, entity: d.buyer.entityName, rep: d.buyer.repName, title: d.buyer.repTitle });
  blocks.push({ t: "sig", party: "seller", printedName: d.seller.legalName, entity: d.seller.entityName, rep: d.seller.repName, title: d.seller.repTitle });
  if (d.terms.includeWitness) blocks.push({ t: "p", num: "18.2", text: text("s18.witness") }, { t: "witness" });
  if (d.terms.includeNotary) blocks.push({ t: "p", num: "18.3", text: text("s18.notary") }, { t: "notary" });

  /* ---- Schedules ---- */
  blocks.push({ t: "pagebreak" });
  blocks.push({ t: "h1", text: "Schedule A — Included Assets", anchor: "schA" });
  const included = d.assets.schedule.filter((a) => a.status === "included");
  const includedCats = ASSET_CATEGORIES.filter(([k]) => d.assets.categories[k] === "included").map(([, l]) => l);
  blocks.push({ t: "p", text: includedCats.length ? `Categories included: ${includedCats.join("; ")}.` : "No asset category has been marked as included." });
  blocks.push(assetTable(included, "No individual items are listed as included."));

  blocks.push({ t: "h1", text: "Schedule B — Excluded Assets", anchor: "schB" });
  blocks.push(excluded.length ? { t: "list", items: excluded } : { t: "p", text: "No Excluded Assets have been listed." });

  blocks.push({ t: "h1", text: "Schedule C — Inventory and Equipment", anchor: "schC" });
  blocks.push(assetTable(d.assets.schedule, "No inventory or equipment items are listed.", true));
  const valued = d.assets.schedule.filter((a) => a.status === "included" && parseCents(a.agreedValue) !== null);
  if (valued.length) blocks.push({ t: "p", text: `Agreed values listed in this Schedule total ${formatCents(sumCents(valued.map((a) => a.agreedValue)))} for included items. Values are those stated by the Parties.` });

  blocks.push({ t: "h1", text: "Schedule D — Assumed Liabilities and Liability Allocation", anchor: "schD" });
  const assumed = d.liabilities.items.filter((l) => l.allocation === "buyer_assumes");
  blocks.push({ t: "h2", text: "Liabilities Buyer expressly assumes" });
  blocks.push(assumed.length ? liabilityTable({ ...d, liabilities: { ...d.liabilities, items: assumed } }) : { t: "p", text: "Buyer expressly assumes no liabilities listed in this Schedule." });
  blocks.push({ t: "h2", text: "All disclosed liabilities and their allocation" });
  blocks.push(liabilityTable(d));

  blocks.push({ t: "h1", text: "Schedule E — Lease and Premises Information", anchor: "schE" });
  blocks.push({ t: "kv", rows: leaseRows(d) });

  blocks.push({ t: "h1", text: "Schedule F — Payment Schedule", anchor: "schF" });
  blocks.push(paymentTable(d), { t: "p", text: paymentCheckText(d) });

  blocks.push({ t: "h1", text: "Schedule G — Additional Conditions", anchor: "schG" });
  blocks.push(conditionTable(d));
  if (d.additionalConditions) blocks.push({ t: "p", text: d.additionalConditions });

  blocks.push({ t: "h1", text: "Attachment Index", anchor: "attachments" });
  blocks.push(
    exhibits.length
      ? {
          t: "table",
          head: ["Exhibit", "File", "Schedule", "SHA-256 (first 16)", "In this document"],
          rows: exhibits.map((e) => [e.label, e.fileName, e.schedule ? `Schedule ${e.schedule}` : "Supporting document", e.sha256.slice(0, 16), e.mergeable ? "Yes, attached after this index" : "No, provided separately"]),
          widths: [0.12, 0.3, 0.16, 0.22, 0.2],
        }
      : { t: "p", text: "No supporting documents are attached." },
  );

  return { title: "Maruf Cafe — Business Purchase and Sale Agreement", agreementId: input.agreementId, versionNo: input.versionNo, draft: input.draft, blocks, exhibits };
}

function partyWord(v: string): string {
  return ({ buyer: "Buyer", seller: "Seller", both: "Both", third_party: "Third party", tbd: "To be determined", "": "—" } as Record<string, string>)[v] ?? "—";
}

export function excludedList(d: AgreementData): string[] {
  const out = d.assets.excluded.filter((e) => e.description).map((e) => (e.notes ? `${e.description} (${e.notes})` : e.description));
  for (const a of d.assets.schedule) if (a.status === "excluded" && a.name) out.push(a.description ? `${a.name}: ${a.description}` : a.name);
  for (const [k, l] of ASSET_CATEGORIES) if (d.assets.categories[k] === "excluded") out.push(`Category: ${l}`);
  return out;
}

function assetTable(items: AgreementData["assets"]["schedule"], empty: string, withStatus = false): Block {
  if (!items.length) return { t: "p", text: empty };
  return {
    t: "table",
    head: ["Item", "Description", "Qty", "Condition", "Serial no.", "Agreed value", ...(withStatus ? ["Status"] : [])],
    rows: items.map((a) => [dash(a.name), dash(a.description), dash(a.quantity), dash(a.condition), dash(a.serial), formatMoney(a.agreedValue) ?? "—", ...(withStatus ? [a.status === "included" ? "Included" : "Excluded"] : [])]),
    align: withStatus ? ["l", "l", "r", "l", "l", "r", "l"] : ["l", "l", "r", "l", "l", "r"],
    widths: withStatus ? [0.17, 0.25, 0.07, 0.12, 0.13, 0.14, 0.12] : [0.19, 0.28, 0.08, 0.14, 0.15, 0.16],
  };
}

function paymentTable(d: AgreementData): Block {
  if (!d.price.payments.length) return { t: "p", text: "No payment schedule has been entered." };
  return {
    t: "table",
    head: ["Description", "Due date", "Amount", "Status"],
    rows: d.price.payments.map((p) => [dash(p.description), fmtDate(p.dueDate) || "—", formatMoney(p.amount) ?? "—", { scheduled: "Scheduled", paid: "Paid (as recorded by the Parties)", waived: "Waived" }[p.status]]),
    align: ["l", "l", "r", "l"],
    widths: [0.38, 0.22, 0.17, 0.23],
  };
}

export function paymentCheckText(d: AgreementData): string {
  const total = parseCents(d.price.totalPrice);
  if (!d.price.payments.length) return "Scheduled payments: none entered.";
  const sum = sumCents(d.price.payments.map((p) => p.amount));
  if (total === null) return `Scheduled payments total ${formatCents(sum)}. The Purchase Price has not been entered.`;
  return sum === total
    ? `Scheduled payments total ${formatCents(sum)}, which equals the Purchase Price.`
    : `Scheduled payments total ${formatCents(sum)}, which differs from the Purchase Price of ${formatCents(total)} by ${formatCents(Math.abs(total - sum))}.`;
}

function leaseRows(d: AgreementData): Array<[string, string]> {
  const l = d.lease;
  return [
    ["Premises", { "": "—", leased: "Leased", owned: "Owned", other: "Other arrangement" }[l.tenure]],
    ["Owner's / landlord's name", dash(l.landlordName)],
    ["Owner's / landlord's contact", dash(l.landlordContact)],
    ["Current lease expiration", fmtDate(l.leaseExpiration) || "—"],
    ["Monthly rent", formatMoney(l.monthlyRent) ?? "—"],
    ["Security deposit", formatMoney(l.securityDeposit) ?? "—"],
    ["Landlord consent required", { "": "—", required: "Yes", not_required: "No", unknown: "Not yet determined" }[l.landlordConsent]],
    ["Assignment or replacement terms", dash(l.assignmentTerms)],
    ["Utilities and occupancy costs", dash(l.utilities)],
    ["Separate real estate transaction", dash(l.separateRealEstate)],
    ["Other premises notes", dash(l.premisesNotes)],
  ];
}

function liabilityTable(d: AgreementData): Block {
  if (!d.liabilities.items.length) return { t: "p", text: "No liabilities have been listed." };
  return {
    t: "table",
    head: ["Category", "Description", "Creditor", "Amount", "Allocation"],
    rows: d.liabilities.items.map((l) => [LIABILITY_CATEGORIES.find(([k]) => k === l.category)?.[1] ?? l.category, dash(l.description), dash(l.creditor), formatMoney(l.amount) ?? "—", ALLOCATION_LABEL[l.allocation]]),
    align: ["l", "l", "l", "r", "l"],
    widths: [0.18, 0.28, 0.17, 0.14, 0.23],
  };
}

function conditionTable(d: AgreementData): Block {
  return {
    t: "table",
    head: ["Condition", "Required", "Responsible", "Status", "Notes"],
    rows: d.conditions.map((c) => [dash(c.label), c.required ? "Yes" : "No", partyWord(c.responsible), { open: "Open", satisfied: "Satisfied", waived: "Waived" }[c.status], dash(c.notes)]),
    widths: [0.34, 0.1, 0.14, 0.12, 0.3],
  };
}

/** Every unresolved placeholder in the rendered document, for the readiness check. */
export function findPlaceholders(doc: BuiltDocument): string[] {
  const found = new Set<string>();
  const scan = (s: string) => {
    for (const m of s.matchAll(/\[TO BE COMPLETED: ([^\]]+)\]/g)) found.add(m[1]);
  };
  for (const b of doc.blocks) {
    if (b.t === "p" || b.t === "banner" || b.t === "title" || b.t === "h1" || b.t === "h2") scan(b.text);
    else if (b.t === "list") b.items.forEach(scan);
    else if (b.t === "kv") b.rows.forEach(([a, c]) => (scan(a), scan(c)));
    else if (b.t === "table") b.rows.forEach((r) => r.forEach(scan));
  }
  return [...found];
}
