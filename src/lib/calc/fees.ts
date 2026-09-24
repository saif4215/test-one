import type { FeeTable, OverflowRule, ReferralRule, SizeTier } from "@/data/feeTables.us";
import { sourced, type Sourced } from "@/lib/data/provenance";
import { round2 } from "@/lib/format";

export interface Dimensions {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

/** Referral fee for one sale at `price`, including the per-item minimum. Closing fees are not included. */
export function referralFee(rule: ReferralRule, price: number): number {
  if (!(price > 0)) return 0;
  let fee = 0;
  if (rule.mode === "whole") {
    const tier = rule.tiers.find((t) => t.upTo === null || price <= t.upTo) ?? rule.tiers[rule.tiers.length - 1];
    fee = (price * tier.pct) / 100;
  } else {
    let lower = 0;
    for (const t of rule.tiers) {
      const upper = t.upTo ?? Infinity;
      if (price > lower) fee += ((Math.min(price, upper) - lower) * t.pct) / 100;
      lower = upper;
    }
  }
  return Math.max(fee, rule.minFee);
}

export function sortedDims(d: Dimensions): [number, number, number] {
  const s = [d.lengthIn, d.widthIn, d.heightIn].sort((a, b) => b - a);
  return [s[0], s[1], s[2]];
}

export function dimensionalWeightLb(table: FeeTable, d: Dimensions): number {
  return (d.lengthIn * d.widthIn * d.heightIn) / table.dimensionalDivisor;
}

export function cubicFeet(d: Dimensions): number {
  return (d.lengthIn * d.widthIn * d.heightIn) / 1728;
}

export interface SizeTierResult {
  tier: SizeTier;
  unitWeightLb: number;
  dimensionalWeightLb: number;
  /** Weight Amazon bills on: unit weight for small standard, otherwise the greater of unit and dimensional weight. */
  shippingWeightLb: number;
}

export function classifySizeTier(table: FeeTable, d: Dimensions, unitWeightLb: number): SizeTierResult {
  const [longest, median, shortest] = sortedDims(d);
  const girth = 2 * (median + shortest);
  const dimWt = dimensionalWeightLb(table, d);
  const fits = (tier: SizeTier, weightLb: number) => {
    const t = table.sizeTiers[tier];
    return (
      longest <= t.maxLongestIn &&
      median <= t.maxMedianIn &&
      shortest <= t.maxShortestIn &&
      (t.maxLengthGirthIn === undefined || longest + girth <= t.maxLengthGirthIn) &&
      weightLb <= t.maxWeightLb
    );
  };
  const billable = Math.max(unitWeightLb, dimWt);
  let tier: SizeTier;
  if (fits("small_standard", unitWeightLb)) tier = "small_standard";
  else if (fits("large_standard", billable)) tier = "large_standard";
  else if (fits("large_bulky", billable)) tier = "large_bulky";
  else tier = "extra_large";
  return {
    tier,
    unitWeightLb,
    dimensionalWeightLb: dimWt,
    shippingWeightLb: tier === "small_standard" ? unitWeightLb : billable,
  };
}

function overflowFee(rule: OverflowRule, weightLb: number): number {
  const extra = Math.max(0, weightLb - rule.aboveLb);
  return rule.base + Math.ceil(extra / rule.incrementLb - 1e-9) * rule.perIncrement;
}

/** FBA fulfillment fee per unit for a size tier, shipping weight, and sale price. */
export function fbaFulfillmentFee(table: FeeTable, size: SizeTierResult, price: number): number {
  const w = size.shippingWeightLb;
  let fee: number;
  switch (size.tier) {
    case "small_standard": {
      const b = table.fba.small_standard.find((x) => w <= x.maxLb + 1e-9);
      fee = b ? b.fee : table.fba.small_standard[table.fba.small_standard.length - 1].fee;
      break;
    }
    case "large_standard": {
      const b = table.fba.large_standard.brackets.find((x) => w <= x.maxLb + 1e-9);
      fee = b ? b.fee : overflowFee(table.fba.large_standard.overflow, w);
      break;
    }
    case "large_bulky":
      fee = overflowFee(table.fba.large_bulky, w);
      break;
    case "extra_large":
      fee = overflowFee(table.fba.extra_large, w);
      break;
  }
  if (size.tier === "small_standard" || size.tier === "large_standard") {
    const band = table.fba.priceBandAdjustments.find(
      (b) => price >= b.minPrice && (b.maxPrice === null || price < b.maxPrice),
    );
    if (band) fee += band.adjust;
  }
  return round2(fee);
}

/** Monthly storage fee per unit. `month` is 1–12. */
export function monthlyStorageFeePerUnit(table: FeeTable, d: Dimensions, tier: SizeTier, month: number): number {
  const rates = tier === "small_standard" || tier === "large_standard" ? table.storage.standard : table.storage.oversize;
  const rate = month >= 10 ? rates.octDec : rates.janSep;
  return cubicFeet(d) * rate;
}

export interface FeeEstimateInput {
  category: string | null;
  price: number;
  fulfillment: "FBA" | "FBM";
  dims: Dimensions | null;
  unitWeightLb: number | null;
  /** Expected days the unit sits in an FBA warehouse before selling. */
  expectedStorageDays: number;
  /** Month the unit is expected to be stored (1–12), which sets the storage rate. */
  month: number;
  /** FBM only: your shipping label cost per order. */
  fbmShippingCost?: number | null;
  /** Fees the user supplied (e.g. from Amazon's Revenue Calculator). These override the table. */
  referralOverride?: Sourced<number>;
  fulfillmentOverride?: Sourced<number>;
}

export interface FeeEstimate {
  referral: Sourced<number>;
  closing: Sourced<number>;
  fulfillment: Sourced<number>;
  storage: Sourced<number>;
  sizeTier: SizeTierResult | null;
  referralRule: ReferralRule | null;
  notes: string[];
}

export function referralRuleFor(table: FeeTable, category: string | null): { rule: ReferralRule; matched: boolean } {
  if (category && table.referral[category]) return { rule: table.referral[category], matched: true };
  return { rule: table.referral["Everything Else"], matched: false };
}

export function estimateFees(table: FeeTable, input: FeeEstimateInput): FeeEstimate {
  const notes: string[] = [];
  const tableSource = `Reference fee table (${table.effectiveDate}) — verify`;
  const { rule, matched } = referralRuleFor(table, input.category);
  if (!matched) {
    notes.push(
      input.category
        ? `Category "${input.category}" isn't in the fee table; used the "Everything Else" rate. Verify the correct category rate.`
        : "Category unknown; used the \"Everything Else\" referral rate. Verify the category.",
    );
  }

  const referral =
    input.referralOverride && input.referralOverride.value !== null
      ? input.referralOverride
      : sourced(round2(referralFee(rule, input.price)), "ESTIMATED", { source: tableSource });
  const closing = sourced(rule.closingFee ?? 0, "ESTIMATED", { source: tableSource });

  let sizeTier: SizeTierResult | null = null;
  if (input.dims && input.unitWeightLb !== null && input.unitWeightLb !== undefined) {
    sizeTier = classifySizeTier(table, input.dims, input.unitWeightLb);
  }

  let fulfillment: Sourced<number>;
  let storage: Sourced<number>;
  if (input.fulfillment === "FBM") {
    fulfillment =
      input.fulfillmentOverride && input.fulfillmentOverride.value !== null
        ? input.fulfillmentOverride
        : input.fbmShippingCost !== null && input.fbmShippingCost !== undefined
          ? sourced(input.fbmShippingCost, "USER_PROVIDED", { source: "Your FBM shipping cost" })
          : { value: null, kind: "UNKNOWN", note: "Enter your FBM shipping label cost." };
    storage = sourced(0, "ASSUMPTION", { note: "FBM: no Amazon storage fee; your own storage costs go in Other." });
  } else {
    if (input.fulfillmentOverride && input.fulfillmentOverride.value !== null) {
      fulfillment = input.fulfillmentOverride;
    } else if (sizeTier) {
      fulfillment = sourced(fbaFulfillmentFee(table, sizeTier, input.price), "ESTIMATED", { source: tableSource });
    } else {
      fulfillment = {
        value: null,
        kind: "UNKNOWN",
        note: "Dimensions and weight are needed to estimate the FBA fee.",
      };
    }
    if (sizeTier && input.dims) {
      const perMonth = monthlyStorageFeePerUnit(table, input.dims, sizeTier.tier, input.month);
      storage = sourced(round2((perMonth * input.expectedStorageDays) / 30), "ESTIMATED", {
        source: tableSource,
        note: `${input.expectedStorageDays} days of storage assumed. Aged-inventory surcharges not included.`,
      });
    } else {
      storage = { value: null, kind: "UNKNOWN", note: "Dimensions are needed to estimate storage." };
    }
  }
  return { referral, closing, fulfillment, storage, sizeTier, referralRule: rule, notes };
}
