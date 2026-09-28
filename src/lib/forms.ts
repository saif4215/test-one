import { parseNumber } from "@/lib/format";
import type { DataKind } from "@/lib/data/provenance";
import { productInputSchema, type ProductInput, type ProvEntry } from "@/lib/domain/product";

export function fNum(fd: FormData, name: string): number | null {
  return parseNumber(fd.get(name));
}

export function fStr(fd: FormData, name: string): string | null {
  const v = fd.get(name);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function fBool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "yes" || v === "1";
}

/** "yes" → true, "no" → false, anything else → null (unknown). */
export function fTri(fd: FormData, name: string): boolean | null {
  const v = fd.get(name);
  return v === "yes" ? true : v === "no" ? false : null;
}

/** Comma- or newline-separated list. */
export function fList(fd: FormData, name: string): string[] {
  const all = fd.getAll(name).map(String);
  return all
    .flatMap((v) => v.split(/[,\n]/))
    .map((s) => s.trim())
    .filter(Boolean);
}

const NUMERIC_FIELDS = [
  "purchasePrice",
  "salePrice",
  "quantity",
  "lowPrice",
  "highPrice",
  "weightLb",
  "lengthIn",
  "widthIn",
  "heightIn",
  "fbmShippingCost",
  "referralFeeOverride",
  "fulfillmentFeeOverride",
  "prepPerUnit",
  "inboundPerUnit",
  "packagingPerUnit",
  "otherPerUnit",
  "advertisingPerUnit",
  "purchaseTaxPct",
  "returnsPct",
  "sellerCount",
  "fbaSellerCount",
  "salesRank",
  "listingMonthlySalesLow",
  "listingMonthlySalesHigh",
  "shareAssumptionPct",
  "monthsToExpiration",
  "returnRatePct",
  "leadTimeDays",
] as const;

const TRI_FIELDS = [
  "amazonOnListing",
  "fragile",
  "expiring",
  "hazmat",
  "meltable",
  "restricted",
  "brandGated",
  "counterfeitProne",
  "sourceAuthorized",
  "seasonal",
] as const;

const STRING_FIELDS = ["brand", "asin", "upc", "category", "subcategory", "sourceName", "sourceUrl"] as const;

/** Market data (competition and sales): source kind and label come from the form's market-data selector. */
const MARKET_FIELDS = new Set(["sellerCount", "fbaSellerCount", "salesRank", "listingMonthlySalesLow", "listingMonthlySalesHigh", "amazonOnListing"]);
const FEE_FIELDS = new Set(["referralFeeOverride", "fulfillmentFeeOverride"]);

/**
 * Builds a ProductInput from the product form. The hidden "__original" field
 * holds the values the form was pre-filled with (including provider provenance).
 * A value you didn't change keeps its original source; a changed value is
 * labeled with the source you chose and the time you entered it.
 */
export function productFromForm(fd: FormData, now = new Date()): ProductInput {
  let original: ProductInput = productInputSchema.parse({});
  try {
    const raw = fd.get("__original");
    if (raw) original = productInputSchema.parse(JSON.parse(String(raw)));
  } catch {
    // ignore a malformed original snapshot
  }
  const checkedInput = fStr(fd, "pricesCheckedAt");
  const checkedAt = checkedInput && !Number.isNaN(Date.parse(checkedInput)) ? new Date(checkedInput).toISOString() : now.toISOString();
  const marketKind = (fStr(fd, "marketDataKind") as DataKind | null) ?? "USER_PROVIDED";
  const marketSource = fStr(fd, "marketDataSource") ?? (marketKind === "THIRD_PARTY" ? "Third-party tool (entered by user)" : "Entered by user");
  const feeSource = fStr(fd, "feeSource") ?? "Amazon Revenue Calculator (entered by user)";
  const saleSource = fStr(fd, "salePriceSource") ?? "Amazon listing (checked by user)";

  const next: Record<string, unknown> = {
    name: fStr(fd, "name") ?? "",
    condition: fStr(fd, "condition") ?? "New",
    fulfillment: fStr(fd, "fulfillment") === "FBM" ? "FBM" : "FBA",
    sourceType: fStr(fd, "sourceType"),
    identityVerdict: fStr(fd, "identityVerdict"),
    restrictionChecked: fBool(fd, "restrictionChecked"),
    notes: fStr(fd, "notes") ?? "",
    // The listing worksheet is edited on its own page; keep it as-is here.
    listing: original.listing,
  };
  for (const k of STRING_FIELDS) next[k] = fStr(fd, k);
  for (const k of NUMERIC_FIELDS) next[k] = fNum(fd, k);
  for (const k of TRI_FIELDS) next[k] = fTri(fd, k);

  const prov: Record<string, ProvEntry> = {};
  for (const k of [...NUMERIC_FIELDS, ...TRI_FIELDS] as string[]) {
    const v = next[k];
    if (v === null || v === undefined) continue;
    const prevVal = (original as Record<string, unknown>)[k];
    const prevProv = original.prov[k];
    if (prevProv && prevVal === v) {
      prov[k] = prevProv;
      continue;
    }
    if (MARKET_FIELDS.has(k)) prov[k] = { kind: marketKind, source: marketSource, checkedAt };
    else if (FEE_FIELDS.has(k)) prov[k] = { kind: "USER_PROVIDED", source: feeSource, checkedAt };
    else if (k === "salePrice") prov[k] = { kind: "USER_PROVIDED", source: saleSource, checkedAt };
    else if (k === "purchasePrice")
      prov[k] = { kind: "USER_PROVIDED", source: (next.sourceName as string) ?? "Entered by user", url: (next.sourceUrl as string) ?? undefined, checkedAt };
    else prov[k] = { kind: "USER_PROVIDED", source: "Entered by user", checkedAt };
  }
  // Keep provenance for the non-numeric fields a provider filled (e.g. restriction check).
  for (const [k, p] of Object.entries(original.prov)) if (!(k in prov) && next[k] === (original as Record<string, unknown>)[k] && next[k] != null) prov[k] = p;
  next.prov = prov;
  return productInputSchema.parse(next);
}
