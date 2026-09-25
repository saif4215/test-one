/**
 * The research pipeline for one product (§5, §33, §40, §70, §71).
 * Combines the pure calc modules into a single serializable report.
 */
import type { FeeTable } from "@/data/feeTables.us";
import { suggestTestQuantity, type RiskLevel, type TestBuyResult } from "@/lib/calc/capital";
import { assessConfidence, type Confidence } from "@/lib/calc/confidence";
import { estimateFees, referralFee, referralRuleFor, type FeeEstimate } from "@/lib/calc/fees";
import { applyFilters, type FilterOutcome, type FilterSubject } from "@/lib/calc/filters";
import { scalingPlan, type ScalingPlan } from "@/lib/calc/inventory";
import { analyzePriceHistory, type PriceHistoryAnalysis, type PriceObservation } from "@/lib/calc/priceHistory";
import {
  batchEconomics,
  breakEvenPrice,
  maxBuyCost,
  minProfitablePrice,
  unitEconomics,
  type BatchEconomics,
  type CostModel,
  type UnitEconomics,
} from "@/lib/calc/profit";
import { assessRisks, overallRiskLevel, RESTRICTION_CHECKLIST, UNGATED_NOTICE, type RiskItem } from "@/lib/calc/risk";
import { priceScenarios, sensitivity, type Scenario, type SensitivityRow } from "@/lib/calc/scenarios";
import { estimateVelocity, type VelocityResult } from "@/lib/calc/velocity";
import {
  isStale,
  LIVE_DATA_UNAVAILABLE,
  sourced,
  UNAVAILABLE_MESSAGE,
  type DataKind,
  type Sourced,
} from "@/lib/data/provenance";
import { field, type ProductInput } from "@/lib/domain/product";
import type { Settings } from "@/lib/domain/settings";
import { fmtPct, fmtUSD } from "@/lib/format";

export interface AnalysisContext {
  settings: Settings;
  feeTable: FeeTable;
  now?: Date;
  priceHistory?: PriceObservation[];
  /** When the product's data was last saved; used as the timestamp for values without one. */
  checkedAt?: string;
}

export interface CostLine {
  key: string;
  label: string;
  value: number | null;
  kind: DataKind;
  source?: string;
  note?: string;
  group: "upfront" | "deducted";
}

export interface DataPoint {
  label: string;
  value: number | null;
  format: "usd" | "number" | "pct";
  kind: DataKind;
  source?: string;
  url?: string;
  checkedAt?: string;
  stale: boolean;
  note?: string;
}

export interface FulfillmentComparison {
  fba: UnitEconomics | null;
  fbm: UnitEconomics | null;
  fbaNote: string;
  fbmNote: string;
  tradeoffs: { factor: string; fba: string; fbm: string }[];
}

export interface DealAnalysis {
  product: ProductInput;
  generatedAt: string;
  liveDataNote: string;
  fees: FeeEstimate;
  costLines: CostLine[];
  /** Cost items that are unknown and therefore missing from the profit figure. */
  unknownCosts: string[];
  unit: UnitEconomics | null;
  batch: BatchEconomics | null;
  breakEvenPrice: number | null;
  minProfitablePrice: number | null;
  maxBuyCost: number | null;
  fulfillment: FulfillmentComparison;
  scenarios: Scenario[];
  sensitivity: SensitivityRow[];
  velocity: VelocityResult;
  priceHistory: PriceHistoryAnalysis;
  risks: RiskItem[];
  overallRisk: RiskLevel;
  confidence: Confidence;
  testBuy: TestBuyResult | null;
  testBuyNote: string | null;
  scaling: ScalingPlan | null;
  filter: FilterOutcome;
  /** The values the deal filters are checked against (for re-filtering with other criteria). */
  filterSubject: FilterSubject;
  dataPoints: DataPoint[];
  assumptions: string[];
  missing: string[];
  verify: string[];
  attractive: string[];
  unprofitableIf: string[];
}

/** Compact numbers for tables, bulk scans, and alerts. */
export interface DealSummary {
  profit: number | null;
  roiPct: number | null;
  marginPct: number | null;
  amazonFees: number | null;
  totalCost: number | null;
  breakEvenPrice: number | null;
  maxBuyCost: number | null;
  risk: RiskLevel;
  confidence: string;
  filterStatus: FilterOutcome["status"];
  missingCount: number;
  ownMonthlySales: string | null;
}

export function summarize(a: DealAnalysis): DealSummary {
  return {
    profit: a.unit?.profit ?? null,
    roiPct: a.unit?.roiPct ?? null,
    marginPct: a.unit?.marginPct ?? null,
    amazonFees: a.unit?.amazonFees ?? null,
    totalCost: a.unit?.totalCost ?? null,
    breakEvenPrice: a.breakEvenPrice,
    maxBuyCost: a.maxBuyCost,
    risk: a.overallRisk,
    confidence: a.confidence.level,
    filterStatus: a.filter.status,
    missingCount: a.missing.length,
    ownMonthlySales: a.velocity.sufficient
      ? `${a.velocity.monthly.low.toFixed(1)}–${a.velocity.monthly.high.toFixed(1)}`
      : null,
  };
}

const FBA_FBM_TRADEOFFS = [
  { factor: "Fulfillment cost", fba: "Per-unit FBA fee by size and weight", fbm: "Your shipping labels and packing materials" },
  { factor: "Storage", fba: "Monthly storage fees (higher Oct–Dec), plus aged-inventory surcharges", fbm: "Your own space; no Amazon storage fee" },
  { factor: "Prime eligibility", fba: "Usually Prime-eligible", fbm: "Only through Seller Fulfilled Prime, if you qualify" },
  { factor: "Returns", fba: "Amazon handles returns; some return processing fees", fbm: "You handle returns directly" },
  { factor: "Handling time", fba: "None after the inbound shipment", fbm: "You pack and ship every order on time" },
  { factor: "Capital", fba: "Inventory and inbound shipping paid upfront", fbm: "Can hold smaller quantities" },
  { factor: "Complexity", fba: "Prep and labeling rules, shipment plans", fbm: "Daily order handling, shipping-performance metrics" },
];

function resolveCost(
  p: ProductInput,
  key: keyof ProductInput & string,
  fallback: number | null,
  fallbackLabel: string,
  checkedAt?: string,
): Sourced<number> {
  const v = p[key] as number | null;
  if (v !== null && v !== undefined) {
    const pv = p.prov[key];
    return sourced(v, pv?.kind ?? "USER_PROVIDED", { source: pv?.source ?? "Entered by user", checkedAt: pv?.checkedAt ?? checkedAt });
  }
  if (fallback === null) return { value: null, kind: "UNKNOWN" };
  return sourced(fallback, "ASSUMPTION", { source: fallbackLabel });
}

interface BuiltModel {
  model: CostModel;
  lines: CostLine[];
  fees: FeeEstimate;
  unknown: string[];
}

function buildModel(p: ProductInput, fulfillment: "FBA" | "FBM", ctx: AnalysisContext, now: Date): BuiltModel {
  const d = ctx.settings.costDefaults;
  const price = p.salePrice ?? 0;
  const dims =
    p.lengthIn !== null && p.widthIn !== null && p.heightIn !== null
      ? { lengthIn: p.lengthIn, widthIn: p.widthIn, heightIn: p.heightIn }
      : null;
  const referralOverride = p.referralFeeOverride !== null ? field(p, "referralFeeOverride", ctx.checkedAt) : undefined;
  const fulfillmentOverride =
    p.fulfillmentFeeOverride !== null && fulfillment === p.fulfillment
      ? field(p, "fulfillmentFeeOverride", ctx.checkedAt)
      : undefined;
  const fees = estimateFees(ctx.feeTable, {
    category: p.category,
    price,
    fulfillment,
    dims,
    unitWeightLb: p.weightLb,
    expectedStorageDays: d.expectedStorageDays,
    month: now.getMonth() + 1,
    fbmShippingCost: p.fbmShippingCost,
    referralOverride,
    fulfillmentOverride,
  });

  const settingsLabel = "Default from Settings (assumption)";
  const tax = resolveCost(p, "purchaseTaxPct", d.purchaseTaxPct, settingsLabel, ctx.checkedAt);
  const inbound =
    fulfillment === "FBM"
      ? sourced(0, "ASSUMPTION", { source: "FBM: no inbound shipment to Amazon" })
      : resolveCost(
          p,
          "inboundPerUnit",
          p.weightLb !== null ? p.weightLb * d.inboundPerLb : null,
          `Weight × $${d.inboundPerLb}/lb (assumption)`,
          ctx.checkedAt,
        );
  const prep = resolveCost(p, "prepPerUnit", fulfillment === "FBM" ? 0 : d.prepPerUnit, settingsLabel, ctx.checkedAt);
  const packaging = resolveCost(p, "packagingPerUnit", d.packagingPerUnit, settingsLabel, ctx.checkedAt);
  const other = resolveCost(p, "otherPerUnit", 0, "None entered (assumption)", ctx.checkedAt);
  const ads = resolveCost(p, "advertisingPerUnit", d.advertisingPerUnit, settingsLabel, ctx.checkedAt);
  const returns = resolveCost(p, "returnsPct", d.returnsPct, settingsLabel, ctx.checkedAt);

  // If Amazon (or you) supplied the referral fee for this price, convert it to an effective %
  // so break-even and scenario prices use the same rate.
  const { rule } = referralRuleFor(ctx.feeTable, p.category);
  const referralFn =
    referralOverride?.value != null && price > 0
      ? (x: number) => (referralOverride.value! / price) * x
      : (x: number) => referralFee(rule, x);

  const unknown: string[] = [];
  const v = (s: Sourced<number>, label: string) => {
    if (s.value === null) unknown.push(label);
    return s.value ?? 0;
  };

  const model: CostModel = {
    purchasePrice: p.purchasePrice ?? 0,
    purchaseTaxPct: v(tax, "Sales tax on purchase"),
    inboundShipping: v(inbound, "Inbound shipping"),
    prep: v(prep, "Prep"),
    packaging: v(packaging, "Packaging"),
    otherUpfront: v(other, "Other costs"),
    fulfillment: v(fees.fulfillment, fulfillment === "FBA" ? "FBA fulfillment fee" : "FBM shipping"),
    storage: v(fees.storage, "Storage"),
    advertising: v(ads, "Advertising"),
    closingFee: fees.closing.value ?? 0,
    referral: referralFn,
    returnsPct: v(returns, "Returns allowance"),
  };

  const u = p.salePrice !== null ? unitEconomics(model, p.salePrice) : null;
  const purchase = field(p, "purchasePrice", ctx.checkedAt);
  const lines: CostLine[] = [
    { key: "purchase", label: "Purchase price", value: purchase.value, kind: purchase.kind, source: purchase.source, group: "upfront" },
    {
      key: "tax",
      label: "Sales tax on purchase",
      value: u ? u.purchaseCost - model.purchasePrice : null,
      kind: tax.kind,
      source: tax.source,
      note: tax.value !== null ? `${tax.value}% of purchase price` : undefined,
      group: "upfront",
    },
    { key: "inbound", label: "Inbound shipping", value: inbound.value, kind: inbound.kind, source: inbound.source, group: "upfront" },
    { key: "prep", label: "Prep", value: prep.value, kind: prep.kind, source: prep.source, group: "upfront" },
    { key: "packaging", label: "Packaging", value: packaging.value, kind: packaging.kind, source: packaging.source, group: "upfront" },
    { key: "other", label: "Other costs", value: other.value, kind: other.kind, source: other.source, group: "upfront" },
    {
      key: "referral",
      label: "Referral fee",
      value: u ? u.referralFee : fees.referral.value,
      kind: fees.referral.kind,
      source: fees.referral.source,
      group: "deducted",
    },
    ...(model.closingFee
      ? [{ key: "closing", label: "Closing fee", value: model.closingFee, kind: fees.closing.kind, source: fees.closing.source, group: "deducted" as const }]
      : []),
    {
      key: "fulfillment",
      label: fulfillment === "FBA" ? "FBA fulfillment fee" : "FBM shipping",
      value: fees.fulfillment.value,
      kind: fees.fulfillment.kind,
      source: fees.fulfillment.source,
      note: fees.fulfillment.note ?? (fees.sizeTier ? `Size tier: ${fees.sizeTier.tier.replace("_", " ")}, ${fees.sizeTier.shippingWeightLb.toFixed(2)} lb shipping weight` : undefined),
      group: "deducted",
    },
    { key: "storage", label: "Storage", value: fees.storage.value, kind: fees.storage.kind, source: fees.storage.source, note: fees.storage.note, group: "deducted" },
    {
      key: "returns",
      label: "Returns allowance",
      value: u ? u.returnsAllowance : null,
      kind: returns.kind,
      source: returns.source,
      note: returns.value !== null ? `${returns.value}% of sale price` : undefined,
      group: "deducted",
    },
    { key: "ads", label: "Advertising", value: ads.value, kind: ads.kind, source: ads.source, group: "deducted" },
  ];
  return { model, lines, fees, unknown };
}

export function analyzeProduct(p: ProductInput, ctx: AnalysisContext): DealAnalysis {
  const now = ctx.now ?? new Date();
  const s = ctx.settings;
  const d = s.costDefaults;
  const staleDays = d.staleAfterDays;
  const assumptions: string[] = [];
  const missing: string[] = [];

  const main = buildModel(p, p.fulfillment, ctx, now);
  const other = buildModel(p, p.fulfillment === "FBA" ? "FBM" : "FBA", ctx, now);
  const canPrice = p.purchasePrice !== null && p.salePrice !== null;
  const unit = canPrice ? unitEconomics(main.model, p.salePrice!) : null;
  const qty = p.quantity ?? null;
  const batch = unit && qty ? batchEconomics(unit, qty) : null;

  const history = analyzePriceHistory(ctx.priceHistory ?? [], now, { aboveAverageWarnPct: d.aboveAverageWarnPct });

  // Scenarios use the historical low/high when they're known.
  const lowPrice = p.lowPrice ?? history.lowest;
  const highPrice = p.highPrice ?? (history.observations >= 3 ? history.highest : null);
  const scenarios = unit
    ? priceScenarios(main.model, p.salePrice!, {
        low: lowPrice !== null && lowPrice < p.salePrice! ? lowPrice : null,
        high: highPrice,
        highSupport: p.highPrice !== null ? "Historical high you entered." : "Highest price in the recorded history.",
      })
    : [];

  const hasSales = p.listingMonthlySalesLow !== null || p.listingMonthlySalesHigh !== null;
  const velocity = estimateVelocity({
    listingMonthlySales: hasSales
      ? {
          low: p.listingMonthlySalesLow ?? p.listingMonthlySalesHigh!,
          high: p.listingMonthlySalesHigh ?? p.listingMonthlySalesLow!,
        }
      : null,
    sellerCount: p.sellerCount,
    shareAssumptionPct: p.shareAssumptionPct,
    quantity: qty,
  });
  const ownMonthlyLow = velocity.sufficient ? velocity.monthly.low : null;
  const sens = unit ? sensitivity(main.model, p.salePrice!, ownMonthlyLow) : [];

  const fulfillmentComparison: FulfillmentComparison = {
    fba: null,
    fbm: null,
    fbaNote: "",
    fbmNote: "",
    tradeoffs: FBA_FBM_TRADEOFFS,
  };
  for (const [mode, built] of [
    [p.fulfillment, main],
    [p.fulfillment === "FBA" ? "FBM" : "FBA", other],
  ] as const) {
    const ue = canPrice ? unitEconomics(built.model, p.salePrice!) : null;
    const note = built.unknown.length ? `Excludes unknown: ${built.unknown.join(", ")}` : "All cost items included";
    if (mode === "FBA") {
      fulfillmentComparison.fba = ue;
      fulfillmentComparison.fbaNote = note;
    } else {
      fulfillmentComparison.fbm = ue;
      fulfillmentComparison.fbmNote = note;
    }
  }

  const invDaysHigh =
    velocity.sufficient && velocity.inventoryDurationDays && Number.isFinite(velocity.inventoryDurationDays.high)
      ? velocity.inventoryDurationDays.high
      : null;
  const capitalRequired = unit && qty ? unit.upfrontCost * qty : unit ? unit.upfrontCost : null;
  const risks = assessRisks({
    restricted: p.restricted,
    brandGated: p.brandGated,
    counterfeitProne: p.counterfeitProne,
    expiring: p.expiring,
    monthsToExpiration: p.monthsToExpiration,
    fragile: p.fragile,
    hazmat: p.hazmat,
    meltable: p.meltable,
    sizeTier: main.fees.sizeTier?.tier ?? null,
    priceVolatility: history.volatilityLevel,
    priceAboveAverage: history.warnings.some((w) => w.includes("above the 90-day average")),
    sellerCount: p.sellerCount,
    amazonOnListing: p.amazonOnListing,
    returnRatePct: p.returnRatePct,
    seasonal: p.seasonal,
    inventoryDaysHigh: invDaysHigh,
    capitalShareOfBudgetPct: capitalRequired !== null && s.startingBudget ? (capitalRequired / s.startingBudget) * 100 : null,
    sourceAuthorized: p.sourceAuthorized,
  });
  const overallRisk = overallRiskLevel(risks);

  const confidence = assessConfidence(
    {
      purchasePrice: field(p, "purchasePrice", ctx.checkedAt),
      salePrice: field(p, "salePrice", ctx.checkedAt),
      referralFee: main.fees.referral,
      fulfillmentFee: main.fees.fulfillment,
      salesData: hasSales ? field(p, p.listingMonthlySalesLow !== null ? "listingMonthlySalesLow" : "listingMonthlySalesHigh", ctx.checkedAt) : { value: null, kind: "UNKNOWN" },
      sellerCount: field(p, "sellerCount", ctx.checkedAt),
      priceHistoryPoints: history.observations,
      identityVerdict: p.identityVerdict,
      restrictionChecked: p.restrictionChecked,
    },
    now,
  );

  let testBuy: TestBuyResult | null = null;
  let testBuyNote: string | null = null;
  if (!unit) testBuyNote = "Purchase and selling prices are needed to size a test buy.";
  else if (!s.startingBudget) testBuyNote = "Set your starting budget in Settings to size a test buy.";
  else {
    testBuy = suggestTestQuantity({
      capitalAvailable: s.startingBudget,
      unitInvestment: unit.upfrontCost,
      risk: overallRisk,
      ownMonthlySalesLow: ownMonthlyLow,
      priceVolatility: history.volatilityLevel,
      monthsToExpiration: p.expiring ? p.monthsToExpiration : null,
      maxCapitalPctPerProduct: d.maxCapitalPctPerProduct,
    });
  }

  let scaling: ScalingPlan | null = null;
  if (unit && velocity.sufficient && s.startingBudget) {
    const lead = p.leadTimeDays ?? 14;
    if (p.leadTimeDays === null) assumptions.push("Supplier lead time assumed to be 14 days for reorder planning.");
    scaling = scalingPlan({
      avgDailySales: velocity.daily.low,
      leadTimeDays: lead,
      safetyDays: d.safetyDays,
      reviewPeriodDays: 30,
      unitCost: unit.upfrontCost,
      capitalAvailable: s.startingBudget,
      maxCapitalPct: d.maxCapitalPctPerProduct,
    });
  }

  const subject: FilterSubject = {
    purchasePrice: p.purchasePrice,
    profit: unit?.profit ?? null,
    roiPct: unit?.roiPct ?? null,
    marginPct: unit?.marginPct ?? null,
    sellerCount: p.sellerCount,
    salesRank: p.salesRank,
    ownMonthlySalesLow: ownMonthlyLow,
    inventoryDaysHigh: invDaysHigh,
    category: p.category,
    riskLevel: overallRisk,
    capitalRequired,
    fragile: p.fragile,
    expiring: p.expiring,
    restricted: p.restricted,
    hazmat: p.hazmat,
  };
  const filter = applyFilters(subject, {
    ...s.filters,
    minProfit: s.filters.minProfit ?? s.targetMinProfit,
    minRoiPct: s.filters.minRoiPct ?? s.targetRoiPct,
    minMarginPct: s.filters.minMarginPct ?? s.targetMarginPct,
    excludedCategories: [...s.filters.excludedCategories, ...s.avoidCategories],
  });

  const breakEven = unit ? breakEvenPrice(main.model) : null;
  const minPrice = unit ? minProfitablePrice(main.model, s.targetMinProfit, s.targetRoiPct) : null;
  const maxBuy = p.salePrice !== null ? maxBuyCost(main.model, p.salePrice, s.targetMinProfit, s.targetRoiPct) : null;

  // ---- Data points with provenance ----
  const dp = (label: string, src: Sourced<number>, format: DataPoint["format"]): DataPoint => ({
    label,
    value: src.value,
    format,
    kind: src.kind,
    source: src.source,
    url: src.url,
    checkedAt: src.checkedAt,
    stale: isStale(src, now, staleDays),
    note: src.value === null ? UNAVAILABLE_MESSAGE : src.note,
  });
  const dataPoints: DataPoint[] = [
    dp("Purchase price", field(p, "purchasePrice", ctx.checkedAt), "usd"),
    dp("Selling price", field(p, "salePrice", ctx.checkedAt), "usd"),
    dp("Referral fee", main.fees.referral, "usd"),
    dp(p.fulfillment === "FBA" ? "FBA fee" : "FBM shipping", main.fees.fulfillment, "usd"),
    dp("Seller count", field(p, "sellerCount", ctx.checkedAt), "number"),
    dp("Sales rank", field(p, "salesRank", ctx.checkedAt), "number"),
    dp("Listing monthly sales (low)", field(p, "listingMonthlySalesLow", ctx.checkedAt), "number"),
    dp("Listing monthly sales (high)", field(p, "listingMonthlySalesHigh", ctx.checkedAt), "number"),
  ];

  const liveSources = new Set(
    Object.values(p.prov)
      .filter((v) => v.kind === "VERIFIED" && v.source)
      .map((v) => v.source!),
  );
  const liveDataNote = liveSources.size
    ? `Live data used from: ${[...liveSources].join(", ")}. Everything else is from the information provided.`
    : LIVE_DATA_UNAVAILABLE;

  // ---- Missing information ----
  const need = (cond: boolean, label: string) => {
    if (cond) missing.push(label);
  };
  need(!p.name, "Product name");
  need(!p.brand, "Brand");
  need(!p.asin && !p.upc, "ASIN or UPC/EAN");
  need(!p.category, "Category (sets the referral fee rate)");
  need(p.purchasePrice === null, "Purchase price");
  need(p.salePrice === null, "Expected selling price");
  need(p.quantity === null, "Quantity");
  if (p.fulfillment === "FBA") {
    need(p.weightLb === null, "Weight");
    need(p.lengthIn === null || p.widthIn === null || p.heightIn === null, "Package dimensions");
  } else need(p.fbmShippingCost === null && p.fulfillmentFeeOverride === null, "FBM shipping cost");
  need(p.sellerCount === null, "Seller count");
  need(!hasSales, "Sales-volume data (listing monthly sales estimate)");
  need(history.observations < 3, "Price history");
  need(p.restricted === null || !p.restrictionChecked, "Restriction/approval status for your account");
  need(p.brandGated === null, "Brand gating status");
  need(p.identityVerdict === null, "Product identity match (UPC/brand/pack count vs. listing)");
  need(p.hazmat === null, "Hazmat status");
  need(p.expiring === null, "Whether the product expires");
  need(p.amazonOnListing === null, "Whether Amazon sells on the listing");
  for (const u of main.unknown) if (!missing.some((m) => m.startsWith(u))) missing.push(`${u} (cost)`);

  // ---- Assumptions ----
  for (const line of main.lines) {
    if (line.kind === "ASSUMPTION") assumptions.push(`${line.label}: ${fmtUSD(line.value)}${line.note ? ` (${line.note})` : ""} — ${line.source}.`);
  }
  if (main.fees.referral.kind === "ESTIMATED" || main.fees.fulfillment.kind === "ESTIMATED")
    assumptions.push(`Amazon fees estimated from the reference fee table dated ${ctx.feeTable.effectiveDate}. ${ctx.feeTable.verifyNote}`);
  assumptions.push(...main.fees.notes);
  assumptions.push(`Storage assumes about ${d.expectedStorageDays} days in the warehouse at this month's rate.`);
  if (velocity.sufficient) assumptions.push(...velocity.assumptions);
  assumptions.push("The selling price is assumed to stay at the expected price; see the scenarios for other outcomes.");

  // ---- Verification checklist ----
  const verify = [
    "Confirm the current selling price and Buy Box price on the live Amazon listing.",
    "Confirm fees in Amazon's Revenue Calculator or Seller Central for this ASIN.",
    "Confirm the exact variation: size, color, pack count, and quantity match the listing.",
    "Confirm the UPC/EAN matches the ASIN.",
    ...RESTRICTION_CHECKLIST.map((c) => `Check: ${c}`),
    UNGATED_NOTICE,
    "Confirm you'll get a valid invoice or receipt that shows the product and quantity.",
  ];
  if (p.expiring) verify.push("Check the expiration dates on the actual units.");

  // ---- Attractive / could make it unprofitable ----
  const attractive: string[] = [];
  const unprofitableIf: string[] = [];
  if (unit) {
    if (unit.profit >= s.targetMinProfit) attractive.push(`Estimated profit ${fmtUSD(unit.profit)}/unit meets your ${fmtUSD(s.targetMinProfit)} target.`);
    if (unit.roiPct !== null && unit.roiPct >= s.targetRoiPct) attractive.push(`Estimated ROI ${fmtPct(unit.roiPct)} meets your ${fmtPct(s.targetRoiPct, 0)} target.`);
    if (breakEven !== null && p.salePrice) {
      const cushion = ((p.salePrice - breakEven) / p.salePrice) * 100;
      if (cushion > 0) attractive.push(`The price can fall ${fmtPct(cushion, 1)} (to ${fmtUSD(breakEven)}) before reaching break-even.`);
      unprofitableIf.push(`The selling price drops below ${fmtUSD(breakEven)} (break-even).`);
    }
  }
  if (p.sellerCount !== null && p.sellerCount <= 5 && !p.amazonOnListing) attractive.push(`Relatively few competing sellers (${p.sellerCount}).`);
  if (velocity.sufficient && velocity.monthly.low >= 5) attractive.push(`Your estimated sales are ${velocity.monthly.low.toFixed(1)}+ units/month (estimate).`);
  if (history.volatilityLevel === "LOW") attractive.push("Price history has been stable.");
  if (main.unknown.length) unprofitableIf.push(`Unknown costs (${main.unknown.join(", ")}) aren't included yet, so actual profit will be lower.`);
  unprofitableIf.push("Actual Amazon fees are higher than estimated.");
  unprofitableIf.push("More sellers join the listing or Amazon starts selling on it, pushing the price down.");
  unprofitableIf.push("Units are returned, damaged, or sell slower than expected (adding storage fees).");
  if (history.warnings.length) unprofitableIf.push(...history.warnings);

  return {
    product: p,
    generatedAt: now.toISOString(),
    liveDataNote,
    fees: main.fees,
    costLines: main.lines,
    unknownCosts: main.unknown,
    unit,
    batch,
    breakEvenPrice: breakEven,
    minProfitablePrice: minPrice,
    maxBuyCost: maxBuy,
    fulfillment: fulfillmentComparison,
    scenarios,
    sensitivity: sens,
    velocity,
    priceHistory: history,
    risks,
    overallRisk,
    confidence,
    testBuy,
    testBuyNote,
    scaling,
    filter,
    filterSubject: subject,
    dataPoints,
    assumptions,
    missing,
    verify,
    attractive,
    unprofitableIf,
  };
}

