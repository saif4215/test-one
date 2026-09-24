/**
 * Cash flow (§11), expense categories (§26), and purchase orders (§10).
 *
 * Cash balance and business profit aren't the same thing. Buying inventory
 * lowers cash but isn't an expense until the item sells (then it becomes cost
 * of goods sold). Amazon payouts also arrive on a delay after the sale.
 */

export const TRANSACTION_TYPES = [
  "capital_contribution",
  "owner_draw",
  "amazon_payout",
  "other_income",
  "inventory_purchase",
  "inbound_shipping",
  "prep",
  "packaging",
  "supplies",
  "software",
  "subscriptions",
  "advertising",
  "storage",
  "refunds",
  "returns",
  "office",
  "equipment",
  "mileage",
  "professional_services",
  "amazon_fees",
  "other_expense",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_LABEL: Record<TransactionType, string> = {
  capital_contribution: "Capital contribution",
  owner_draw: "Owner draw",
  amazon_payout: "Amazon payout",
  other_income: "Other income",
  inventory_purchase: "Inventory purchase",
  inbound_shipping: "Inbound shipping",
  prep: "Prep",
  packaging: "Packaging",
  supplies: "Supplies",
  software: "Software",
  subscriptions: "Subscriptions",
  advertising: "Advertising",
  storage: "Storage",
  refunds: "Refunds",
  returns: "Returns",
  office: "Office expenses",
  equipment: "Equipment",
  mileage: "Mileage",
  professional_services: "Professional services",
  amazon_fees: "Amazon fees (billed separately)",
  other_expense: "Other operating expense",
};

/** Inflows increase cash; everything else decreases it. */
export const INFLOW_TYPES: TransactionType[] = ["capital_contribution", "amazon_payout", "other_income"];

/** Inventory purchases and the costs of getting it to Amazon are capitalized into inventory (COGS when sold). */
export const COGS_TYPES: TransactionType[] = ["inventory_purchase", "inbound_shipping", "prep", "packaging"];

/** Not an operating expense and not COGS. */
export const EQUITY_TYPES: TransactionType[] = ["capital_contribution", "owner_draw"];

export function classify(t: TransactionType): "inflow" | "cogs" | "equity" | "operating" {
  if (INFLOW_TYPES.includes(t) && t !== "capital_contribution") return "inflow";
  if (EQUITY_TYPES.includes(t)) return "equity";
  if (COGS_TYPES.includes(t)) return "cogs";
  return "operating";
}

export interface Transaction {
  date: string; // ISO date
  type: TransactionType;
  /** Always positive; direction comes from `type`. */
  amount: number;
  description?: string;
}

export interface CashFlowSummary {
  month: string; // YYYY-MM
  startingCash: number;
  inflows: number;
  outflows: number;
  netCashFlow: number;
  endingCash: number;
  byType: Partial<Record<TransactionType, number>>;
}

export function signedAmount(t: Transaction): number {
  return INFLOW_TYPES.includes(t.type) ? t.amount : -t.amount;
}

/**
 * Monthly cash-flow summaries, in date order.
 * Example (§11): 1,000 − 500 − 100 − 50 + 900 = 1,250.
 */
export function monthlyCashFlow(transactions: Transaction[], openingCash = 0): CashFlowSummary[] {
  const byMonth = new Map<string, Transaction[]>();
  for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const m = t.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(t);
  }
  const out: CashFlowSummary[] = [];
  let cash = openingCash;
  for (const [month, txs] of byMonth) {
    const byType: Partial<Record<TransactionType, number>> = {};
    let inflows = 0;
    let outflows = 0;
    for (const t of txs) {
      byType[t.type] = (byType[t.type] ?? 0) + t.amount;
      if (INFLOW_TYPES.includes(t.type)) inflows += t.amount;
      else outflows += t.amount;
    }
    const start = cash;
    cash = start + inflows - outflows;
    out.push({ month, startingCash: start, inflows, outflows, netCashFlow: inflows - outflows, endingCash: cash, byType });
  }
  return out;
}

export interface POLine {
  product: string;
  sku?: string;
  asin?: string;
  quantity: number;
  unitCost: number;
  /** Expected selling price per unit, used for expected revenue. */
  expectedSalePrice?: number | null;
  /** Estimated Amazon fees + deducted costs per unit at the expected price. */
  expectedFeesPerUnit?: number | null;
}

export interface POTotals {
  subtotal: number;
  shipping: number;
  otherCosts: number;
  totalCost: number;
  totalUnits: number;
  lines: (POLine & { lineSubtotal: number; landedUnitCost: number; expectedProfit: number | null })[];
  expectedRevenue: number | null;
  estimatedProfit: number | null;
  expectedRoiPct: number | null;
}

/** PO totals. Shipping and other costs are spread over lines by value to get a landed cost per unit. */
export function poTotals(lines: POLine[], shipping: number, otherCosts: number): POTotals {
  const subtotal = lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);
  const extra = shipping + otherCosts;
  let revenueKnown = true;
  let expectedRevenue = 0;
  let estimatedProfit = 0;
  const outLines = lines.map((l) => {
    const lineSubtotal = l.quantity * l.unitCost;
    const share = subtotal > 0 ? lineSubtotal / subtotal : 0;
    const landedUnitCost = l.quantity > 0 ? (lineSubtotal + extra * share) / l.quantity : 0;
    let expectedProfit: number | null = null;
    if (l.expectedSalePrice != null && l.expectedFeesPerUnit != null) {
      expectedProfit = (l.expectedSalePrice - l.expectedFeesPerUnit - landedUnitCost) * l.quantity;
      expectedRevenue += l.expectedSalePrice * l.quantity;
      estimatedProfit += expectedProfit;
    } else revenueKnown = false;
    return { ...l, lineSubtotal, landedUnitCost, expectedProfit };
  });
  const totalCost = subtotal + extra;
  return {
    subtotal,
    shipping,
    otherCosts,
    totalCost,
    totalUnits: lines.reduce((a, l) => a + l.quantity, 0),
    lines: outLines,
    expectedRevenue: revenueKnown && lines.length ? expectedRevenue : null,
    estimatedProfit: revenueKnown && lines.length ? estimatedProfit : null,
    expectedRoiPct: revenueKnown && lines.length && totalCost > 0 ? (estimatedProfit / totalCost) * 100 : null,
  };
}
