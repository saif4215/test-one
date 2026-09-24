/**
 * Risk assessment (§5, §8, §32). Each risk gets a LOW/MEDIUM/HIGH/UNKNOWN
 * level, plus what to verify and how to reduce exposure. No overall score.
 */
import type { RiskLevel } from "./capital";

export const RESTRICTION_CHECKLIST = [
  "Category restrictions (does this category require approval for your account?)",
  "Brand restrictions (is the brand gated or does it need a letter of authorization?)",
  "Product/ASIN-level restrictions",
  "Condition restrictions (e.g. some categories allow New only)",
  "Dangerous goods / hazmat classification (SDS may be required)",
  "Expiration-date requirements for FBA",
  "Meltable inventory limits (seasonal)",
  "Oversize handling requirements",
  "Authenticity requirements and documentation",
  "Invoice requirements (supplier invoices, not retail receipts, are often required)",
  "Your Amazon seller account's status and plan",
] as const;

export const UNGATED_NOTICE = "Don't assume you're approved (ungated) for this listing; check it in Seller Central.";

export interface RiskInput {
  restricted: boolean | null;
  brandGated: boolean | null;
  /** The brand or category is often counterfeited, or the source isn't an authorized distributor. */
  counterfeitProne: boolean | null;
  expiring: boolean | null;
  monthsToExpiration: number | null;
  fragile: boolean | null;
  hazmat: boolean | null;
  meltable: boolean | null;
  sizeTier: string | null;
  priceVolatility: RiskLevel;
  priceAboveAverage: boolean;
  sellerCount: number | null;
  amazonOnListing: boolean | null;
  /** Return rate in % (known or assumed). */
  returnRatePct: number | null;
  seasonal: boolean | null;
  inventoryDaysHigh: number | null;
  capitalShareOfBudgetPct: number | null;
  sourceAuthorized: boolean | null;
}

export interface RiskItem {
  category: string;
  level: RiskLevel;
  what: string;
  why: string;
  verify: string;
  mitigation: string;
}

const lvl = (b: boolean | null, yes: RiskLevel, no: RiskLevel = "LOW"): RiskLevel => (b === null ? "UNKNOWN" : b ? yes : no);

export function assessRisks(i: RiskInput): RiskItem[] {
  const items: RiskItem[] = [
    {
      category: "Restriction",
      level: lvl(i.restricted, "HIGH"),
      what: "The listing, brand, or category may need Amazon's approval before you can sell it.",
      why: "Restricted inventory can't be listed or may be stranded, which ties up capital.",
      verify: "Search the ASIN in Seller Central → Add a Product and check for 'Apply to sell'.",
      mitigation: "Check approval before buying; buy only what you're approved to list.",
    },
    {
      category: "Brand",
      level: lvl(i.brandGated, "HIGH"),
      what: "The brand may restrict resellers or file IP complaints.",
      why: "IP complaints can lead to listing removals and account health problems.",
      verify: "Check brand gating, and whether the brand enforces MAP pricing or authorized-reseller rules.",
      mitigation: "Buy from authorized distributors, and keep invoices.",
    },
    {
      category: "Counterfeit/authenticity",
      level:
        i.sourceAuthorized === false
          ? "HIGH"
          : i.counterfeitProne === null && i.sourceAuthorized === null
            ? "UNKNOWN"
            : i.counterfeitProne
              ? "MEDIUM"
              : "LOW",
      what: "Inventory may not be authentic, or you may not be able to prove that it is.",
      why: "Authenticity complaints can suspend listings or accounts.",
      verify: "Confirm the supplier is legitimate and that the invoice shows the supplier, product, and quantity.",
      mitigation: "Use authorized or reputable sources only; never use fake documentation.",
    },
    {
      category: "Expiration",
      level:
        i.expiring === null
          ? "UNKNOWN"
          : !i.expiring
            ? "LOW"
            : i.monthsToExpiration !== null && i.monthsToExpiration < 6
              ? "HIGH"
              : "MEDIUM",
      what: "The product has an expiration date.",
      why: "Amazon has minimum shelf-life requirements; expired stock can be disposed of.",
      verify: "Check the dates on the units and Amazon's current FBA expiration-date requirements.",
      mitigation: "Buy only what you can sell well before expiry; record lot numbers and dates.",
    },
    {
      category: "Fragility",
      level: lvl(i.fragile, "MEDIUM"),
      what: "The item can break in transit.",
      why: "Breakage causes returns, damaged-inventory write-offs, and poor reviews.",
      verify: "Check the packaging and Amazon's prep requirements (bubble wrap, boxing).",
      mitigation: "Budget for prep materials; start with a small test quantity.",
    },
    {
      category: "Dangerous goods",
      level: lvl(i.hazmat, "HIGH"),
      what: "The item may be classified as hazmat or dangerous goods.",
      why: "Hazmat items need review, may carry extra fees, or may be blocked from FBA.",
      verify: "Check the hazmat status in Seller Central; get an SDS from the supplier if needed.",
      mitigation: "Avoid until the classification is confirmed.",
    },
    {
      category: "Meltable",
      level: lvl(i.meltable, "MEDIUM"),
      what: "The item may melt (e.g. chocolate, some cosmetics).",
      why: "Amazon limits meltable inventory during warmer months.",
      verify: "Check Amazon's current meltable inventory dates.",
      mitigation: "Time purchases to the allowed season, or sell FBM.",
    },
    {
      category: "Size/storage",
      level:
        i.sizeTier === null
          ? "UNKNOWN"
          : i.sizeTier === "large_bulky" || i.sizeTier === "extra_large"
            ? "MEDIUM"
            : "LOW",
      what: "Large items cost more to ship, store, and return.",
      why: "Higher fees shrink margins, and storage costs grow the longer an item sits.",
      verify: "Measure the packaged dimensions and weight.",
      mitigation: "Include storage for the full expected holding period.",
    },
    {
      category: "Price",
      level: i.priceAboveAverage ? "HIGH" : i.priceVolatility,
      what: i.priceAboveAverage ? "The current price is well above its historical average." : "The price may change.",
      why: "If the price drops, profit may disappear before your stock sells.",
      verify: "Review 90-day price history and the price trend in the Buy Box.",
      mitigation: "Run the low-price scenario; use the maximum buy price; test small.",
    },
    {
      category: "Competition",
      level:
        i.sellerCount === null ? "UNKNOWN" : i.amazonOnListing ? "HIGH" : i.sellerCount > 15 ? "HIGH" : i.sellerCount > 5 ? "MEDIUM" : "LOW",
      what: i.amazonOnListing ? "Amazon itself sells on this listing." : "Other sellers compete for the Buy Box.",
      why: "More sellers means a smaller share of sales and pressure on price. The Buy Box is never guaranteed.",
      verify: "Check the current offers, FBA vs FBM sellers, and whether Amazon is on the listing.",
      mitigation: "Use a conservative sales share; watch for new sellers.",
    },
    {
      category: "Returns",
      level: i.returnRatePct === null ? "UNKNOWN" : i.returnRatePct >= 10 ? "HIGH" : i.returnRatePct >= 4 ? "MEDIUM" : "LOW",
      what: "Customers may return the item.",
      why: "Returns cost fees, shipping, and sometimes unsellable units.",
      verify: "Read review complaints about size, quality, and damage.",
      mitigation: "Keep a returns allowance in the profit calculation.",
    },
    {
      category: "Seasonality",
      level: lvl(i.seasonal, "MEDIUM"),
      what: "Demand may depend on the season or a holiday.",
      why: "Unsold seasonal stock can sit for months and pile up storage fees.",
      verify: "Compare sales-rank and price history across a full year if available.",
      mitigation: "Buy in time for the season with a clear sell-by plan.",
    },
    {
      category: "Inventory/capital",
      level:
        i.inventoryDaysHigh === null && i.capitalShareOfBudgetPct === null
          ? "UNKNOWN"
          : (i.inventoryDaysHigh ?? 0) > 90 || (i.capitalShareOfBudgetPct ?? 0) > 25
            ? "HIGH"
            : (i.inventoryDaysHigh ?? 0) > 45 || (i.capitalShareOfBudgetPct ?? 0) > 10
              ? "MEDIUM"
              : "LOW",
      what: "Capital tied up in slow-moving inventory.",
      why: "Slow stock limits cash for other opportunities and adds storage fees.",
      verify: "Estimate sell-through using conservative sales assumptions.",
      mitigation: "Cap each product's share of your capital; reorder based on actual sales.",
    },
  ];
  return items;
}

/** Highest known risk level across all items, or UNKNOWN if nothing is known. */
export function overallRiskLevel(items: RiskItem[]): RiskLevel {
  const known = items.filter((i) => i.level !== "UNKNOWN");
  if (!known.length) return "UNKNOWN";
  if (known.some((i) => i.level === "HIGH")) return "HIGH";
  if (known.some((i) => i.level === "MEDIUM")) return "MEDIUM";
  return "LOW";
}
