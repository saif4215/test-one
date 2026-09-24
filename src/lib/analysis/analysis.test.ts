import { describe, expect, it } from "vitest";
import { productInputSchema } from "@/lib/domain/product";
import { DEFAULT_SETTINGS, settingsSchema } from "@/lib/domain/settings";
import { analyzeProduct, summarize } from "./analyzeProduct";
import { effectiveFeeTable } from "./feeTable";

const now = new Date("2026-09-24T15:00:00Z");
const settings = settingsSchema.parse({ ...DEFAULT_SETTINGS, startingBudget: 1000, targetMinProfit: 5, targetRoiPct: 30 });
const ctx = { settings, feeTable: effectiveFeeTable(settings), now, checkedAt: "2026-09-24T14:00:00Z" };

const complete = productInputSchema.parse({
  name: "Acme Silicone Spatula Set",
  brand: "Acme",
  asin: "B0TEST1234",
  upc: "036000291452",
  category: "Home & Kitchen",
  purchasePrice: 8,
  salePrice: 24.99,
  quantity: 10,
  weightLb: 0.6,
  lengthIn: 12,
  widthIn: 4,
  heightIn: 2,
  sellerCount: 4,
  listingMonthlySalesLow: 60,
  listingMonthlySalesHigh: 120,
  restricted: false,
  restrictionChecked: true,
  brandGated: false,
  hazmat: false,
  expiring: false,
  fragile: false,
  amazonOnListing: false,
  identityVerdict: "MATCH",
  prov: { listingMonthlySalesLow: { kind: "THIRD_PARTY", source: "Seller tool estimate", checkedAt: "2026-09-24T14:00:00Z" } },
});

describe("analyzeProduct", () => {
  it("computes a complete deal with labeled estimates", () => {
    const a = analyzeProduct(complete, ctx);
    expect(a.unit).not.toBeNull();
    // Referral 15% of 24.99, large standard 0.5–0.75 lb bracket
    expect(a.unit!.referralFee).toBeCloseTo(3.75, 2);
    expect(a.fees.sizeTier?.tier).toBe("large_standard");
    expect(a.fees.fulfillment.kind).toBe("ESTIMATED");
    expect(a.unit!.profit).toBeGreaterThan(0);
    expect(a.breakEvenPrice).toBeLessThan(24.99);
    expect(a.maxBuyCost).toBeGreaterThan(0);
    expect(a.velocity.sufficient).toBe(true);
    expect(a.liveDataNote).toMatch(/Live data unavailable/);
    expect(a.confidence.level).not.toBe("INSUFFICIENT DATA");
    expect(a.assumptions.some((x) => x.includes("reference fee table"))).toBe(true);
    expect(a.testBuy?.quantity).toBeGreaterThan(0);
    const s = summarize(a);
    expect(s.profit).toBeCloseTo(a.unit!.profit);
  });

  it("reports missing data instead of inventing it", () => {
    const a = analyzeProduct(productInputSchema.parse({ name: "Mystery item", purchasePrice: 5 }), ctx);
    expect(a.unit).toBeNull();
    expect(a.confidence.level).toBe("INSUFFICIENT DATA");
    expect(a.missing).toContain("Expected selling price");
    expect(a.missing).toContain("Sales-volume data (listing monthly sales estimate)");
    expect(a.velocity.sufficient).toBe(false);
    expect(a.dataPoints.find((d) => d.label === "Selling price")!.note).toMatch(/Data unavailable/);
  });

  it("flags unknown costs that aren't in the profit figure", () => {
    const a = analyzeProduct(productInputSchema.parse({ name: "No dims", purchasePrice: 5, salePrice: 20, category: "Toys & Games" }), ctx);
    expect(a.unknownCosts).toContain("FBA fulfillment fee");
    expect(a.unprofitableIf.join(" ")).toMatch(/Unknown costs/);
  });

  it("uses verified SP-API fees when they're present", () => {
    const p = productInputSchema.parse({
      ...complete,
      referralFeeOverride: 3.75,
      fulfillmentFeeOverride: 4.1,
      prov: {
        referralFeeOverride: { kind: "VERIFIED", source: "Amazon SP-API fee estimate at $24.99", checkedAt: "2026-09-24T14:00:00Z" },
        fulfillmentFeeOverride: { kind: "VERIFIED", source: "Amazon SP-API fee estimate at $24.99", checkedAt: "2026-09-24T14:00:00Z" },
      },
    });
    const a = analyzeProduct(p, ctx);
    expect(a.fees.fulfillment.value).toBe(4.1);
    expect(a.fees.fulfillment.kind).toBe("VERIFIED");
    expect(a.liveDataNote).toMatch(/Live data used from/);
  });

  it("filters on the settings targets", () => {
    const strict = settingsSchema.parse({ ...settings, targetMinProfit: 50 });
    const a = analyzeProduct(complete, { ...ctx, settings: strict });
    expect(a.filter.status).toBe("FAIL");
    expect(a.filter.results.find((r) => r.criterion === "Profit per unit")!.status).toBe("FAIL");
  });

  it("compares FBA and FBM", () => {
    const a = analyzeProduct(productInputSchema.parse({ ...complete, fbmShippingCost: 5.5 }), ctx);
    expect(a.fulfillment.fba).not.toBeNull();
    expect(a.fulfillment.fbm).not.toBeNull();
    expect(a.fulfillment.fbm!.fulfillmentFee).toBe(5.5);
    expect(a.fulfillment.fbm!.storage).toBe(0);
  });

  it("applies referral % overrides from settings", () => {
    const s = settingsSchema.parse({ ...settings, referralPctOverrides: { "Home & Kitchen": 10 } });
    const a = analyzeProduct(complete, { ...ctx, settings: s, feeTable: effectiveFeeTable(s) });
    expect(a.unit!.referralFee).toBeCloseTo(2.5, 2);
  });
});
