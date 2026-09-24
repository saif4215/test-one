/**
 * Profit calculator (§3).
 *
 * Costs are split into two groups:
 *  - UPFRONT costs you pay before the item sells: purchase price, sales tax on
 *    the purchase, inbound shipping, prep, packaging, and other per-unit costs.
 *    These are the "total investment" that ROI is measured against, which
 *    matches the spec's examples ($9 / $13 = 69.23%, $120 / $300 = 40%).
 *  - DEDUCTED costs that come out of the sale: referral fee, closing fee,
 *    fulfillment fee, storage, returns allowance, and advertising.
 */

export interface CostModel {
  purchasePrice: number;
  /** Sales tax paid on the purchase, as a % of purchase price. */
  purchaseTaxPct: number;
  inboundShipping: number;
  prep: number;
  packaging: number;
  otherUpfront: number;
  fulfillment: number;
  storage: number;
  advertising: number;
  closingFee: number;
  /** Referral fee as a function of sale price (tiered %, minimum fee). */
  referral: (price: number) => number;
  /** Returns allowance as a % of sale price (an assumption, not a known cost). */
  returnsPct: number;
}

export interface UnitEconomics {
  salePrice: number;
  purchaseCost: number; // purchase price + purchase tax
  upfrontCost: number; // total investment per unit
  referralFee: number;
  closingFee: number;
  fulfillmentFee: number;
  storage: number;
  returnsAllowance: number;
  advertising: number;
  amazonFees: number; // referral + closing + fulfillment + storage
  deductedCost: number;
  totalCost: number;
  profit: number;
  /** % of upfront investment; null when the investment is zero. */
  roiPct: number | null;
  /** % of sale price; null when the price is zero. */
  marginPct: number | null;
}

export function purchaseCost(m: CostModel, purchasePrice = m.purchasePrice): number {
  return purchasePrice * (1 + m.purchaseTaxPct / 100);
}

export function otherUpfront(m: CostModel): number {
  return m.inboundShipping + m.prep + m.packaging + m.otherUpfront;
}

export function unitEconomics(m: CostModel, salePrice: number): UnitEconomics {
  const pc = purchaseCost(m);
  const upfront = pc + otherUpfront(m);
  const referral = m.referral(salePrice);
  const returnsAllowance = (salePrice * m.returnsPct) / 100;
  const amazonFees = referral + m.closingFee + m.fulfillment + m.storage;
  const deducted = amazonFees + returnsAllowance + m.advertising;
  const totalCost = upfront + deducted;
  const profit = salePrice - totalCost;
  return {
    salePrice,
    purchaseCost: pc,
    upfrontCost: upfront,
    referralFee: referral,
    closingFee: m.closingFee,
    fulfillmentFee: m.fulfillment,
    storage: m.storage,
    returnsAllowance,
    advertising: m.advertising,
    amazonFees,
    deductedCost: deducted,
    totalCost,
    profit,
    roiPct: upfront > 0 ? (profit / upfront) * 100 : null,
    marginPct: salePrice > 0 ? (profit / salePrice) * 100 : null,
  };
}

const MAX_SEARCH_PRICE = 100_000;

/**
 * Smallest sale price at which `ok(price)` holds, found by bisection.
 * Profit rises with price for any referral fee under 100%, so a bisection works.
 */
function lowestPriceWhere(ok: (price: number) => boolean): number | null {
  if (!ok(MAX_SEARCH_PRICE)) return null;
  let lo = 0;
  let hi = MAX_SEARCH_PRICE;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  // Round up to the next cent so the returned price actually meets the condition.
  return Math.ceil(hi * 100 - 1e-6) / 100;
}

/** Sale price at which estimated profit is $0. */
export function breakEvenPrice(m: CostModel): number | null {
  return lowestPriceWhere((p) => unitEconomics(m, p).profit >= 0);
}

/** Lowest sale price that meets both the target profit per unit and the target ROI. */
export function minProfitablePrice(m: CostModel, targetProfit: number, targetRoiPct: number): number | null {
  return lowestPriceWhere((p) => {
    const u = unitEconomics(m, p);
    return u.profit >= targetProfit - 1e-9 && (u.roiPct === null || u.roiPct >= targetRoiPct - 1e-9);
  });
}

/**
 * Highest purchase price (before sales tax) that still meets the target profit
 * per unit AND the target ROI at the given sale price. Returns 0 if no purchase
 * price works.
 *
 * With A = sale price − deducted costs − other upfront costs (profit before buy cost),
 * U = other upfront costs, and c = purchase cost incl. tax:
 *   profit ≥ T  →  c ≤ A − T
 *   ROI ≥ r     →  A − c ≥ r(c + U)  →  c ≤ (A − rU) / (1 + r)
 */
export function maxBuyCost(m: CostModel, salePrice: number, targetProfit: number, targetRoiPct: number): number {
  const u = unitEconomics({ ...m, purchasePrice: 0 }, salePrice);
  const U = otherUpfront(m);
  const A = salePrice - u.deductedCost - U;
  const r = targetRoiPct / 100;
  const maxCost = Math.min(A - targetProfit, (A - r * U) / (1 + r));
  if (maxCost <= 0) return 0;
  return Math.floor((maxCost / (1 + m.purchaseTaxPct / 100)) * 100 + 1e-6) / 100;
}

export interface BatchEconomics {
  quantity: number;
  totalInvestment: number;
  expectedRevenue: number;
  totalProfit: number;
  roiPct: number | null;
}

export function batchEconomics(u: UnitEconomics, quantity: number): BatchEconomics {
  const totalInvestment = u.upfrontCost * quantity;
  const totalProfit = u.profit * quantity;
  return {
    quantity,
    totalInvestment,
    expectedRevenue: u.salePrice * quantity,
    totalProfit,
    roiPct: totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : null,
  };
}

/** A simple cost model with a fixed fee amount; used by the quick calculator and tests. */
export function simpleModel(p: {
  purchasePrice: number;
  amazonFees: number;
  prepAndShipping: number;
}): CostModel {
  return {
    purchasePrice: p.purchasePrice,
    purchaseTaxPct: 0,
    inboundShipping: 0,
    prep: p.prepAndShipping,
    packaging: 0,
    otherUpfront: 0,
    fulfillment: 0,
    storage: 0,
    advertising: 0,
    closingFee: 0,
    referral: () => p.amazonFees,
    returnsPct: 0,
  };
}
