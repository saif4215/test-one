/**
 * Business metrics for the inventory page and dashboard (§9, §12, §28).
 *
 * PROFIT is measured from sales: revenue − refunds − Amazon fees − cost of
 * goods sold − operating expenses. CASH is measured from recorded
 * transactions. They differ because inventory you buy is cash out but only
 * becomes COGS when it sells (§11).
 */
import { classify, type TransactionType } from "./ledger";

export interface InvRow {
  id: number;
  name: string;
  unitCost: number;
  shippingPerUnit: number;
  prepPerUnit: number;
  qtyPurchased: number;
  qtyReceived: number;
  qtySold: number;
  salePrice: number | null;
  feesPerUnit: number | null;
}

export interface SaleRow {
  inventoryId: number;
  date: string;
  qty: number;
  salePrice: number;
  fees: number;
  refundedQty: number;
}

export interface TxRow {
  date: string;
  type: string;
  amount: number;
}

export const landed = (i: InvRow) => i.unitCost + i.shippingPerUnit + i.prepPerUnit;
export const onHand = (i: InvRow) => Math.max(0, i.qtyReceived - i.qtySold);

export interface InventorySummary {
  unitsOnHand: number;
  /** Units on hand × landed cost. */
  costValue: number;
  /** Units on hand × expected sale price (items without a price are excluded). */
  retailValue: number;
  /** Estimated profit if on-hand units sell at the expected price and fees. */
  estimatedProfit: number;
  /** Items missing a sale price or fees, so excluded from the estimates above. */
  itemsMissingPrice: number;
  /** Everything ever purchased, at landed cost. */
  capitalInvested: number;
}

export function inventorySummary(items: InvRow[]): InventorySummary {
  let unitsOnHand = 0;
  let costValue = 0;
  let retailValue = 0;
  let estimatedProfit = 0;
  let itemsMissingPrice = 0;
  let capitalInvested = 0;
  for (const i of items) {
    const n = onHand(i);
    unitsOnHand += n;
    costValue += n * landed(i);
    capitalInvested += i.qtyPurchased * landed(i);
    if (i.salePrice === null || i.feesPerUnit === null) {
      if (n > 0) itemsMissingPrice++;
      continue;
    }
    retailValue += n * i.salePrice;
    estimatedProfit += n * (i.salePrice - i.feesPerUnit - landed(i));
  }
  return { unitsOnHand, costValue, retailValue, estimatedProfit, itemsMissingPrice, capitalInvested };
}

export interface ProfitSummary {
  unitsSold: number;
  unitsRefunded: number;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  amazonFees: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  /** Net profit ÷ (COGS + operating expenses). */
  roiPct: number | null;
  /** Net profit ÷ net revenue. */
  marginPct: number | null;
  avgProfitPerUnit: number | null;
}

export function profitSummary(sales: SaleRow[], items: InvRow[], txs: TxRow[], range?: { from?: string; to?: string }): ProfitSummary {
  const inRange = (d: string) => (!range?.from || d >= range.from) && (!range?.to || d < range.to);
  const byId = new Map(items.map((i) => [i.id, i]));
  let unitsSold = 0;
  let unitsRefunded = 0;
  let grossRevenue = 0;
  let refunds = 0;
  let amazonFees = 0;
  let cogs = 0;
  for (const s of sales) {
    if (!inRange(s.date)) continue;
    const item = byId.get(s.inventoryId);
    unitsSold += s.qty;
    unitsRefunded += s.refundedQty;
    grossRevenue += s.qty * s.salePrice;
    refunds += s.refundedQty * s.salePrice;
    amazonFees += s.fees;
    cogs += item ? s.qty * landed(item) : 0;
  }
  let operatingExpenses = 0;
  for (const t of txs) {
    if (!inRange(t.date)) continue;
    if (classify(t.type as TransactionType) === "operating") operatingExpenses += t.amount;
  }
  const netRevenue = grossRevenue - refunds;
  const grossProfit = netRevenue - amazonFees - cogs;
  const netProfit = grossProfit - operatingExpenses;
  const invested = cogs + operatingExpenses;
  const netUnits = unitsSold - unitsRefunded;
  return {
    unitsSold,
    unitsRefunded,
    grossRevenue,
    refunds,
    netRevenue,
    amazonFees,
    cogs,
    grossProfit,
    operatingExpenses,
    netProfit,
    roiPct: invested > 0 ? (netProfit / invested) * 100 : null,
    marginPct: netRevenue > 0 ? (netProfit / netRevenue) * 100 : null,
    avgProfitPerUnit: netUnits > 0 ? grossProfit / netUnits : null,
  };
}

export interface MonthPoint {
  month: string;
  revenue: number;
  profit: number;
  units: number;
}

/** Monthly revenue and net profit for the last `months` months ending with the month of `now`. */
export function monthlySeries(sales: SaleRow[], items: InvRow[], txs: TxRow[], months = 12, now = new Date()): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const from = d.toISOString().slice(0, 10);
    const to = next.toISOString().slice(0, 10);
    const p = profitSummary(sales, items, txs, { from, to });
    out.push({ month: from.slice(0, 7), revenue: p.netRevenue, profit: p.netProfit, units: p.unitsSold });
  }
  return out;
}

/** Cash on hand from transactions, starting from `openingCash`. */
export function cashBalance(txs: TxRow[], openingCash: number): number {
  let cash = openingCash;
  for (const t of txs) {
    const c = classify(t.type as TransactionType);
    if (c === "inflow" || t.type === "capital_contribution") cash += t.amount;
    else cash -= t.amount;
  }
  return cash;
}
