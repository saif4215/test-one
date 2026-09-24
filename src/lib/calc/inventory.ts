/**
 * Reorder points, scaling targets, and inventory turnover (§12, §17, §18).
 * The results are only as good as the sales and lead-time data you put in.
 */

/** Reorder point = average daily sales × supplier lead time + safety stock. Example: 3 × 10 + 10 = 40. */
export function reorderPoint(avgDailySales: number, leadTimeDays: number, safetyStock: number): number {
  return Math.ceil(avgDailySales * leadTimeDays + safetyStock);
}

/** Safety stock as enough days of sales to cover demand spikes or supplier delays. */
export function safetyStock(avgDailySales: number, safetyDays: number): number {
  return Math.ceil(avgDailySales * safetyDays);
}

export interface ScalingPlan {
  initialOrder: number;
  reorderPoint: number;
  safetyStock: number;
  maxInventoryTarget: number;
  expectedMonthlyUnits: number;
  expectedMonthlyPurchases: number;
  limitedByCapital: boolean;
  notes: string[];
}

export function scalingPlan(p: {
  avgDailySales: number;
  leadTimeDays: number;
  safetyDays: number;
  /** Days of sales each order should cover. */
  reviewPeriodDays: number;
  unitCost: number;
  capitalAvailable: number;
  /** Max share of available capital to put into this one product, in %. */
  maxCapitalPct: number;
}): ScalingPlan {
  const ss = safetyStock(p.avgDailySales, p.safetyDays);
  const rop = reorderPoint(p.avgDailySales, p.leadTimeDays, ss);
  const maxTarget = Math.ceil(p.avgDailySales * (p.leadTimeDays + p.reviewPeriodDays) + ss);
  const capitalUnits = p.unitCost > 0 ? Math.floor((p.capitalAvailable * p.maxCapitalPct) / 100 / p.unitCost) : 0;
  const demandUnits = Math.ceil(p.avgDailySales * p.reviewPeriodDays + ss);
  const initialOrder = Math.max(0, Math.min(demandUnits, capitalUnits));
  const notes = [
    "Based on the sales rate and lead time you entered. Actual demand and supplier timing can differ.",
  ];
  if (capitalUnits < demandUnits) {
    notes.push(`Capital limit caps the order at ${capitalUnits} units (${p.maxCapitalPct}% of available capital).`);
  }
  const monthlyUnits = p.avgDailySales * 30;
  return {
    initialOrder,
    reorderPoint: rop,
    safetyStock: ss,
    maxInventoryTarget: maxTarget,
    expectedMonthlyUnits: monthlyUnits,
    expectedMonthlyPurchases: monthlyUnits * p.unitCost,
    limitedByCapital: capitalUnits < demandUnits,
    notes,
  };
}

/** Inventory turnover = cost of goods sold ÷ average inventory (at cost). */
export function inventoryTurnover(cogs: number, avgInventoryCost: number): number | null {
  return avgInventoryCost > 0 ? cogs / avgInventoryCost : null;
}

/** Days of inventory = number of days in the period ÷ turnover. */
export function daysOfInventory(cogs: number, avgInventoryCost: number, periodDays: number): number | null {
  const t = inventoryTurnover(cogs, avgInventoryCost);
  return t && t > 0 ? periodDays / t : null;
}

/** Sell-through rate = units sold ÷ units received × 100. */
export function sellThroughPct(unitsSold: number, unitsReceived: number): number | null {
  return unitsReceived > 0 ? (unitsSold / unitsReceived) * 100 : null;
}

export interface SlowMoverInput {
  id: string | number;
  name: string;
  remaining: number;
  unitCost: number;
  lastSaleAt: string | null;
  receivedAt: string | null;
}

export interface SlowMover extends SlowMoverInput {
  daysSinceActivity: number;
  capitalTiedUp: number;
  reason: string;
}

/**
 * Flags items with stock left and no sale within `thresholdDays`. The result
 * suggests a pricing review, not liquidation; weigh the financial impact first (§12).
 */
export function findSlowMovers(items: SlowMoverInput[], thresholdDays: number, now: Date = new Date()): SlowMover[] {
  const out: SlowMover[] = [];
  for (const it of items) {
    if (it.remaining <= 0) continue;
    const ref = it.lastSaleAt ?? it.receivedAt;
    if (!ref) continue;
    const days = (now.getTime() - Date.parse(ref)) / 86_400_000;
    if (days >= thresholdDays) {
      out.push({
        ...it,
        daysSinceActivity: Math.floor(days),
        capitalTiedUp: it.remaining * it.unitCost,
        reason: it.lastSaleAt
          ? `No sale in ${Math.floor(days)} days; consider a pricing review.`
          : `No sales since it was received ${Math.floor(days)} days ago; consider a pricing review.`,
      });
    }
  }
  return out.sort((a, b) => b.capitalTiedUp - a.capitalTiedUp);
}
