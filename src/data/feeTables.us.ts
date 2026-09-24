/**
 * Amazon US fee REFERENCE tables.
 *
 * IMPORTANT: Amazon changes its fees regularly. These values are reference
 * estimates only, and every analysis labels them "Estimate". Before buying,
 * check them against Amazon's current fee schedule in Seller Central or the
 * Revenue Calculator. Fees you enter yourself, or fees from the SP-API
 * adapter, always take priority over this table.
 */

export interface ReferralTier {
  /** Upper price bound for this tier (inclusive); null = no upper bound. */
  upTo: number | null;
  pct: number;
}

export interface ReferralRule {
  /**
   * "whole": the tier that matches the total sales price applies to the whole price.
   * "marginal": each tier's % applies only to the part of the price inside that tier.
   */
  mode: "whole" | "marginal";
  tiers: ReferralTier[];
  minFee: number;
  /** Per-item closing fee (e.g. media categories). */
  closingFee?: number;
}

export type SizeTier = "small_standard" | "large_standard" | "large_bulky" | "extra_large";

export interface WeightBracket {
  /** Upper bound of shipping weight in pounds (inclusive). */
  maxLb: number;
  fee: number;
}

export interface OverflowRule {
  /** Weight (lb) above which the per-increment charge applies. */
  aboveLb: number;
  base: number;
  perIncrement: number;
  /** Increment size in pounds (e.g. 0.25 = per 4 oz). */
  incrementLb: number;
  maxLb: number;
}

export interface FeeTable {
  marketplace: "US";
  currency: "USD";
  /** Date the reference values were taken from; check whether Amazon has changed them since. */
  effectiveDate: string;
  verifyNote: string;
  referral: Record<string, ReferralRule>;
  sizeTiers: Record<
    SizeTier,
    { maxLongestIn: number; maxMedianIn: number; maxShortestIn: number; maxLengthGirthIn?: number; maxWeightLb: number }
  >;
  dimensionalDivisor: number;
  fba: {
    small_standard: WeightBracket[];
    large_standard: { brackets: WeightBracket[]; overflow: OverflowRule };
    large_bulky: OverflowRule;
    extra_large: OverflowRule;
    /** Flat adjustment added to standard-size fees for certain price bands. */
    priceBandAdjustments: { minPrice: number; maxPrice: number | null; adjust: number; note: string }[];
  };
  storage: {
    /** $ per cubic foot per month. */
    standard: { janSep: number; octDec: number };
    oversize: { janSep: number; octDec: number };
  };
}

const flat = (pct: number, minFee = 0.3): ReferralRule => ({
  mode: "whole",
  tiers: [{ upTo: null, pct }],
  minFee,
});

export const US_FEE_TABLE: FeeTable = {
  marketplace: "US",
  currency: "USD",
  effectiveDate: "2025-01-15",
  verifyNote:
    "Reference values only — verify against Amazon's current fee schedule in Seller Central before purchasing.",
  referral: {
    "Amazon Device Accessories": flat(45),
    "Baby Products": { mode: "whole", tiers: [{ upTo: 10, pct: 8 }, { upTo: null, pct: 15 }], minFee: 0.3 },
    "Beauty, Health & Personal Care": {
      mode: "whole",
      tiers: [{ upTo: 10, pct: 8 }, { upTo: null, pct: 15 }],
      minFee: 0.3,
    },
    Books: { ...flat(15, 0), closingFee: 1.8 },
    "Clothing & Accessories": {
      mode: "whole",
      tiers: [{ upTo: 15, pct: 5 }, { upTo: 20, pct: 10 }, { upTo: null, pct: 17 }],
      minFee: 0.3,
    },
    "Consumer Electronics": flat(8),
    "Electronics Accessories": { mode: "marginal", tiers: [{ upTo: 100, pct: 15 }, { upTo: null, pct: 8 }], minFee: 0.3 },
    Furniture: { mode: "marginal", tiers: [{ upTo: 200, pct: 15 }, { upTo: null, pct: 10 }], minFee: 0.3 },
    "Grocery & Gourmet": { mode: "whole", tiers: [{ upTo: 15, pct: 8 }, { upTo: null, pct: 15 }], minFee: 0 },
    "Home & Kitchen": flat(15),
    Jewelry: { mode: "marginal", tiers: [{ upTo: 250, pct: 20 }, { upTo: null, pct: 5 }], minFee: 0.3 },
    "Musical Instruments": flat(15),
    "Office Products": flat(15),
    "Personal Computers": flat(8),
    "Pet Supplies": flat(15),
    "Shoes, Handbags & Sunglasses": flat(15),
    "Sports & Outdoors": flat(15),
    "Tools & Home Improvement": flat(15),
    "Toys & Games": flat(15),
    "Video Games & Consoles": { ...flat(15, 0), closingFee: 1.8 },
    Watches: { mode: "marginal", tiers: [{ upTo: 1500, pct: 16 }, { upTo: null, pct: 3 }], minFee: 0.3 },
    "Everything Else": flat(15),
  },
  sizeTiers: {
    small_standard: { maxLongestIn: 15, maxMedianIn: 12, maxShortestIn: 0.75, maxWeightLb: 1 },
    large_standard: { maxLongestIn: 18, maxMedianIn: 14, maxShortestIn: 8, maxWeightLb: 20 },
    large_bulky: { maxLongestIn: 59, maxMedianIn: 33, maxShortestIn: 33, maxLengthGirthIn: 130, maxWeightLb: 50 },
    extra_large: { maxLongestIn: Infinity, maxMedianIn: Infinity, maxShortestIn: Infinity, maxWeightLb: Infinity },
  },
  dimensionalDivisor: 139,
  fba: {
    small_standard: [
      { maxLb: 2 / 16, fee: 3.06 },
      { maxLb: 4 / 16, fee: 3.15 },
      { maxLb: 6 / 16, fee: 3.24 },
      { maxLb: 8 / 16, fee: 3.33 },
      { maxLb: 10 / 16, fee: 3.43 },
      { maxLb: 12 / 16, fee: 3.53 },
      { maxLb: 14 / 16, fee: 3.6 },
      { maxLb: 1, fee: 3.65 },
    ],
    large_standard: {
      brackets: [
        { maxLb: 0.25, fee: 3.68 },
        { maxLb: 0.5, fee: 3.9 },
        { maxLb: 0.75, fee: 4.15 },
        { maxLb: 1, fee: 4.55 },
        { maxLb: 1.25, fee: 4.99 },
        { maxLb: 1.5, fee: 5.37 },
        { maxLb: 1.75, fee: 5.52 },
        { maxLb: 2, fee: 5.77 },
        { maxLb: 2.25, fee: 5.87 },
        { maxLb: 2.5, fee: 6.05 },
        { maxLb: 2.75, fee: 6.21 },
        { maxLb: 3, fee: 6.62 },
      ],
      overflow: { aboveLb: 3, base: 6.92, perIncrement: 0.08, incrementLb: 0.25, maxLb: 20 },
    },
    large_bulky: { aboveLb: 1, base: 9.61, perIncrement: 0.38, incrementLb: 1, maxLb: 50 },
    extra_large: { aboveLb: 1, base: 26.33, perIncrement: 0.38, incrementLb: 1, maxLb: 50 },
    priceBandAdjustments: [
      { minPrice: 0, maxPrice: 10, adjust: -0.77, note: "Lower fee band for items priced under $10" },
      { minPrice: 50, maxPrice: null, adjust: 0.26, note: "Higher fee band for items priced over $50" },
    ],
  },
  storage: {
    standard: { janSep: 0.78, octDec: 2.4 },
    oversize: { janSep: 0.56, octDec: 1.4 },
  },
};

export const FEE_CATEGORIES = Object.keys(US_FEE_TABLE.referral);
