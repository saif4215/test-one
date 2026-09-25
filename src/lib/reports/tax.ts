/**
 * Tax-prep summary (§27). It organizes your records only; it is not tax advice.
 * Tax treatment depends on your location and business structure, so review
 * it with a qualified tax professional.
 */
import { classify, TRANSACTION_LABEL, type TransactionType } from "@/lib/calc/ledger";
import { profitSummary, type InvRow, type SaleRow, type TxRow } from "@/lib/calc/metrics";

export const TAX_DISCLAIMER =
  "Organized from your records for tax preparation. This is not tax advice: tax treatment depends on your location and business structure, so consult a qualified tax professional.";

export function taxSummaryRows(year: number, sales: SaleRow[], items: InvRow[], txs: TxRow[]): string[][] {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const p = profitSummary(sales, items, txs, { from, to });
  const rows: string[][] = [
    ["Note", TAX_DISCLAIMER, ""],
    ["Section", "Item", "Amount (USD)"],
    ["Sales", "Gross sales", p.grossRevenue.toFixed(2)],
    ["Sales", "Refunds", (-p.refunds).toFixed(2)],
    ["Sales", "Net sales", p.netRevenue.toFixed(2)],
    ["Amazon fees", "Fees recorded on sales", p.amazonFees.toFixed(2)],
    ["COGS", "Cost of goods sold (landed cost of units sold)", p.cogs.toFixed(2)],
  ];
  const byType = new Map<TransactionType, number>();
  for (const t of txs) {
    if (t.date < from || t.date >= to) continue;
    const type = t.type as TransactionType;
    byType.set(type, (byType.get(type) ?? 0) + t.amount);
  }
  const sections: [string, (t: TransactionType) => boolean][] = [
    ["Inventory purchases (cash paid; not the same as COGS)", (t) => classify(t) === "cogs"],
    ["Operating expenses", (t) => classify(t) === "operating"],
    ["Owner / capital", (t) => classify(t) === "equity"],
    ["Other income and payouts", (t) => classify(t) === "inflow"],
  ];
  for (const [section, test] of sections) {
    for (const [type, amount] of [...byType].filter(([t]) => test(t)).sort()) {
      rows.push([section, TRANSACTION_LABEL[type] ?? type, amount.toFixed(2)]);
    }
  }
  rows.push(["Summary", "Gross profit (net sales − fees − COGS)", p.grossProfit.toFixed(2)]);
  rows.push(["Summary", "Operating expenses", p.operatingExpenses.toFixed(2)]);
  rows.push(["Summary", "Estimated net profit", p.netProfit.toFixed(2)]);
  return rows;
}
