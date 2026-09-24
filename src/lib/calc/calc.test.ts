import { describe, expect, it } from "vitest";
import { US_FEE_TABLE } from "@/data/feeTables.us";
import { allocateCapital, budgetUnits, suggestTestQuantity } from "./capital";
import { assessConfidence } from "./confidence";
import { classifySizeTier, estimateFees, fbaFulfillmentFee, referralFee } from "./fees";
import { applyFilters, type FilterSubject } from "./filters";
import { findSlowMovers, inventoryTurnover, daysOfInventory, reorderPoint, scalingPlan, sellThroughPct } from "./inventory";
import { classify, monthlyCashFlow, poTotals } from "./ledger";
import { isValidGtin, matchProducts, normalizeGtin } from "./matching";
import { analyzePriceHistory } from "./priceHistory";
import {
  batchEconomics,
  breakEvenPrice,
  maxBuyCost,
  minProfitablePrice,
  simpleModel,
  unitEconomics,
  type CostModel,
} from "./profit";
import { assessRisks, overallRiskLevel, type RiskInput } from "./risk";
import { priceScenarios, sensitivity } from "./scenarios";
import { estimateVelocity, inventoryDuration } from "./velocity";
import { sourced } from "@/lib/data/provenance";

describe("profit calculator — spec examples", () => {
  it("§3: $30 sale, $10 buy, $8 fees, $3 prep/ship → $9 profit, 69.23% ROI", () => {
    const u = unitEconomics(simpleModel({ purchasePrice: 10, amazonFees: 8, prepAndShipping: 3 }), 30);
    expect(u.profit).toBeCloseTo(9, 10);
    expect(u.upfrontCost).toBe(13);
    expect(u.roiPct!.toFixed(2)).toBe("69.23");
    expect(u.marginPct).toBeCloseTo(30, 10);
  });

  it("§38: 20 units, $12 buy, $9 fees, $3 prep → $6/unit, $120 total, $300 invested, 40% ROI", () => {
    const u = unitEconomics(simpleModel({ purchasePrice: 12, amazonFees: 9, prepAndShipping: 3 }), 30);
    expect(u.totalCost).toBe(24);
    expect(u.profit).toBe(6);
    const b = batchEconomics(u, 20);
    expect(b.totalInvestment).toBe(300);
    expect(b.totalProfit).toBe(120);
    expect(b.roiPct).toBeCloseTo(40, 10);
  });

  it("returns null ROI/margin instead of dividing by zero", () => {
    const u = unitEconomics(simpleModel({ purchasePrice: 0, amazonFees: 0, prepAndShipping: 0 }), 0);
    expect(u.roiPct).toBeNull();
    expect(u.marginPct).toBeNull();
  });
});

const tieredModel: CostModel = {
  purchasePrice: 10,
  purchaseTaxPct: 8,
  inboundShipping: 0.5,
  prep: 0.5,
  packaging: 0.1,
  otherUpfront: 0,
  fulfillment: 4.15,
  storage: 0.1,
  advertising: 0,
  closingFee: 0,
  referral: (p) => referralFee(US_FEE_TABLE.referral["Home & Kitchen"], p),
  returnsPct: 2,
};

describe("break-even, min price, max buy cost", () => {
  it("break-even price gives ~$0 profit and a cent less loses money", () => {
    const be = breakEvenPrice(tieredModel)!;
    expect(unitEconomics(tieredModel, be).profit).toBeGreaterThanOrEqual(0);
    expect(unitEconomics(tieredModel, be - 0.01).profit).toBeLessThan(0);
  });

  it("minimum profitable price meets both targets", () => {
    const p = minProfitablePrice(tieredModel, 5, 30)!;
    const u = unitEconomics(tieredModel, p);
    expect(u.profit).toBeGreaterThanOrEqual(5 - 1e-9);
    expect(u.roiPct!).toBeGreaterThanOrEqual(30 - 1e-9);
    const below = unitEconomics(tieredModel, p - 0.01);
    expect(below.profit < 5 || below.roiPct! < 30).toBe(true);
  });

  it("max buy cost is the highest purchase price that meets both targets", () => {
    const price = 34.99;
    const mb = maxBuyCost(tieredModel, price, 5, 30);
    const at = unitEconomics({ ...tieredModel, purchasePrice: mb }, price);
    expect(at.profit).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(at.roiPct!).toBeGreaterThanOrEqual(30 - 1e-6);
    const over = unitEconomics({ ...tieredModel, purchasePrice: mb + 0.02 }, price);
    expect(over.profit < 5 || over.roiPct! < 30).toBe(true);
  });

  it("max buy cost is 0 when no purchase price works", () => {
    expect(maxBuyCost(tieredModel, 5, 5, 30)).toBe(0);
  });
});

describe("fees (reference table)", () => {
  it("applies the referral minimum fee", () => {
    expect(referralFee(US_FEE_TABLE.referral["Toys & Games"], 1)).toBe(0.3);
  });
  it("whole-price tiers: beauty 8% at ≤$10, 15% above", () => {
    const r = US_FEE_TABLE.referral["Beauty, Health & Personal Care"];
    expect(referralFee(r, 10)).toBeCloseTo(0.8);
    expect(referralFee(r, 20)).toBeCloseTo(3);
  });
  it("marginal tiers: electronics accessories 15% of first $100, 8% above", () => {
    expect(referralFee(US_FEE_TABLE.referral["Electronics Accessories"], 150)).toBeCloseTo(15 + 4);
  });
  it("classifies size tiers and uses dimensional weight for large standard", () => {
    const small = classifySizeTier(US_FEE_TABLE, { lengthIn: 8, widthIn: 5, heightIn: 0.5 }, 0.3);
    expect(small.tier).toBe("small_standard");
    const large = classifySizeTier(US_FEE_TABLE, { lengthIn: 12, widthIn: 10, heightIn: 6 }, 1);
    expect(large.tier).toBe("large_standard");
    expect(large.shippingWeightLb).toBeCloseTo(720 / 139);
    const bulky = classifySizeTier(US_FEE_TABLE, { lengthIn: 30, widthIn: 20, heightIn: 10 }, 15);
    expect(bulky.tier).toBe("large_bulky");
  });
  it("FBA fee: large standard 3–20 lb adds per 4 oz above 3 lb, and price bands adjust", () => {
    const size = { tier: "large_standard" as const, unitWeightLb: 4, dimensionalWeightLb: 1, shippingWeightLb: 4 };
    expect(fbaFulfillmentFee(US_FEE_TABLE, size, 25)).toBeCloseTo(6.92 + 4 * 0.08);
    expect(fbaFulfillmentFee(US_FEE_TABLE, size, 8)).toBeCloseTo(6.92 + 4 * 0.08 - 0.77);
  });
  it("marks fees UNKNOWN when dimensions are missing and prefers user overrides", () => {
    const e = estimateFees(US_FEE_TABLE, {
      category: "Toys & Games",
      price: 20,
      fulfillment: "FBA",
      dims: null,
      unitWeightLb: null,
      expectedStorageDays: 30,
      month: 3,
    });
    expect(e.fulfillment.kind).toBe("UNKNOWN");
    expect(e.referral.kind).toBe("ESTIMATED");
    const o = estimateFees(US_FEE_TABLE, {
      category: "Toys & Games",
      price: 20,
      fulfillment: "FBA",
      dims: null,
      unitWeightLb: null,
      expectedStorageDays: 30,
      month: 3,
      fulfillmentOverride: sourced(5.5, "USER_PROVIDED"),
    });
    expect(o.fulfillment.value).toBe(5.5);
    expect(o.fulfillment.kind).toBe("USER_PROVIDED");
  });
  it("falls back to 'Everything Else' for unknown categories and says so", () => {
    const e = estimateFees(US_FEE_TABLE, {
      category: "Mystery",
      price: 20,
      fulfillment: "FBM",
      dims: null,
      unitWeightLb: null,
      expectedStorageDays: 0,
      month: 1,
      fbmShippingCost: 5,
    });
    expect(e.referral.value).toBe(3);
    expect(e.notes[0]).toMatch(/Everything Else/);
    expect(e.fulfillment.value).toBe(5);
  });
});

describe("sales velocity", () => {
  it("§15: 100/month listing at a 5% share → 5 units/month", () => {
    const v = estimateVelocity({ listingMonthlySales: { low: 100, high: 100 }, sellerCount: 10, shareAssumptionPct: 5 });
    expect(v.sufficient).toBe(true);
    if (v.sufficient) expect(v.monthly.low).toBeCloseTo(5);
  });
  it("§56: 30 units at 2/day lasts 15 days", () => {
    expect(inventoryDuration(30, 2)).toBe(15);
  });
  it("says so when data is insufficient, rather than inventing sales", () => {
    const v = estimateVelocity({ listingMonthlySales: null, sellerCount: 3 });
    expect(v.sufficient).toBe(false);
    if (!v.sufficient) expect(v.message).toMatch(/Insufficient data/);
  });
  it("default share is an even split, labeled as an assumption", () => {
    const v = estimateVelocity({ listingMonthlySales: { low: 50, high: 100 }, sellerCount: 4, quantity: 10 });
    if (!v.sufficient) throw new Error("expected sufficient");
    expect(v.sharePct).toBeCloseTo(20);
    expect(v.shareIsDefault).toBe(true);
    expect(v.daily.low).toBeCloseTo(10 / 30);
    expect(v.inventoryDurationDays!.low).toBeCloseTo(15);
    expect(v.inventoryDurationDays!.high).toBeCloseTo(30);
  });
});

describe("price history", () => {
  const asOf = new Date("2026-09-24T00:00:00Z");
  const day = (n: number) => new Date(asOf.getTime() - n * 86_400_000).toISOString();
  it("§57: warns when current price is well above the 90-day average", () => {
    const a = analyzePriceHistory(
      [
        { at: day(80), price: 27 },
        { at: day(60), price: 28 },
        { at: day(40), price: 27.5 },
        { at: day(20), price: 28 },
        { at: day(0), price: 34.99 },
      ],
      asOf,
    );
    expect(a.current).toBe(34.99);
    expect(a.lowest).toBe(27);
    expect(a.highest).toBe(34.99);
    expect(a.warnings.join(" ")).toMatch(/substantially above/);
  });
  it("flags seller-count growth", () => {
    const a = analyzePriceHistory(
      [
        { at: day(30), price: 20, sellerCount: 3 },
        { at: day(15), price: 20, sellerCount: 5 },
        { at: day(1), price: 19, sellerCount: 9 },
      ],
      asOf,
    );
    expect(a.sellerCountChange).toEqual({ from: 3, to: 9 });
    expect(a.warnings.join(" ")).toMatch(/price compression/);
  });
});

describe("inventory math", () => {
  it("§18: reorder point 3 × 10 + 10 = 40", () => {
    expect(reorderPoint(3, 10, 10)).toBe(40);
  });
  it("turnover, days of inventory, sell-through", () => {
    expect(inventoryTurnover(1200, 400)).toBe(3);
    expect(daysOfInventory(1200, 400, 90)).toBe(30);
    expect(sellThroughPct(15, 20)).toBe(75);
    expect(inventoryTurnover(100, 0)).toBeNull();
  });
  it("scaling plan respects the capital cap", () => {
    const p = scalingPlan({ avgDailySales: 3, leadTimeDays: 10, safetyDays: 5, reviewPeriodDays: 30, unitCost: 10, capitalAvailable: 1000, maxCapitalPct: 20 });
    expect(p.reorderPoint).toBe(45);
    expect(p.initialOrder).toBe(20);
    expect(p.limitedByCapital).toBe(true);
  });
  it("finds slow movers", () => {
    const now = new Date("2026-09-24T00:00:00Z");
    const s = findSlowMovers(
      [
        { id: 1, name: "A", remaining: 5, unitCost: 10, lastSaleAt: "2026-06-01", receivedAt: "2026-05-01" },
        { id: 2, name: "B", remaining: 5, unitCost: 10, lastSaleAt: "2026-09-20", receivedAt: "2026-05-01" },
        { id: 3, name: "C", remaining: 0, unitCost: 10, lastSaleAt: null, receivedAt: "2026-01-01" },
      ],
      60,
      now,
    );
    expect(s.map((x) => x.name)).toEqual(["A"]);
  });
});

describe("cash flow and POs", () => {
  it("§11: $1,000 start − $500 − $100 − $50 + $900 = $1,250", () => {
    const [m] = monthlyCashFlow(
      [
        { date: "2026-09-01", type: "inventory_purchase", amount: 500 },
        { date: "2026-09-02", type: "inbound_shipping", amount: 100 },
        { date: "2026-09-03", type: "software", amount: 50 },
        { date: "2026-09-15", type: "amazon_payout", amount: 900 },
      ],
      1000,
    );
    expect(m.endingCash).toBe(1250);
    expect(m.netCashFlow).toBe(250);
  });
  it("classifies COGS vs operating expenses", () => {
    expect(classify("inventory_purchase")).toBe("cogs");
    expect(classify("software")).toBe("operating");
    expect(classify("capital_contribution")).toBe("equity");
    expect(classify("amazon_payout")).toBe("inflow");
  });
  it("PO totals spread shipping by value", () => {
    const po = poTotals(
      [
        { product: "A", quantity: 10, unitCost: 10, expectedSalePrice: 30, expectedFeesPerUnit: 9 },
        { product: "B", quantity: 10, unitCost: 30, expectedSalePrice: 60, expectedFeesPerUnit: 15 },
      ],
      40,
      0,
    );
    expect(po.subtotal).toBe(400);
    expect(po.totalCost).toBe(440);
    expect(po.lines[0].landedUnitCost).toBeCloseTo(11);
    expect(po.lines[1].landedUnitCost).toBeCloseTo(33);
    expect(po.expectedRevenue).toBe(900);
    expect(po.estimatedProfit).toBeCloseTo(900 - 240 - 440);
  });
});

describe("product matching", () => {
  it("validates GTIN check digits", () => {
    expect(isValidGtin("036000291452")).toBe(true);
    expect(isValidGtin("036000291453")).toBe(false);
    expect(normalizeGtin("0 36000 29145 2")).toBe("00036000291452");
  });
  it("MATCH needs GTIN + brand + pack count with no conflicts", () => {
    const r = matchProducts(
      { gtin: "036000291452", brand: "Acme", packCount: 2, title: "Acme Widget 2pk" },
      { gtin: "036000291452", brand: "ACME", packCount: 2, title: "Widget by Acme, Pack of 2" },
    );
    expect(r.verdict).toBe("MATCH");
  });
  it("similar titles alone never match", () => {
    const r = matchProducts({ title: "Acme Super Widget Blue 16oz" }, { title: "Acme Super Widget Blue 16oz" });
    expect(r.verdict).toBe("DO NOT MATCH");
  });
  it("pack-count conflict → DO NOT MATCH even with the same UPC", () => {
    const r = matchProducts(
      { gtin: "036000291452", brand: "Acme", packCount: 1 },
      { gtin: "036000291452", brand: "Acme", packCount: 3 },
    );
    expect(r.verdict).toBe("DO NOT MATCH");
  });
  it("brand + model without a UPC → POSSIBLE MATCH", () => {
    const r = matchProducts({ brand: "Acme", model: "W-100" }, { brand: "acme", model: "w 100" });
    expect(r.verdict).toBe("POSSIBLE MATCH");
  });
});

describe("filters", () => {
  const subject: FilterSubject = {
    purchasePrice: 15,
    profit: 9,
    roiPct: 40,
    marginPct: 25,
    sellerCount: 4,
    salesRank: 20000,
    ownMonthlySalesLow: 5,
    inventoryDaysHigh: 30,
    category: "Home & Kitchen",
    riskLevel: "MEDIUM",
    capitalRequired: 150,
    fragile: false,
    expiring: null,
    restricted: false,
    hazmat: false,
  };
  it("explains each criterion", () => {
    const o = applyFilters(subject, { maxPurchasePrice: 20, minProfit: 7, minRoiPct: 35, minMarginPct: 20, maxInventoryDays: 45, excludeRestricted: true });
    expect(o.status).toBe("PASS");
    expect(o.results).toHaveLength(6);
  });
  it("fails with a reason", () => {
    const o = applyFilters(subject, { minProfit: 10 });
    expect(o.status).toBe("FAIL");
    expect(o.results[0].reason).toBe("$9.00 < $10.00");
  });
  it("unknown data → NEEDS DATA, not PASS", () => {
    const o = applyFilters(subject, { excludeExpiring: true });
    expect(o.status).toBe("NEEDS DATA");
  });
});

describe("capital and test buys", () => {
  it("§63: $500 budget, $10 cost → 50 theoretical units but keeps a reserve", () => {
    const b = budgetUnits(500, 10, 60);
    expect(b.maxTheoreticalUnits).toBe(50);
    expect(b.suggestedUnits).toBe(30);
    expect(b.cashRemaining).toBe(200);
  });
  it("allocation scenarios each add up to 100% of the budget", () => {
    for (const s of allocateCapital(1000)) {
      const a = s.amounts;
      expect(a.inventory + a.shippingAndPrep + a.operating + a.reserve).toBeCloseTo(1000);
    }
  });
  it("test quantity is capped by capital, demand, and risk", () => {
    const t = suggestTestQuantity({
      capitalAvailable: 1000,
      unitInvestment: 15,
      risk: "MEDIUM",
      ownMonthlySalesLow: 8,
      priceVolatility: "LOW",
      monthsToExpiration: null,
      maxCapitalPctPerProduct: 10,
    });
    expect(t.quantity).toBe(6);
    const unknownDemand = suggestTestQuantity({
      capitalAvailable: 1000,
      unitInvestment: 15,
      risk: "HIGH",
      ownMonthlySalesLow: null,
      priceVolatility: "HIGH",
      monthsToExpiration: null,
      maxCapitalPctPerProduct: 10,
    });
    expect(unknownDemand.quantity).toBe(1);
  });
});

describe("scenarios and sensitivity", () => {
  it("omits the high-price scenario unless it's supported by data", () => {
    const s = priceScenarios(tieredModel, 30);
    expect(s.map((x) => x.name)).toEqual(["Low price", "Expected"]);
    expect(priceScenarios(tieredModel, 30, { high: 34 })).toHaveLength(3);
  });
  it("sensitivity rows move profit in the expected direction", () => {
    const rows = sensitivity(tieredModel, 30, 10);
    const by = Object.fromEntries(rows.map((r) => [r.change, r]));
    expect(by["Selling price −10%"].profitDelta).toBeLessThan(0);
    expect(by["Selling price +10%"].profitDelta).toBeGreaterThan(0);
    expect(by["Amazon fees +10%"].profitDelta).toBeLessThan(0);
    expect(by["Sales volume −25%"].monthlyProfit!).toBeCloseTo(by["Base case"].monthlyProfit! * 0.75);
  });
});

describe("confidence and risk", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const fresh = { checkedAt: "2026-09-24T10:00:00Z" };
  it("INSUFFICIENT DATA without a selling price", () => {
    const c = assessConfidence(
      {
        purchasePrice: sourced(10, "USER_PROVIDED", fresh),
        salePrice: sourced<number>(null, "UNKNOWN"),
        referralFee: sourced(3, "ESTIMATED"),
        fulfillmentFee: sourced(4, "ESTIMATED"),
        salesData: sourced(null, "UNKNOWN"),
        sellerCount: sourced<number>(null, "UNKNOWN"),
        priceHistoryPoints: 0,
        identityVerdict: null,
        restrictionChecked: false,
      },
      now,
    );
    expect(c.level).toBe("INSUFFICIENT DATA");
  });
  it("MODERATE when prices are observed but sales data is missing", () => {
    const c = assessConfidence(
      {
        purchasePrice: sourced(10, "USER_PROVIDED", fresh),
        salePrice: sourced(30, "USER_PROVIDED", fresh),
        referralFee: sourced(4.5, "ESTIMATED"),
        fulfillmentFee: sourced(4, "ESTIMATED"),
        salesData: sourced(null, "UNKNOWN"),
        sellerCount: sourced(5, "USER_PROVIDED", fresh),
        priceHistoryPoints: 0,
        identityVerdict: "MATCH",
        restrictionChecked: false,
      },
      now,
    );
    expect(c.level).toBe("MODERATE CONFIDENCE");
    expect(c.reason).toMatch(/no reliable sales-volume data/);
  });
  it("overall risk is the highest known level", () => {
    const base: RiskInput = {
      restricted: false,
      brandGated: false,
      counterfeitProne: false,
      expiring: false,
      monthsToExpiration: null,
      fragile: false,
      hazmat: false,
      meltable: false,
      sizeTier: "large_standard",
      priceVolatility: "LOW",
      priceAboveAverage: false,
      sellerCount: 3,
      amazonOnListing: false,
      returnRatePct: 2,
      seasonal: false,
      inventoryDaysHigh: 20,
      capitalShareOfBudgetPct: 5,
      sourceAuthorized: true,
    };
    expect(overallRiskLevel(assessRisks(base))).toBe("LOW");
    expect(overallRiskLevel(assessRisks({ ...base, fragile: true }))).toBe("MEDIUM");
    expect(overallRiskLevel(assessRisks({ ...base, amazonOnListing: true }))).toBe("HIGH");
  });
});
