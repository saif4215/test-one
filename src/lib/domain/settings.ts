import { z } from "zod";

const nullableNum = z.number().finite().nullable();

export const dealFiltersSchema = z.object({
  minProfit: nullableNum.default(null),
  minRoiPct: nullableNum.default(null),
  minMarginPct: nullableNum.default(null),
  maxPurchasePrice: nullableNum.default(null),
  maxSellerCount: nullableNum.default(null),
  maxSalesRank: nullableNum.default(null),
  minMonthlySalesLow: nullableNum.default(null),
  maxInventoryDays: nullableNum.default(null),
  allowedCategories: z.array(z.string()).default([]),
  excludedCategories: z.array(z.string()).default([]),
  maxRiskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
  maxCapitalPerProduct: nullableNum.default(null),
  excludeFragile: z.boolean().default(false),
  excludeExpiring: z.boolean().default(false),
  excludeRestricted: z.boolean().default(true),
  excludeHazmat: z.boolean().default(false),
});

export const costDefaultsSchema = z.object({
  /** Per-unit prep cost used when a product has none entered (ASSUMPTION). */
  prepPerUnit: z.number().min(0).default(0.5),
  packagingPerUnit: z.number().min(0).default(0.1),
  /** Inbound shipping to Amazon per pound (ASSUMPTION). */
  inboundPerLb: z.number().min(0).default(0.4),
  purchaseTaxPct: z.number().min(0).default(0),
  returnsPct: z.number().min(0).default(2),
  advertisingPerUnit: z.number().min(0).default(0),
  expectedStorageDays: z.number().min(0).default(60),
  maxCapitalPctPerProduct: z.number().min(0).max(100).default(10),
  staleAfterDays: z.number().min(1).default(7),
  slowMoverDays: z.number().min(1).default(60),
  safetyDays: z.number().min(0).default(7),
  aboveAverageWarnPct: z.number().min(0).default(15),
});

export const settingsSchema = z.object({
  onboarded: z.boolean().default(false),
  businessName: z.string().default(""),
  // §48 onboarding answers
  startingBudget: nullableNum.default(null),
  marketplace: z.literal("US").default("US"),
  fulfillment: z.enum(["FBA", "FBM", "BOTH"]).default("BOTH"),
  sourcing: z.array(z.enum(["retail", "online", "wholesale"])).default([]),
  targetMinProfit: z.number().min(0).default(5),
  targetRoiPct: z.number().min(0).default(30),
  targetMarginPct: z.number().min(0).default(15),
  preferredCategories: z.array(z.string()).default([]),
  avoidCategories: z.array(z.string()).default([]),
  hasSellerAccount: z.enum(["yes", "no", "not_sure"]).default("not_sure"),
  sellerPlan: z.enum(["professional", "individual", "unknown"]).default("unknown"),
  hasSuppliers: z.boolean().default(false),
  wantsProductHelp: z.boolean().default(true),
  wantsSpreadsheets: z.boolean().default(true),
  mode: z.enum(["beginner", "advanced"]).default("beginner"),
  costDefaults: costDefaultsSchema.default(costDefaultsSchema.parse({})),
  filters: dealFiltersSchema.default(dealFiltersSchema.parse({})),
  /** Per-category referral % overrides, e.g. { "Toys & Games": 15 }. */
  referralPctOverrides: z.record(z.string(), z.number().min(0).max(100)).default({}),
  storageRateOverrides: z
    .object({ standardJanSep: nullableNum, standardOctDec: nullableNum, oversizeJanSep: nullableNum, oversizeOctDec: nullableNum })
    .partial()
    .default({}),
  feeTableVerifiedAt: z.string().nullable().default(null),
});

export type Settings = z.infer<typeof settingsSchema>;
export type DealFiltersSettings = z.infer<typeof dealFiltersSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});
