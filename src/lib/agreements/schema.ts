/**
 * Structured contract data. The agreement text and PDF are generated from this
 * object (plus the template), never copied by hand. Every field defaults to an
 * empty value: nothing about the parties, price, assets, or debts is invented.
 */
import { z } from "zod";
import { parseCents } from "./money";

const str = z.string().trim().max(5000).default("");
const short = z.string().trim().max(300).default("");
const email = z
  .string()
  .trim()
  .max(254)
  .default("")
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Enter a valid email address.");
const date = z
  .string()
  .trim()
  .default("")
  .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "Use a valid date.");
const money = z
  .string()
  .trim()
  .max(20)
  .default("")
  .refine((v) => v === "" || parseCents(v) !== null, "Enter an amount like 12500.00.");
const bool = z.boolean().default(false);

export const ENTITY_TYPES = ["", "Individual / sole proprietor", "LLC", "Corporation", "Partnership", "Other"] as const;
export const SIGNING_CAPACITY = ["", "individual", "entity_representative"] as const;

export const partySchema = z.object({
  legalName: short,
  entityName: short,
  entityType: short,
  address: str,
  email,
  phone: short,
  repName: short,
  repTitle: short,
  signingCapacity: z.enum(SIGNING_CAPACITY).default(""),
  /** What gives the representative authority (resolution, operating agreement section, etc.). */
  authorityBasis: str,
});
export type Party = z.infer<typeof partySchema>;

export const TRANSACTION_TYPES = [
  "asset_purchase",
  "equity_purchase",
  "operations_goodwill",
  "other",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export const TRANSACTION_LABEL: Record<TransactionType | "", string> = {
  "": "Not selected",
  asset_purchase: "Asset purchase",
  equity_purchase: "Purchase of ownership or equity interests in a business entity",
  operations_goodwill: "Business operations and goodwill purchase",
  other: "Other transaction (to be reviewed by the parties' attorneys)",
};

export const businessSchema = z.object({
  name: short.default("Maruf Cafe").or(z.literal("")),
  location: short,
  streetAddress: short,
  registration: str,
  owningEntity: short,
  sellerInterest: short,
  transactionType: z.enum(["", ...TRANSACTION_TYPES]).default(""),
  transactionOther: str,
  effectiveDate: date,
  proposedClosingDate: date,
});

export const ASSET_CATEGORIES = [
  ["kitchenEquipment", "Kitchen equipment"],
  ["furnitureFixtures", "Furniture and fixtures"],
  ["appliances", "Refrigerators and other appliances"],
  ["inventory", "Inventory"],
  ["supplies", "Supplies"],
  ["tradeName", "Trade name and branding (if transferable)"],
  ["website", "Website and domain"],
  ["phoneNumbers", "Telephone numbers"],
  ["socialMedia", "Social media accounts (where transferable)"],
  ["customerRecords", "Customer records (where legally permitted)"],
  ["goodwill", "Goodwill"],
  ["otherAssets", "Other specifically identified assets"],
] as const;
export type AssetCategoryKey = (typeof ASSET_CATEGORIES)[number][0];
export const ASSET_CHOICES = ["tbd", "included", "excluded"] as const;

export const assetItemSchema = z.object({
  name: short,
  description: str,
  quantity: short,
  condition: short,
  serial: short,
  agreedValue: money,
  status: z.enum(["included", "excluded"]).default("included"),
});
export type AssetItem = z.infer<typeof assetItemSchema>;

export const excludedAssetSchema = z.object({ description: str, notes: str });

export const assetsSchema = z.object({
  categories: z.record(z.string(), z.enum(ASSET_CHOICES)).default({}),
  otherAssetsDescription: str,
  schedule: z.array(assetItemSchema).max(300).default([]),
  excluded: z.array(excludedAssetSchema).max(100).default([]),
});

export const PAYMENT_STATUS = ["scheduled", "paid", "waived"] as const;
export const paymentSchema = z.object({
  description: short,
  amount: money,
  dueDate: date,
  status: z.enum(PAYMENT_STATUS).default("scheduled"),
});

export const priceSchema = z.object({
  totalPrice: money,
  deposit: money,
  depositDue: date,
  paymentMethod: short,
  payments: z.array(paymentSchema).max(60).default([]),
  financing: str,
  escrow: str,
  depositTerms: str,
});

export const LIABILITY_CATEGORIES = [
  ["debts", "Business debts"],
  ["taxes", "Unpaid taxes"],
  ["vendors", "Vendor balances"],
  ["equipmentLoans", "Equipment loans"],
  ["liens", "Liens and security interests"],
  ["claims", "Pending lawsuits or claims"],
  ["wages", "Employee wages and benefits"],
  ["customerOrders", "Outstanding customer orders"],
  ["giftCards", "Gift cards and customer credits"],
  ["other", "Other known liabilities"],
] as const;
export const ALLOCATIONS = ["tbd", "buyer_assumes", "seller_retains"] as const;
export const ALLOCATION_LABEL: Record<(typeof ALLOCATIONS)[number], string> = {
  tbd: "To be determined",
  buyer_assumes: "Buyer expressly assumes",
  seller_retains: "Remains Seller's responsibility",
};

export const liabilitySchema = z.object({
  category: z.string().default("other"),
  description: str,
  creditor: short,
  amount: money,
  allocation: z.enum(ALLOCATIONS).default("tbd"),
  notes: str,
});
export type Liability = z.infer<typeof liabilitySchema>;

export const leaseSchema = z.object({
  tenure: z.enum(["", "leased", "owned", "other"]).default(""),
  landlordName: short,
  landlordContact: str,
  leaseExpiration: date,
  monthlyRent: money,
  securityDeposit: money,
  assignmentTerms: str,
  landlordConsent: z.enum(["", "required", "not_required", "unknown"]).default(""),
  utilities: str,
  separateRealEstate: str,
  premisesNotes: str,
});

export const closingSchema = z.object({
  closingDate: date,
  location: short,
  possessionDate: date,
  controlDate: date,
  transferDocuments: str,
});

export const CONDITION_STATUS = ["open", "satisfied", "waived"] as const;
export const conditionSchema = z.object({
  label: short,
  required: z.boolean().default(true),
  responsible: z.enum(["", "buyer", "seller", "both", "third_party"]).default(""),
  status: z.enum(CONDITION_STATUS).default("open"),
  notes: str,
});
export type Condition = z.infer<typeof conditionSchema>;

export const permitSchema = z.object({
  name: short,
  applicable: z.enum(["", "yes", "no", "unknown"]).default(""),
  responsible: z.enum(["", "buyer", "seller", "both", "tbd"]).default(""),
  notes: str,
});

export const employmentSchema = z.object({
  existingEmployees: str,
  offers: str,
  payroll: str,
  benefits: str,
  vendorAgreements: str,
  customerOrders: str,
  serviceAgreements: str,
  responsibility: str,
});

export const termsSchema = z.object({
  cureAgreed: bool,
  cureDays: z.string().trim().max(3).default("").refine((v) => v === "" || /^\d{1,3}$/.test(v), "Enter a number of days."),
  terminationNotes: str,
  confidentiality: bool,
  governingLaw: short.default("State of New York").or(z.literal("")),
  venue: str,
  mediation: bool,
  arbitration: bool,
  arbitrationNotes: str,
  includeWitness: bool,
  includeNotary: bool,
});

/** Verification checkpoints: the app never assumes the person running the cafe owns it or may sell it. */
export const checkpointsSchema = z.object({
  sellerAuthorityVerified: bool,
  sellerAuthorityNotes: str,
  ownershipVerified: bool,
  ownershipNotes: str,
  leaseReviewed: bool,
  attorneyReviewed: bool,
  attorneyName: short,
  attorneyNotes: str,
});

export const agreementDataSchema = z.object({
  buyer: partySchema.default(() => partySchema.parse({})),
  seller: partySchema.default(() => partySchema.parse({})),
  business: businessSchema.default(() => businessSchema.parse({})),
  assets: assetsSchema.default(() => assetsSchema.parse({})),
  price: priceSchema.default(() => priceSchema.parse({})),
  liabilities: z
    .object({
      items: z.array(liabilitySchema).max(200).default([]),
      noneDisclosed: z.array(z.string()).default([]),
    })
    .default({ items: [], noneDisclosed: [] }),
  lease: leaseSchema.default(() => leaseSchema.parse({})),
  closing: closingSchema.default(() => closingSchema.parse({})),
  conditions: z.array(conditionSchema).max(60).default([]),
  permits: z.array(permitSchema).max(40).default([]),
  employment: employmentSchema.default(() => employmentSchema.parse({})),
  terms: termsSchema.default(() => termsSchema.parse({})),
  checkpoints: checkpointsSchema.default(() => checkpointsSchema.parse({})),
  /** Per-agreement wording changes made by an attorney or authorized editor, keyed by clause key. */
  clauseOverrides: z.record(z.string(), z.string().max(20000)).default({}),
  /** Extra "Schedule G" conditions, free text. */
  additionalConditions: str,
});
export type AgreementData = z.infer<typeof agreementDataSchema>;

export const DEFAULT_CONDITIONS: Array<Pick<Condition, "label">> = [
  { label: "Landlord consent to lease assignment or a replacement lease, if required" },
  { label: "Other required third-party approvals" },
  { label: "Releases of liens and security interests" },
  { label: "Inventory and equipment verification" },
  { label: "Financing approval, if applicable" },
  { label: "Execution of transfer documents" },
  { label: "Required regulatory approvals" },
];

export const DEFAULT_PERMITS = [
  "Food-service permits",
  "Health approvals",
  "Business registrations",
  "Alcohol license (if applicable)",
  "Other regulatory authorizations",
];

export function defaultAgreementData(): AgreementData {
  const d = agreementDataSchema.parse({});
  d.business.name = "Maruf Cafe";
  d.business.location = "Staten Island, New York";
  d.terms.governingLaw = "State of New York";
  d.conditions = DEFAULT_CONDITIONS.map((c) => conditionSchema.parse({ label: c.label }));
  d.permits = DEFAULT_PERMITS.map((name) => permitSchema.parse({ name }));
  return d;
}

/** Parses stored or submitted data, applying defaults for anything missing. */
export function parseAgreementData(raw: unknown) {
  return agreementDataSchema.safeParse(raw ?? {});
}

export function partyDisplayName(p: Party): string {
  return p.entityName || p.legalName;
}
