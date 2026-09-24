/**
 * Deal filters (§35, §59). Each criterion gets PASS / FAIL / UNKNOWN with a
 * reason. Products are never ranked; the list keeps its original order.
 */
import type { RiskLevel } from "./capital";

export interface DealFilters {
  minProfit?: number | null;
  minRoiPct?: number | null;
  minMarginPct?: number | null;
  maxPurchasePrice?: number | null;
  maxSellerCount?: number | null;
  /** Lower sales rank = more sales in that category; this is a rough indicator. */
  maxSalesRank?: number | null;
  minMonthlySalesLow?: number | null;
  maxInventoryDays?: number | null;
  allowedCategories?: string[] | null;
  excludedCategories?: string[] | null;
  maxRiskLevel?: Exclude<RiskLevel, "UNKNOWN"> | null;
  maxCapitalPerProduct?: number | null;
  excludeFragile?: boolean;
  excludeExpiring?: boolean;
  excludeRestricted?: boolean;
  excludeHazmat?: boolean;
}

export interface FilterSubject {
  purchasePrice: number | null;
  profit: number | null;
  roiPct: number | null;
  marginPct: number | null;
  sellerCount: number | null;
  salesRank: number | null;
  ownMonthlySalesLow: number | null;
  inventoryDaysHigh: number | null;
  category: string | null;
  riskLevel: RiskLevel;
  capitalRequired: number | null;
  fragile: boolean | null;
  expiring: boolean | null;
  /** true = known restricted, false = verified NOT restricted, null = unknown. */
  restricted: boolean | null;
  hazmat: boolean | null;
}

export type CriterionStatus = "PASS" | "FAIL" | "UNKNOWN";

export interface CriterionResult {
  criterion: string;
  status: CriterionStatus;
  reason: string;
}

export interface FilterOutcome {
  status: "PASS" | "FAIL" | "NEEDS DATA";
  results: CriterionResult[];
}

const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, UNKNOWN: 3 };

const money = (n: number) => `$${n.toFixed(2)}`;

function minCheck(name: string, v: number | null, min: number, fmt: (n: number) => string): CriterionResult {
  if (v === null) return { criterion: name, status: "UNKNOWN", reason: `${name} unknown (needs ≥ ${fmt(min)})` };
  return v >= min
    ? { criterion: name, status: "PASS", reason: `${fmt(v)} ≥ ${fmt(min)}` }
    : { criterion: name, status: "FAIL", reason: `${fmt(v)} < ${fmt(min)}` };
}

function maxCheck(name: string, v: number | null, max: number, fmt: (n: number) => string): CriterionResult {
  if (v === null) return { criterion: name, status: "UNKNOWN", reason: `${name} unknown (needs ≤ ${fmt(max)})` };
  return v <= max
    ? { criterion: name, status: "PASS", reason: `${fmt(v)} ≤ ${fmt(max)}` }
    : { criterion: name, status: "FAIL", reason: `${fmt(v)} > ${fmt(max)}` };
}

function flagCheck(name: string, v: boolean | null, label: string): CriterionResult {
  if (v === null) return { criterion: name, status: "UNKNOWN", reason: `Unknown whether ${label}; verify` };
  return v
    ? { criterion: name, status: "FAIL", reason: `Product is ${label}` }
    : { criterion: name, status: "PASS", reason: `Not ${label}` };
}

const pct = (n: number) => `${n.toFixed(1)}%`;
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const lc = (s: string) => s.trim().toLowerCase();

export function applyFilters(s: FilterSubject, f: DealFilters): FilterOutcome {
  const r: CriterionResult[] = [];
  if (f.maxPurchasePrice != null) r.push(maxCheck("Purchase price", s.purchasePrice, f.maxPurchasePrice, money));
  if (f.minProfit != null) r.push(minCheck("Profit per unit", s.profit, f.minProfit, money));
  if (f.minRoiPct != null) r.push(minCheck("ROI", s.roiPct, f.minRoiPct, pct));
  if (f.minMarginPct != null) r.push(minCheck("Margin", s.marginPct, f.minMarginPct, pct));
  if (f.maxSellerCount != null) r.push(maxCheck("Seller count", s.sellerCount, f.maxSellerCount, num));
  if (f.maxSalesRank != null) r.push(maxCheck("Sales rank", s.salesRank, f.maxSalesRank, num));
  if (f.minMonthlySalesLow != null)
    r.push(minCheck("Est. monthly sales (low)", s.ownMonthlySalesLow, f.minMonthlySalesLow, num));
  if (f.maxInventoryDays != null)
    r.push(maxCheck("Est. inventory duration (slow case)", s.inventoryDaysHigh, f.maxInventoryDays, (n) => `${num(n)} days`));
  if (f.maxCapitalPerProduct != null)
    r.push(maxCheck("Capital required", s.capitalRequired, f.maxCapitalPerProduct, money));

  if (f.allowedCategories?.length) {
    const ok = s.category !== null && f.allowedCategories.map(lc).includes(lc(s.category));
    r.push(
      s.category === null
        ? { criterion: "Category allowed", status: "UNKNOWN", reason: "Category unknown" }
        : { criterion: "Category allowed", status: ok ? "PASS" : "FAIL", reason: ok ? `${s.category} is allowed` : `${s.category} isn't in your allowed categories` },
    );
  }
  if (f.excludedCategories?.length) {
    const bad = s.category !== null && f.excludedCategories.map(lc).includes(lc(s.category));
    r.push(
      s.category === null
        ? { criterion: "Category not excluded", status: "UNKNOWN", reason: "Category unknown" }
        : { criterion: "Category not excluded", status: bad ? "FAIL" : "PASS", reason: bad ? `${s.category} is excluded` : `${s.category} isn't excluded` },
    );
  }
  if (f.maxRiskLevel) {
    if (s.riskLevel === "UNKNOWN") r.push({ criterion: "Risk level", status: "UNKNOWN", reason: "Risk level can't be assessed from the available data" });
    else
      r.push(
        RISK_ORDER[s.riskLevel] <= RISK_ORDER[f.maxRiskLevel]
          ? { criterion: "Risk level", status: "PASS", reason: `${s.riskLevel} ≤ ${f.maxRiskLevel}` }
          : { criterion: "Risk level", status: "FAIL", reason: `${s.riskLevel} > ${f.maxRiskLevel}` },
      );
  }
  if (f.excludeFragile) r.push(flagCheck("Not fragile", s.fragile, "fragile"));
  if (f.excludeExpiring) r.push(flagCheck("No expiration date", s.expiring, "a product with an expiration date"));
  if (f.excludeHazmat) r.push(flagCheck("Not hazmat", s.hazmat, "hazmat / dangerous goods"));
  if (f.excludeRestricted) r.push(flagCheck("No known restriction", s.restricted, "restricted or gated for your account"));

  const status = r.some((x) => x.status === "FAIL") ? "FAIL" : r.some((x) => x.status === "UNKNOWN") ? "NEEDS DATA" : "PASS";
  return { status, results: r };
}
