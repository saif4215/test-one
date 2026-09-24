import { z } from "zod";
import { DATA_KINDS, sourced, type Sourced } from "@/lib/data/provenance";

const num = z.number().finite().nullable().default(null);
const str = z.string().nullable().default(null);
/** true / false / unknown (null). */
const tri = z.boolean().nullable().default(null);

export const provEntrySchema = z.object({
  kind: z.enum(DATA_KINDS),
  source: z.string().optional(),
  url: z.string().optional(),
  checkedAt: z.string().optional(),
  note: z.string().optional(),
});
export type ProvEntry = z.infer<typeof provEntrySchema>;

export const productInputSchema = z.object({
  name: z.string().default(""),
  brand: str,
  asin: str,
  upc: str,
  category: str,
  subcategory: str,
  condition: z.string().default("New"),
  sourceType: z.enum(["retail", "online", "wholesale", "other"]).nullable().default(null),
  sourceName: str,
  sourceUrl: str,
  purchasePrice: num,
  salePrice: num,
  quantity: num,
  /** Historical low/high prices, if known; used by the scenarios. */
  lowPrice: num,
  highPrice: num,
  weightLb: num,
  lengthIn: num,
  widthIn: num,
  heightIn: num,
  fulfillment: z.enum(["FBA", "FBM"]).default("FBA"),
  fbmShippingCost: num,
  referralFeeOverride: num,
  fulfillmentFeeOverride: num,
  prepPerUnit: num,
  inboundPerUnit: num,
  packagingPerUnit: num,
  otherPerUnit: num,
  advertisingPerUnit: num,
  purchaseTaxPct: num,
  returnsPct: num,
  sellerCount: num,
  fbaSellerCount: num,
  amazonOnListing: tri,
  salesRank: num,
  listingMonthlySalesLow: num,
  listingMonthlySalesHigh: num,
  shareAssumptionPct: num,
  fragile: tri,
  expiring: tri,
  monthsToExpiration: num,
  hazmat: tri,
  meltable: tri,
  restricted: tri,
  brandGated: tri,
  counterfeitProne: tri,
  sourceAuthorized: tri,
  seasonal: tri,
  returnRatePct: num,
  /** Supplier lead time in days (for reorder planning). */
  leadTimeDays: num,
  identityVerdict: z.enum(["MATCH", "POSSIBLE MATCH", "DO NOT MATCH"]).nullable().default(null),
  restrictionChecked: z.boolean().default(false),
  notes: z.string().default(""),
  /** Where each field's value came from, keyed by field name. */
  prov: z.record(z.string(), provEntrySchema).default({}),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type NumericField = {
  [K in keyof ProductInput]: ProductInput[K] extends number | null ? K : never;
}[keyof ProductInput];

export const EMPTY_PRODUCT: ProductInput = productInputSchema.parse({});

/** A numeric field together with its provenance. Values without a provenance entry count as user-provided. */
export function field(p: ProductInput, key: NumericField, fallbackCheckedAt?: string): Sourced<number> {
  const v = p[key] as number | null;
  const pv = p.prov[key];
  if (v === null || v === undefined) return { value: null, kind: "UNKNOWN", ...(pv?.note ? { note: pv.note } : {}) };
  return sourced(v, pv?.kind ?? "USER_PROVIDED", {
    source: pv?.source ?? "Entered by user",
    url: pv?.url,
    checkedAt: pv?.checkedAt ?? fallbackCheckedAt,
    note: pv?.note,
  });
}

/** Human-readable labels for product fields (for tables, missing-data lists, and CSV headers). */
export const FIELD_LABELS: Partial<Record<keyof ProductInput, string>> = {
  name: "Product name",
  brand: "Brand",
  asin: "ASIN",
  upc: "UPC/EAN",
  category: "Category",
  subcategory: "Subcategory",
  condition: "Condition",
  sourceName: "Source",
  sourceUrl: "Source URL",
  purchasePrice: "Purchase price",
  salePrice: "Expected selling price",
  quantity: "Quantity",
  lowPrice: "Historical low price",
  highPrice: "Historical high price",
  weightLb: "Weight (lb)",
  lengthIn: "Length (in)",
  widthIn: "Width (in)",
  heightIn: "Height (in)",
  fulfillment: "Fulfillment method",
  fbmShippingCost: "FBM shipping cost",
  referralFeeOverride: "Referral fee (from Amazon)",
  fulfillmentFeeOverride: "Fulfillment fee (from Amazon)",
  prepPerUnit: "Prep per unit",
  inboundPerUnit: "Inbound shipping per unit",
  packagingPerUnit: "Packaging per unit",
  otherPerUnit: "Other cost per unit",
  advertisingPerUnit: "Advertising per unit",
  purchaseTaxPct: "Sales tax on purchase (%)",
  returnsPct: "Returns allowance (%)",
  sellerCount: "Seller count",
  fbaSellerCount: "FBA sellers",
  amazonOnListing: "Amazon on listing",
  salesRank: "Sales rank",
  listingMonthlySalesLow: "Listing monthly sales (low)",
  listingMonthlySalesHigh: "Listing monthly sales (high)",
  shareAssumptionPct: "Your share of sales (%)",
  returnRatePct: "Return rate (%)",
  monthsToExpiration: "Months to expiration",
  leadTimeDays: "Supplier lead time (days)",
};
