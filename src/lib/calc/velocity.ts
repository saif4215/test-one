/**
 * Sales velocity estimates (§15, §55, §56).
 *
 * Every output is an ESTIMATE shown as a range. Sales rank is an indicator,
 * not a unit count, so this module works only from a monthly-sales range the
 * user or a third-party tool supplies. If there isn't one, it says so.
 */

export const INSUFFICIENT_SALES_DATA = "Insufficient data to estimate sales reliably.";

export interface Range {
  low: number;
  high: number;
}

export interface VelocityInput {
  /** Estimated monthly unit sales for the whole listing (all sellers), as a range. */
  listingMonthlySales: Range | null;
  /** Number of competing offers (including you, if you're already selling). */
  sellerCount: number | null;
  /**
   * Your assumed share of listing sales, in %. If omitted, an even split
   * (1 / (sellers + 1)) is used and labeled as an assumption.
   */
  shareAssumptionPct?: number | null;
  /** Units you plan to hold (for inventory duration). */
  quantity?: number | null;
}

export interface VelocityEstimate {
  sufficient: true;
  sharePct: number;
  shareIsDefault: boolean;
  monthly: Range;
  weekly: Range;
  daily: Range;
  next30Days: Range;
  next90Days: Range;
  /** Days to sell `quantity` units: low = fast case, high = slow case. */
  inventoryDurationDays: Range | null;
  assumptions: string[];
}

export type VelocityResult = VelocityEstimate | { sufficient: false; message: string };

const DAYS_PER_MONTH = 30;

export function estimateVelocity(input: VelocityInput): VelocityResult {
  const ls = input.listingMonthlySales;
  if (!ls || !(ls.high > 0) || ls.low < 0 || ls.low > ls.high) {
    return { sufficient: false, message: INSUFFICIENT_SALES_DATA };
  }
  const assumptions: string[] = [
    `Listing sells an estimated ${ls.low}–${ls.high} units/month (from the data you supplied; not confirmed Amazon sales).`,
  ];
  let sharePct: number;
  let shareIsDefault = false;
  if (input.shareAssumptionPct !== null && input.shareAssumptionPct !== undefined && input.shareAssumptionPct > 0) {
    sharePct = Math.min(100, input.shareAssumptionPct);
    assumptions.push(`You capture ${sharePct}% of listing sales (your assumption).`);
  } else if (input.sellerCount !== null && input.sellerCount !== undefined && input.sellerCount >= 0) {
    sharePct = 100 / (input.sellerCount + 1);
    shareIsDefault = true;
    assumptions.push(
      `Even split across ${input.sellerCount} existing sellers plus you (${sharePct.toFixed(1)}%). Buy Box share is not guaranteed and may be lower.`,
    );
  } else {
    return { sufficient: false, message: `${INSUFFICIENT_SALES_DATA} Seller count or a market-share assumption is needed.` };
  }
  const f = sharePct / 100;
  const monthly = { low: ls.low * f, high: ls.high * f };
  const daily = { low: monthly.low / DAYS_PER_MONTH, high: monthly.high / DAYS_PER_MONTH };
  const weekly = { low: daily.low * 7, high: daily.high * 7 };
  let inventoryDurationDays: Range | null = null;
  if (input.quantity && input.quantity > 0) {
    inventoryDurationDays = {
      low: inventoryDuration(input.quantity, daily.high) ?? Infinity,
      high: inventoryDuration(input.quantity, daily.low) ?? Infinity,
    };
  }
  return {
    sufficient: true,
    sharePct,
    shareIsDefault,
    monthly,
    weekly,
    daily,
    next30Days: { low: daily.low * 30, high: daily.high * 30 },
    next90Days: { low: daily.low * 90, high: daily.high * 90 },
    inventoryDurationDays,
    assumptions,
  };
}

/** Days to sell through `units` at `dailySales`. Example (§56): 30 ÷ 2 = 15 days. */
export function inventoryDuration(units: number, dailySales: number): number | null {
  if (!(dailySales > 0)) return null;
  return units / dailySales;
}
