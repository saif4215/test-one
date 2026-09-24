/**
 * Data-confidence levels (§66). A confidence level describes the data, not the
 * odds of making a profit.
 */
import { isKnown, isObserved, isStale, type Sourced } from "@/lib/data/provenance";

export type ConfidenceLevel = "HIGH CONFIDENCE" | "MODERATE CONFIDENCE" | "LOW CONFIDENCE" | "INSUFFICIENT DATA";

export interface ConfidenceInput {
  purchasePrice: Sourced<number>;
  salePrice: Sourced<number>;
  referralFee: Sourced<number>;
  fulfillmentFee: Sourced<number>;
  salesData: Sourced<unknown>;
  sellerCount: Sourced<number>;
  priceHistoryPoints: number;
  identityVerdict: "MATCH" | "POSSIBLE MATCH" | "DO NOT MATCH" | null;
  restrictionChecked: boolean;
}

export interface Confidence {
  level: ConfidenceLevel;
  reason: string;
  strengths: string[];
  gaps: string[];
}

export function assessConfidence(i: ConfidenceInput, now: Date = new Date()): Confidence {
  const strengths: string[] = [];
  const gaps: string[] = [];
  if (!isKnown(i.purchasePrice) || !isKnown(i.salePrice)) {
    return {
      level: "INSUFFICIENT DATA",
      reason: "Purchase price and selling price are both required.",
      strengths,
      gaps: [!isKnown(i.purchasePrice) ? "Purchase price unknown" : "", !isKnown(i.salePrice) ? "Selling price unknown" : ""].filter(Boolean),
    };
  }
  const priceObserved = isObserved(i.purchasePrice) && isObserved(i.salePrice);
  const priceFresh = !isStale(i.purchasePrice, now) && !isStale(i.salePrice, now);
  (priceObserved ? strengths : gaps).push(priceObserved ? "Purchase and selling prices observed" : "A price is estimated or assumed");
  if (!priceFresh) gaps.push("A price may be stale");
  else strengths.push("Prices are recent");

  const feesKnown = isKnown(i.referralFee) && isKnown(i.fulfillmentFee);
  const feesVerified = feesKnown && isObserved(i.referralFee) && isObserved(i.fulfillmentFee);
  if (feesVerified) strengths.push("Fees from Amazon or entered by you");
  else if (feesKnown) gaps.push("Fees estimated from the reference table");
  else gaps.push("Some fees unknown");

  const sales = isKnown(i.salesData);
  (sales ? strengths : gaps).push(sales ? "Sales-volume indicator available" : "No reliable sales-volume data");
  const sellers = isKnown(i.sellerCount);
  (sellers ? strengths : gaps).push(sellers ? "Seller count known" : "Seller count unknown");
  if (i.priceHistoryPoints >= 3) strengths.push(`${i.priceHistoryPoints} price-history points`);
  else gaps.push("Little or no price history");
  if (i.identityVerdict === "MATCH") strengths.push("Product identity matched by UPC/brand/pack");
  else gaps.push(i.identityVerdict ? `Product identity: ${i.identityVerdict}` : "Product identity not matched to the listing");
  (i.restrictionChecked ? strengths : gaps).push(i.restrictionChecked ? "Restrictions checked" : "Restrictions not verified");

  let level: ConfidenceLevel;
  const secondary = [sales, sellers, i.priceHistoryPoints >= 3, i.identityVerdict === "MATCH", i.restrictionChecked].filter(Boolean).length;
  if (priceObserved && priceFresh && feesVerified && secondary >= 4) level = "HIGH CONFIDENCE";
  else if (priceObserved && priceFresh && feesKnown && secondary >= 2) level = "MODERATE CONFIDENCE";
  else level = "LOW CONFIDENCE";

  const word = { "HIGH CONFIDENCE": "High", "MODERATE CONFIDENCE": "Moderate", "LOW CONFIDENCE": "Low" }[level];
  const because = strengths.length ? strengths.slice(0, 3).join(", ").toLowerCase() : "few data points are verified";
  const but = gaps.length ? `, but ${gaps.slice(0, 3).join(", ").toLowerCase()}` : "";
  const reason = `${word} confidence because ${because}${but}.`;
  return { level, reason, strengths, gaps };
}
