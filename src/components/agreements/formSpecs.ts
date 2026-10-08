/**
 * Declarative description of each builder step's form. Plain data (no functions),
 * so the server page can pass it to the client form component.
 */
import { ALLOCATION_LABEL, ENTITY_TYPES, LIABILITY_CATEGORIES, TRANSACTION_LABEL, TRANSACTION_TYPES } from "@/lib/agreements/schema";

export type Opt = Array<[string, string]>;
export type ColumnKind = "text" | "textarea" | "money" | "date" | "select" | "number" | "checkbox";

export interface Column {
  key: string;
  label: string;
  kind: ColumnKind;
  options?: Opt;
  /** Grid columns this takes on wide screens (1-4). */
  span?: number;
  placeholder?: string;
}

export type FieldSpec =
  | { type: "field"; kind: "text" | "email" | "tel" | "date" | "money" | "textarea" | "select" | "checkbox" | "number"; path: string; label: string; hint?: string; required?: boolean; options?: Opt; rows?: number; span?: 1 | 2; placeholder?: string }
  | { type: "list"; path: string; label: string; hint?: string; itemTitle: string; columns: Column[]; blank: Record<string, unknown>; max?: number; addLabel: string; emptyText?: string }
  | { type: "assetCategories"; path: string }
  | { type: "noneDisclosed"; path: string; itemsPath: string }
  | { type: "priceSummary" }
  | { type: "note"; text: string; tone?: "info" | "warn" };

export interface SectionSpec {
  title: string;
  description?: string;
  fields: FieldSpec[];
}

const opt = (...pairs: Array<[string, string]>): Opt => pairs;
const party = (p: "buyer" | "seller", who: string): SectionSpec[] => [
  {
    title: `${who} identity`,
    description: `Use the ${who.toLowerCase()}'s full legal names exactly as they should appear in the agreement.`,
    fields: [
      { type: "field", kind: "text", path: `${p}.legalName`, label: "Full legal name", required: true },
      { type: "field", kind: "text", path: `${p}.entityName`, label: p === "seller" ? "Business legal name" : "Business or entity name (if applicable)", hint: "Leave blank if signing only as an individual." },
      { type: "field", kind: "select", path: `${p}.entityType`, label: "Entity type", options: opt(["", "Not applicable"], ...ENTITY_TYPES.filter(Boolean).map((e): [string, string] => [e, e])) },
      { type: "field", kind: "textarea", path: `${p}.address`, label: p === "seller" ? "Business address" : "Address", required: true, rows: 3, span: 2 },
      { type: "field", kind: "email", path: `${p}.email`, label: "Email address", required: true, hint: "The signing invitation and verification code go here. Buyer and seller need different addresses." },
      { type: "field", kind: "tel", path: `${p}.phone`, label: "Phone number" },
    ],
  },
  {
    title: "Who signs, and with what authority",
    description: "Don't assume the person running the cafe owns it or can sign for it. Record what gives them authority, and attach proof in Step 7.",
    fields: [
      { type: "field", kind: "select", path: `${p}.signingCapacity`, label: "Signs as", required: true, options: opt(["", "Choose…"], ["individual", "An individual, for themselves"], ["entity_representative", "An authorized representative of the entity"]) },
      { type: "field", kind: "text", path: `${p}.repName`, label: "Authorized representative name", hint: "Required when an entity is named." },
      { type: "field", kind: "text", path: `${p}.repTitle`, label: "Representative title" },
      { type: "field", kind: "textarea", path: `${p}.authorityBasis`, label: "Authority to sign for the entity", rows: 3, span: 2, hint: "For example: the operating agreement section, board resolution, or power of attorney. An attorney should verify it." },
    ],
  },
];

export const STEP_SPECS: Record<string, SectionSpec[]> = {
  buyer: party("buyer", "Buyer"),
  seller: [
    ...party("seller", "Seller"),
    { title: "Verification", fields: [{ type: "note", tone: "warn", text: "The seller's right to sell is verified in Step 9 (before submitting). The application cannot confirm ownership or authority itself." }] },
  ],
  business: [
    {
      title: "The business",
      fields: [
        { type: "field", kind: "text", path: "business.name", label: "Business name" },
        { type: "field", kind: "text", path: "business.location", label: "Business location" },
        { type: "field", kind: "text", path: "business.streetAddress", label: "Exact street address", required: true, span: 2 },
        { type: "field", kind: "textarea", path: "business.registration", label: "Business registration details (if applicable)", rows: 2, span: 2, hint: "For example: DBA / assumed-name certificate, entity filing numbers, EIN (consider sharing only the last 4 digits)." },
      ],
    },
    {
      title: "Ownership",
      description: "Do not assume that whoever operates the cafe is the legal owner.",
      fields: [
        { type: "field", kind: "text", path: "business.owningEntity", label: "Legal entity (or person) that owns the business", required: true },
        { type: "field", kind: "text", path: "business.sellerInterest", label: "Seller's ownership interest", required: true, placeholder: "e.g. 100% of the membership interests", hint: "Describe what the seller actually holds." },
      ],
    },
    {
      title: "Type of transaction",
      description: "An asset purchase is not automatically a purchase of the business entity.",
      fields: [
        { type: "field", kind: "select", path: "business.transactionType", label: "Transaction type", required: true, options: [["", "Choose…"], ...TRANSACTION_TYPES.map((t): [string, string] => [t, TRANSACTION_LABEL[t]])], span: 2 },
        { type: "field", kind: "textarea", path: "business.transactionOther", label: "Describe the other transaction", rows: 3, span: 2, hint: "Only needed if you chose “Other”." },
        { type: "field", kind: "date", path: "business.effectiveDate", label: "Effective date", required: true },
        { type: "field", kind: "date", path: "business.proposedClosingDate", label: "Proposed closing date", required: true },
      ],
    },
  ],
  assets: [
    {
      title: "What is included",
      description: "Mark each category. Anything left as “Not decided yet” is not sold until you decide.",
      fields: [{ type: "assetCategories", path: "assets.categories" }, { type: "field", kind: "textarea", path: "assets.otherAssetsDescription", label: "Other specifically identified assets", rows: 2, span: 2 }],
    },
    {
      title: "Asset schedule (Schedules A and C)",
      description: "List individual items. Included items go into Schedule A; every item appears in Schedule C.",
      fields: [
        {
          type: "list", path: "assets.schedule", label: "Items", itemTitle: "Item", addLabel: "Add an item", max: 300,
          blank: { name: "", description: "", quantity: "", condition: "", serial: "", agreedValue: "", status: "included" },
          columns: [
            { key: "name", label: "Item name", kind: "text", span: 2 },
            { key: "status", label: "Status", kind: "select", options: opt(["included", "Included"], ["excluded", "Excluded"]) },
            { key: "quantity", label: "Quantity", kind: "text" },
            { key: "description", label: "Description", kind: "textarea", span: 2 },
            { key: "condition", label: "Condition", kind: "text" },
            { key: "serial", label: "Serial number (if any)", kind: "text" },
            { key: "agreedValue", label: "Agreed value (if any)", kind: "money" },
          ],
          emptyText: "No items yet. Add equipment, furniture, inventory, and anything else you want listed by name.",
        },
      ],
    },
    {
      title: "Excluded assets (Section 4 and Schedule B)",
      description: "Anything associated with the cafe that is NOT being sold.",
      fields: [
        {
          type: "list", path: "assets.excluded", label: "Excluded assets", itemTitle: "Excluded asset", addLabel: "Add an excluded asset", max: 100, blank: { description: "", notes: "" },
          columns: [{ key: "description", label: "Asset", kind: "text", span: 2 }, { key: "notes", label: "Notes", kind: "text", span: 2 }],
        },
      ],
    },
  ],
  price: [
    {
      title: "Purchase price and deposit",
      description: "Amounts are in US dollars. Nothing here is assumed; there are no automatic penalties.",
      fields: [
        { type: "field", kind: "money", path: "price.totalPrice", label: "Total purchase price", required: true },
        { type: "field", kind: "money", path: "price.deposit", label: "Deposit amount", required: true, hint: "Enter 0.00 if there is no deposit." },
        { type: "field", kind: "date", path: "price.depositDue", label: "Deposit due date" },
        { type: "field", kind: "text", path: "price.paymentMethod", label: "Payment method", required: true, placeholder: "e.g. wire transfer, certified check" },
        { type: "priceSummary" },
        { type: "field", kind: "textarea", path: "price.financing", label: "Financing arrangement (if any)", rows: 2, span: 2 },
        { type: "field", kind: "textarea", path: "price.escrow", label: "Escrow arrangement (if any)", rows: 2, span: 2 },
        { type: "field", kind: "textarea", path: "price.depositTerms", label: "Conditions for returning or retaining the deposit", required: true, rows: 3, span: 2 },
      ],
    },
    {
      title: "Payment schedule (Schedule F)",
      description: "Include the deposit and every later payment. The total must equal the purchase price.",
      fields: [
        {
          type: "list", path: "price.payments", label: "Payments", itemTitle: "Payment", addLabel: "Add a payment", max: 60,
          blank: { description: "", amount: "", dueDate: "", status: "scheduled" },
          columns: [
            { key: "description", label: "Description", kind: "text", span: 2 },
            { key: "amount", label: "Amount", kind: "money" },
            { key: "dueDate", label: "Due date", kind: "date" },
            { key: "status", label: "Status (recorded by the parties)", kind: "select", options: opt(["scheduled", "Scheduled"], ["paid", "Paid"], ["waived", "Waived"]) },
          ],
          emptyText: "No payments yet.",
        },
        { type: "note", text: "“Paid” is a note you record. This application does not process or verify payments." },
      ],
    },
  ],
  terms: [
    {
      title: "Closing and transfer (Section 6)",
      fields: [
        { type: "field", kind: "date", path: "closing.closingDate", label: "Closing date", required: true },
        { type: "field", kind: "text", path: "closing.location", label: "Closing location or method", required: true },
        { type: "field", kind: "date", path: "closing.possessionDate", label: "Date possession transfers", required: true },
        { type: "field", kind: "date", path: "closing.controlDate", label: "Date operational control transfers", required: true },
        { type: "field", kind: "textarea", path: "closing.transferDocuments", label: "Required transfer documents (one per line)", rows: 4, span: 2, required: true },
      ],
    },
    {
      title: "Commercial lease and premises (Section 7, Schedule E)",
      description: "Don't promise the buyer can occupy the premises unless the owner or landlord has approved it.",
      fields: [
        { type: "field", kind: "select", path: "lease.tenure", label: "Is the property owned or leased?", required: true, options: opt(["", "Choose…"], ["leased", "Leased"], ["owned", "Owned"], ["other", "Other arrangement"]) },
        { type: "field", kind: "select", path: "lease.landlordConsent", label: "Landlord consent required?", options: opt(["", "Choose…"], ["required", "Yes, required"], ["not_required", "No"], ["unknown", "Not yet determined"]) },
        { type: "field", kind: "text", path: "lease.landlordName", label: "Owner's or landlord's name" },
        { type: "field", kind: "textarea", path: "lease.landlordContact", label: "Owner's or landlord's contact information", rows: 2 },
        { type: "field", kind: "date", path: "lease.leaseExpiration", label: "Current lease expiration" },
        { type: "field", kind: "money", path: "lease.monthlyRent", label: "Monthly rent" },
        { type: "field", kind: "money", path: "lease.securityDeposit", label: "Security deposit" },
        { type: "field", kind: "textarea", path: "lease.assignmentTerms", label: "Lease assignment or replacement terms", rows: 3, span: 2 },
        { type: "field", kind: "textarea", path: "lease.utilities", label: "Responsibility for utilities and occupancy costs", rows: 2, span: 2 },
        { type: "field", kind: "textarea", path: "lease.separateRealEstate", label: "Any separate real estate transaction", rows: 2, span: 2 },
        { type: "field", kind: "textarea", path: "lease.premisesNotes", label: "Other notes", rows: 2, span: 2 },
      ],
    },
    {
      title: "Debts, taxes, and liabilities (Section 8, Schedule D)",
      description: "For each category, list the items or confirm that none are disclosed. Say who is responsible for each item as between buyer and seller. Third parties are not bound by this.",
      fields: [
        { type: "noneDisclosed", path: "liabilities.noneDisclosed", itemsPath: "liabilities.items" },
        {
          type: "list", path: "liabilities.items", label: "Disclosed liabilities", itemTitle: "Liability", addLabel: "Add a liability", max: 200,
          blank: { category: "debts", description: "", creditor: "", amount: "", allocation: "tbd", notes: "" },
          columns: [
            { key: "category", label: "Category", kind: "select", options: LIABILITY_CATEGORIES.map(([k, l]): [string, string] => [k, l]), span: 2 },
            { key: "allocation", label: "Who is responsible?", kind: "select", options: (Object.entries(ALLOCATION_LABEL) as Array<[string, string]>), span: 2 },
            { key: "description", label: "Description", kind: "text", span: 2 },
            { key: "creditor", label: "Creditor / counterparty", kind: "text" },
            { key: "amount", label: "Amount", kind: "money" },
            { key: "notes", label: "Notes", kind: "text", span: 4 },
          ],
        },
      ],
    },
    {
      title: "Employees and contracts (Section 11)",
      description: "Employees and third-party contracts do not transfer automatically. Leave a box empty to state that nothing has been specified.",
      fields: [
        { type: "field", kind: "textarea", path: "employment.existingEmployees", label: "Existing employees", rows: 2 },
        { type: "field", kind: "textarea", path: "employment.offers", label: "Potential employment offers", rows: 2 },
        { type: "field", kind: "textarea", path: "employment.payroll", label: "Payroll and accrued wages", rows: 2 },
        { type: "field", kind: "textarea", path: "employment.benefits", label: "Employee benefits", rows: 2 },
        { type: "field", kind: "textarea", path: "employment.vendorAgreements", label: "Vendor agreements", rows: 2 },
        { type: "field", kind: "textarea", path: "employment.customerOrders", label: "Customer orders", rows: 2 },
        { type: "field", kind: "textarea", path: "employment.serviceAgreements", label: "Business service agreements", rows: 2 },
        { type: "field", kind: "textarea", path: "employment.responsibility", label: "Responsibility before and after closing", rows: 2 },
      ],
    },
    {
      title: "Licenses and permits (Section 12)",
      description: "Licenses are not automatically transferable. Say who is responsible for each approval.",
      fields: [
        {
          type: "list", path: "permits", label: "Authorizations", itemTitle: "Authorization", addLabel: "Add an authorization", max: 40, blank: { name: "", applicable: "", responsible: "", notes: "" },
          columns: [
            { key: "name", label: "Authorization", kind: "text", span: 2 },
            { key: "applicable", label: "Applies?", kind: "select", options: opt(["", "Choose…"], ["yes", "Yes"], ["no", "No"], ["unknown", "Unknown"]) },
            { key: "responsible", label: "Responsible party", kind: "select", options: opt(["", "Choose…"], ["buyer", "Buyer"], ["seller", "Seller"], ["both", "Both"], ["tbd", "To be determined"]) },
            { key: "notes", label: "Notes", kind: "text", span: 4 },
          ],
        },
      ],
    },
    {
      title: "Closing conditions (Section 13, Schedule G)",
      description: "A checklist that authorized users can edit.",
      fields: [
        {
          type: "list", path: "conditions", label: "Conditions", itemTitle: "Condition", addLabel: "Add a condition", max: 60, blank: { label: "", required: true, responsible: "", status: "open", notes: "" },
          columns: [
            { key: "label", label: "Condition", kind: "text", span: 3 },
            { key: "required", label: "Required", kind: "checkbox" },
            { key: "responsible", label: "Responsible", kind: "select", options: opt(["", "—"], ["buyer", "Buyer"], ["seller", "Seller"], ["both", "Both"], ["third_party", "Third party"]) },
            { key: "status", label: "Status", kind: "select", options: opt(["open", "Open"], ["satisfied", "Satisfied"], ["waived", "Waived"]) },
            { key: "notes", label: "Notes", kind: "text", span: 2 },
          ],
        },
        { type: "field", kind: "textarea", path: "additionalConditions", label: "Additional conditions (Schedule G)", rows: 3, span: 2 },
      ],
    },
    {
      title: "Default, confidentiality, and disputes (Sections 14–16, 18)",
      description: "Proposed terms. No penalties or forfeitures are added unless you write them.",
      fields: [
        { type: "field", kind: "checkbox", path: "terms.cureAgreed", label: "The parties agree to an opportunity to cure a default" },
        { type: "field", kind: "text", path: "terms.cureDays", label: "Cure period (days)", placeholder: "e.g. 10" },
        { type: "field", kind: "textarea", path: "terms.terminationNotes", label: "Other agreed termination conditions", rows: 2, span: 2 },
        { type: "field", kind: "checkbox", path: "terms.confidentiality", label: "Include the optional confidentiality clause (Section 15)" },
        { type: "field", kind: "text", path: "terms.governingLaw", label: "Governing law (proposed: State of New York)", required: true },
        { type: "field", kind: "textarea", path: "terms.venue", label: "Court jurisdiction and venue", rows: 2, span: 2, required: true, hint: "Check this is right for you. No guarantee is made that any clause is enforceable." },
        { type: "field", kind: "checkbox", path: "terms.mediation", label: "Include optional mediation" },
        { type: "field", kind: "checkbox", path: "terms.arbitration", label: "Include optional arbitration" },
        { type: "field", kind: "textarea", path: "terms.arbitrationNotes", label: "Arbitration terms (forum, rules, seat)", rows: 2, span: 2 },
        { type: "field", kind: "checkbox", path: "terms.includeWitness", label: "Add an optional witness block to the signature page" },
        { type: "field", kind: "checkbox", path: "terms.includeNotary", label: "Add an optional notarial acknowledgment block (the app does not notarize)" },
      ],
    },
  ],
  submit: [
    {
      title: "Verification",
      description: "These confirmations are made by people, not by the application. The first two are required before sending. Attorney review is optional.",
      fields: [
        { type: "field", kind: "checkbox", path: "checkpoints.sellerAuthorityVerified", label: "The seller's authority to sell (and the signer's authority to sign) has been verified from documents" },
        { type: "field", kind: "textarea", path: "checkpoints.sellerAuthorityNotes", label: "How it was verified", rows: 2, span: 2 },
        { type: "field", kind: "checkbox", path: "checkpoints.ownershipVerified", label: "Ownership of the business, assets, or interests being sold has been verified" },
        { type: "field", kind: "textarea", path: "checkpoints.ownershipNotes", label: "How it was verified", rows: 2, span: 2 },
        { type: "field", kind: "checkbox", path: "checkpoints.leaseReviewed", label: "The lease (or ownership of the premises) and any landlord consent requirements have been reviewed" },
        { type: "field", kind: "checkbox", path: "checkpoints.attorneyReviewed", label: "An attorney has reviewed this agreement (optional)" },
        { type: "field", kind: "text", path: "checkpoints.attorneyName", label: "Attorney's name (optional)" },
        { type: "field", kind: "textarea", path: "checkpoints.attorneyNotes", label: "Notes (optional)", rows: 2, span: 2 },
      ],
    },
  ],
};
