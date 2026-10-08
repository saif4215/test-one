/**
 * Master template: the default wording of every clause. Clause text may contain
 * {{tokens}} that are filled from the structured agreement data. Anything missing
 * becomes an explicit "[TO BE COMPLETED: ...]" marker, never an invented value.
 *
 * The template is versioned in the database. An agreement version snapshots the
 * clause text it was created from, so editing the master template never changes
 * an existing (or signed) agreement.
 *
 * This is customizable template language, not legal advice.
 */

export interface ClauseDef {
  key: string;
  section: number;
  title: string;
  text: string;
}

export const LEGAL_NOTICE =
  "This application generates a customizable business purchase agreement template and is not a substitute for legal advice. The parties should consult a qualified New York attorney before signing. The appropriate terms depend on the transaction structure, ownership, assets, commercial lease, taxes, liabilities, licenses, and other circumstances.";

export const SECTION_TITLES: Record<number, string> = {
  1: "Parties and Effective Date",
  2: "Description of the Transaction",
  3: "Assets Included in the Sale",
  4: "Excluded Assets",
  5: "Purchase Price",
  6: "Closing and Transfer",
  7: "Commercial Lease and Premises",
  8: "Debts, Taxes, and Liabilities",
  9: "Seller Representations",
  10: "Buyer Acknowledgments",
  11: "Employees and Contracts",
  12: "Licenses and Permits",
  13: "Closing Conditions",
  14: "Default and Termination",
  15: "Confidentiality",
  16: "Dispute Resolution",
  17: "Entire Agreement and General Provisions",
  18: "Signatures",
};

export const CLAUSES: ClauseDef[] = [
  {
    key: "s1.parties",
    section: 1,
    title: "Parties",
    text: 'This Business Purchase and Sale Agreement (this "Agreement") is made as of {{effectiveDate}} (the "Effective Date") between {{sellerDescription}} ("Seller") and {{buyerDescription}} ("Buyer"). Seller and Buyer are each a "Party" and together the "Parties". The Agreement concerns the business known as {{businessName}}, located in {{businessLocation}}{{businessAddressClause}} (the "Business").',
  },
  {
    key: "s1.definitions",
    section: 1,
    title: "Definitions",
    text: [
      'In this Agreement: "Applicable Law" means the federal, New York State, and New York City laws, rules, and regulations that apply to the transaction, the Business, or a Party.',
      '"Assets" means the property, rights, or interests that this Agreement states are being sold, as identified in Section 2 and Schedule A. "Included Assets" are the Assets identified in Schedule A. "Excluded Assets" are the assets identified in Section 4 and Schedule B.',
      '"Assumed Liabilities" means only those liabilities that Schedule D states Buyer expressly assumes. "Retained Liabilities" means all other liabilities of Seller or of the Business, including those Schedule D states remain Seller\'s responsibility.',
      '"Closing" means the completion of the transfer described in Section 6, and "Closing Date" means the date on which the Closing occurs.',
      '"Purchase Price" means the amount stated in Section 5. "Deposit" means the deposit, if any, stated in Section 5.',
      '"Schedules" means Schedules A through G attached to this Agreement, which form part of it.',
    ].join("\n\n"),
  },
  {
    key: "s2.asset_purchase",
    section: 2,
    title: "Asset purchase",
    text: "Seller agrees to sell, and Buyer agrees to purchase, the Included Assets listed in Schedule A, on the terms of this Agreement. This is a purchase of specified assets only. It is not a purchase of {{owningEntityOrPlaceholder}} or of any ownership interest in it, and Buyer does not become responsible for the liabilities of Seller or the Business except the Assumed Liabilities.",
  },
  {
    key: "s2.equity_purchase",
    section: 2,
    title: "Purchase of ownership or equity interests",
    text: "Seller agrees to sell, and Buyer agrees to purchase, {{sellerInterestOrPlaceholder}} of the ownership or equity interests in {{owningEntityOrPlaceholder}} (the entity that owns the Business). Because the entity continues to exist after Closing, its existing liabilities remain liabilities of that entity. The Parties' allocation of responsibility between themselves is set out in Section 8 and Schedule D.",
  },
  {
    key: "s2.operations_goodwill",
    section: 2,
    title: "Business operations and goodwill purchase",
    text: "Seller agrees to sell, and Buyer agrees to purchase, the operations and goodwill of the Business, together with the Included Assets listed in Schedule A. Goodwill is transferred only to the extent Seller has the right to transfer it. This is not a purchase of {{owningEntityOrPlaceholder}} or of any ownership interest in it.",
  },
  {
    key: "s2.other",
    section: 2,
    title: "Other transaction",
    text: "The Parties intend the following transaction, the structure and wording of which the Parties will settle in writing: {{transactionOtherOrPlaceholder}}",
  },
  {
    key: "s2.unselected",
    section: 2,
    title: "Transaction type not selected",
    text: "[TO BE COMPLETED: the Parties must select the type of transaction.]",
  },
  {
    key: "s2.identification",
    section: 2,
    title: "What is being sold",
    text: "The Business is owned by {{owningEntityOrPlaceholder}}. Seller's ownership interest in the Business is {{sellerInterestOrPlaceholder}}. {{registrationClause}}Nothing in this Agreement transfers any asset, right, or interest that is not expressly identified as being sold.",
  },
  {
    key: "s3.intro",
    section: 3,
    title: "Included assets",
    text: "The Assets included in the sale are those identified in the asset categories below and itemized in Schedule A (Included Assets) and Schedule C (Inventory and Equipment). An item or category marked as not included, or not yet decided, is not sold under this Agreement. Trade names, domain names, telephone numbers, social media accounts, and customer records are included only to the extent Seller has the right to transfer them and Applicable Law, the terms of any platform or service provider, and third-party rights allow.",
  },
  {
    key: "s4.intro",
    section: 4,
    title: "Excluded assets",
    text: "The assets listed in Schedule B are excluded from the sale and remain the property of Seller. An asset associated with the Business is not included merely because it is used in the Business; only the Included Assets are sold.",
  },
  {
    key: "s5.price",
    section: 5,
    title: "Purchase Price",
    text: "The total Purchase Price is {{purchasePrice}}. The Purchase Price is payable as set out in this Section and in the payment schedule in Schedule F.",
  },
  {
    key: "s5.deposit",
    section: 5,
    title: "Deposit and balance",
    text: "Buyer will pay a Deposit of {{deposit}}, due on {{depositDue}}. The remaining balance of the Purchase Price after the Deposit is {{balance}}. Payment method: {{paymentMethod}}.",
  },
  {
    key: "s5.financing",
    section: 5,
    title: "Financing and escrow",
    text: "Financing arrangement (if any): {{financing}}. Escrow arrangement (if any): {{escrow}}.",
  },
  {
    key: "s5.depositTreatment",
    section: 5,
    title: "Return or retention of the Deposit",
    text: "Return or retention of the Deposit: {{depositTerms}}. No penalty, liquidated damages, or forfeiture applies under this Agreement unless it is expressly stated in this Section.",
  },
  {
    key: "s6.closing",
    section: 6,
    title: "Closing",
    text: "The Closing is scheduled for {{closingDate}} at or by the following location or method: {{closingLocation}}. Possession of the Included Assets transfers on {{possessionDate}}. Operational control of the Business transfers on {{controlDate}}. The Closing may be moved by written agreement of the Parties.",
  },
  {
    key: "s6.documents",
    section: 6,
    title: "Transfer documents",
    text: "At or before the Closing, the Parties will sign and deliver the following transfer documents: {{transferDocuments}}.",
  },
  {
    key: "s6.law",
    section: 6,
    title: "Transfer according to Agreement and law",
    text: "Transfer of the Assets occurs according to this Agreement and Applicable Law. Transfer does not occur until the conditions in Section 13 are satisfied or waived in writing by the Party entitled to waive them.",
  },
  {
    key: "s7.intro",
    section: 7,
    title: "Premises",
    text: "The Business operates from premises that are {{premisesTenure}}. The details below are provided by the Parties and have not been verified by the application.",
  },
  {
    key: "s7.occupancy",
    section: 7,
    title: "No assurance of occupancy",
    text: "Nothing in this Agreement promises that Buyer may occupy or operate from the premises. Buyer's right to occupy depends on the owner's or landlord's written consent and on the assignment of the existing lease or the grant of a new lease or other occupancy right. Landlord consent required: {{landlordConsent}}.",
  },
  {
    key: "s7.lease",
    section: 7,
    title: "Lease assignment or replacement",
    text: "Lease assignment or replacement terms: {{assignmentTerms}}. Responsibility for utilities and occupancy costs: {{utilities}}. Any separate real estate transaction: {{separateRealEstate}}.",
  },
  {
    key: "s8.intro",
    section: 8,
    title: "Disclosure of liabilities",
    text: "Schedule D lists the debts, taxes, and other liabilities disclosed by the Parties. The allocation shown for each item states which Party is responsible for it as between Seller and Buyer.",
  },
  {
    key: "s8.allocation",
    section: 8,
    title: "Allocation of liabilities",
    text: "Buyer assumes only the liabilities that Schedule D states Buyer expressly assumes. Every other liability, including those stated to remain Seller's responsibility, is a Retained Liability. Liabilities do not transfer automatically. This allocation operates between the Parties only. It does not bind any creditor, taxing authority, landlord, employee, or other third party, and it does not eliminate any obligation owed to a third party, unless that third party agrees or Applicable Law provides otherwise.",
  },
  {
    key: "s9.intro",
    section: 9,
    title: "Seller representations",
    text: "The following provisions are proposed for the Parties' review. They are statements Seller is asked to make and are not established facts. Their accuracy must be verified before signing, and Seller may qualify them in the disclosure schedules.",
  },
  {
    key: "s9.authority",
    section: 9,
    title: "Authority to sell",
    text: "Seller represents that, as of the Effective Date, Seller has the legal right and authority to sell the Assets or interests described in this Agreement, and, if Seller is an entity, that the person signing for Seller is authorized to do so.",
  },
  {
    key: "s9.ownership",
    section: 9,
    title: "Ownership of Assets or interests",
    text: "Seller represents that, except as disclosed in this Agreement, Seller owns the Assets or interests being sold.",
  },
  {
    key: "s9.liens",
    section: 9,
    title: "Liens",
    text: "Seller will disclose in Schedule D every lien or security interest affecting the Assets that is known to Seller.",
  },
  {
    key: "s9.liabilities",
    section: 9,
    title: "Material liabilities",
    text: "Seller will disclose in Schedule D the material liabilities of the Business that are known to Seller.",
  },
  {
    key: "s9.disputes",
    section: 9,
    title: "Legal disputes",
    text: "Seller will disclose any pending or threatened lawsuit, claim, or governmental proceeding affecting the Business or the Assets that is known to Seller.",
  },
  {
    key: "s9.accuracy",
    section: 9,
    title: "Accuracy of agreed information",
    text: "Seller represents that the business information Seller has given the Buyer for this transaction, and that is identified in this Agreement or its Schedules, is accurate to the best of Seller's knowledge as of the date it was given.",
  },
  {
    key: "s9.restrictions",
    section: 9,
    title: "Transfer restrictions",
    text: "Seller will disclose any contract, lease, license, or law known to Seller that restricts or conditions the transfer of the Assets or the Business.",
  },
  {
    key: "s10.intro",
    section: 10,
    title: "Buyer acknowledgments",
    text: "Buyer acknowledges the following (nothing in this Section waives a right that cannot lawfully be waived):",
  },
  {
    key: "s10.inspect",
    section: 10,
    title: "Inspection",
    text: "Buyer has had, or before Closing will have, an opportunity to inspect the Business and the Assets.",
  },
  {
    key: "s10.records",
    section: 10,
    title: "Financial records",
    text: "Buyer has had, or before Closing will have, an opportunity to review the financial records that Seller has made available.",
  },
  {
    key: "s10.understanding",
    section: 10,
    title: "Understanding of what is acquired",
    text: "Buyer understands the Assets or ownership interests being acquired, as described in Section 2 and the Schedules.",
  },
  {
    key: "s10.approvals",
    section: 10,
    title: "Approvals allocated to Buyer",
    text: "Buyer is responsible for the approvals, permits, and licenses that Section 12 allocates to Buyer.",
  },
  {
    key: "s10.advice",
    section: 10,
    title: "Independent advice",
    text: "Buyer has had an opportunity to obtain independent legal, tax, and financial advice before signing.",
  },
  {
    key: "s11.employees",
    section: 11,
    title: "Employees",
    text: "No employee transfers to Buyer automatically. Existing employees: {{existingEmployees}}. Potential employment offers by Buyer: {{offers}}. Any offer of employment is made by Buyer in its sole discretion and is subject to Applicable Law.",
  },
  {
    key: "s11.payroll",
    section: 11,
    title: "Payroll and benefits",
    text: "Payroll and accrued wages: {{payroll}}. Employee benefits: {{benefits}}.",
  },
  {
    key: "s11.contracts",
    section: 11,
    title: "Vendor, customer, and service contracts",
    text: "No third-party contract transfers to Buyer automatically; each transfers only if the other party consents or the contract allows it. Vendor agreements: {{vendorAgreements}}. Customer orders: {{customerOrders}}. Business service agreements: {{serviceAgreements}}.",
  },
  {
    key: "s11.responsibility",
    section: 11,
    title: "Responsibility before and after Closing",
    text: "Responsibility for obligations before and after Closing, as between the Parties: {{responsibility}}. Unless this Agreement states otherwise, Seller remains responsible for obligations arising from the operation of the Business before the Closing, and Buyer is responsible for obligations arising from its operation of the Business after the Closing.",
  },
  {
    key: "s12.intro",
    section: 12,
    title: "Licenses and permits",
    text: "No license, permit, or registration is represented to be transferable. Each may need to be newly issued to Buyer or separately approved by the issuing authority. The table below identifies which Party is responsible for each approval.",
  },
  {
    key: "s13.intro",
    section: 13,
    title: "Closing conditions",
    text: "The Parties' obligation to complete the Closing is subject to the conditions in the table below. A condition marked as required must be satisfied, or waived in writing by the Party it protects, before the Closing.",
  },
  {
    key: "s14.failure",
    section: 14,
    title: "Failure to pay and material breach",
    text: "A Party is in default if it fails to pay an amount when due under this Agreement or otherwise materially breaches this Agreement.",
  },
  {
    key: "s14.notice",
    section: 14,
    title: "Notice and cure",
    text: "The non-defaulting Party will give the defaulting Party written notice describing the default. {{cureClause}}",
  },
  {
    key: "s14.termination",
    section: 14,
    title: "Termination",
    text: "A Party may terminate this Agreement by written notice if a default is not cured as provided above, if a closing condition becomes impossible to satisfy, or as otherwise agreed in writing. Termination conditions agreed by the Parties: {{terminationNotes}}.",
  },
  {
    key: "s14.remedies",
    section: 14,
    title: "Deposit treatment and remedies",
    text: "The Deposit is treated as stated in Section 5. Each Party keeps the remedies that Applicable Law permits. This Agreement does not impose any penalty, automatic forfeiture, or liquidated damages unless it expressly says so.",
  },
  {
    key: "s15.confidentiality",
    section: 15,
    title: "Confidentiality (optional)",
    text: "Each Party will keep confidential the non-public business, financial, and customer information the other Party discloses in connection with this transaction, and will use it only to evaluate and complete the transaction. This does not apply to information that is public through no fault of the receiving Party, that the receiving Party already lawfully knew, or that must be disclosed by law or to the Party's professional advisers who are bound to confidentiality. This Section is subject to Applicable Law and to any separate confidentiality agreement between the Parties, which controls if it conflicts with this Section.",
  },
  {
    key: "s16.law",
    section: 16,
    title: "Governing law and venue",
    text: "This Agreement is governed by the laws of the {{governingLaw}}, without regard to conflict-of-laws rules. Courts and venue: {{venue}}. This is a proposed term; no guarantee is made that any provision is enforceable in every circumstance.",
  },
  {
    key: "s16.mediation",
    section: 16,
    title: "Mediation (optional)",
    text: "Before starting a lawsuit or arbitration, the Parties will first try in good faith to resolve a dispute by non-binding mediation before a mediator they agree on.",
  },
  {
    key: "s16.arbitration",
    section: 16,
    title: "Arbitration (optional)",
    text: "Any dispute not resolved by the Parties will be settled by binding arbitration under the following terms: {{arbitrationNotes}}.",
  },
  {
    key: "s17.entire",
    section: 17,
    title: "Entire agreement",
    text: "This Agreement and its Schedules are the Parties' entire agreement about this transaction and replace earlier discussions and understandings about it.",
  },
  {
    key: "s17.amendments",
    section: 17,
    title: "Written amendments",
    text: "This Agreement may be changed only in a writing signed by both Parties.",
  },
  {
    key: "s17.severability",
    section: 17,
    title: "Severability",
    text: "If a provision is held invalid or unenforceable, the rest of this Agreement continues in effect to the extent permitted by law.",
  },
  {
    key: "s17.notices",
    section: 17,
    title: "Notices",
    text: "Notices must be in writing and delivered to the address or email address of the receiving Party stated in this Agreement (or a replacement address given by notice). Seller: {{sellerNoticeAddress}}. Buyer: {{buyerNoticeAddress}}.",
  },
  {
    key: "s17.assignment",
    section: 17,
    title: "Assignment",
    text: "Neither Party may assign this Agreement without the other Party's written consent, which may not be unreasonably withheld.",
  },
  {
    key: "s17.counterparts",
    section: 17,
    title: "Counterparts",
    text: "This Agreement may be signed in counterparts, each of which is an original and all of which together are one agreement.",
  },
  {
    key: "s17.esign",
    section: 17,
    title: "Electronic signatures",
    text: "The Parties agree to sign this Agreement electronically and agree that electronic signatures and records are intended to have the same effect as handwritten signatures and paper records to the extent permitted by the federal Electronic Signatures in Global and National Commerce Act and the New York Electronic Signatures and Records Act. Some documents (for example, a deed or a notarized document) may require a different execution method; those requirements are for the Parties to check.",
  },
  {
    key: "s17.schedules",
    section: 17,
    title: "Attachments and schedules",
    text: "The Schedules and any attachments identified in the attachment index are part of this Agreement.",
  },
  {
    key: "s18.intro",
    section: 18,
    title: "Signatures",
    text: "By signing below, each Party confirms that it has read this Agreement and its Schedules and agrees to be bound by them. The signature fields below are completed only through the electronic signature service; this document does not contain any pre-filled or simulated signature.",
  },
  {
    key: "s18.witness",
    section: 18,
    title: "Witness (optional)",
    text: "Witness to the signature of the Party named above. This section is completed by the witness in person; it is not completed by the application.",
  },
  {
    key: "s18.notary",
    section: 18,
    title: "Notarial acknowledgment (optional)",
    text: "State of New York, County of ____________. A notarial acknowledgment, if the Parties want one, must be completed by a duly commissioned notary public in accordance with New York law. This application does not perform, simulate, or record any notarization.",
  },
];

export const DEFAULT_CLAUSES: Record<string, string> = Object.fromEntries(CLAUSES.map((c) => [c.key, c.text]));
export const CLAUSE_BY_KEY: Record<string, ClauseDef> = Object.fromEntries(CLAUSES.map((c) => [c.key, c]));

/** Marker text used wherever a required value has not been entered yet. */
export function tbc(label: string): string {
  return `[TO BE COMPLETED: ${label}]`;
}
export const TBC_PATTERN = /\[TO BE COMPLETED[^\]]*\]/g;

/** Replaces {{token}} with the value from `values`; an unknown or empty token becomes an explicit marker. */
export function fillTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = values[key];
    if (v === undefined) return tbc(key);
    // Tokens named "...Clause" are optional phrases, so an empty value is allowed.
    return v === "" ? (key.endsWith("Clause") ? "" : tbc(key)) : v;
  });
}

/** The wording to use: per-agreement override first, then the version's template snapshot, then the built-in default. */
export function clauseText(key: string, snapshot: Record<string, string>, overrides: Record<string, string>): string {
  return overrides[key] ?? snapshot[key] ?? DEFAULT_CLAUSES[key] ?? "";
}
