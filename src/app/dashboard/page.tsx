import Link from "next/link";
import { connection } from "next/server";
import { GoogleSheetsSync } from "@/components/GoogleSheetsSync";
import { MonthlyChart } from "@/components/MonthlyChart";
import { Card, Notice, PageHeader, Stat, TableWrap } from "@/components/ui";
import { daysOfInventory, findSlowMovers, inventoryTurnover } from "@/lib/calc/inventory";
import { cashBalance, inventorySummary, landed, monthlySeries, onHand, profitSummary } from "@/lib/calc/metrics";
import { getDb } from "@/lib/db/client";
import { fmtNum, fmtPct, fmtUSD } from "@/lib/format";
import { listInventory, listSales, listTransactions } from "@/lib/repo/operations";
import { getSettings } from "@/lib/repo/products";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const settings = getSettings(db);
  const items = listInventory(db);
  const sales = listSales(db);
  const txs = listTransactions(db);
  const hasCapital = txs.some((t) => t.type === "capital_contribution");
  const opening = hasCapital ? 0 : settings.startingBudget ?? 0;

  const inv = inventorySummary(items);
  const all = profitSummary(sales, items, txs);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const month = profitSummary(sales, items, txs, { from: monthStart });
  const series = monthlySeries(sales, items, txs, 12, now);
  const cash = cashBalance(txs, opening);
  const shipping = txs.filter((t) => t.type === "inbound_shipping").reduce((a, t) => a + t.amount, 0);
  const since90 = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const cogs90 = profitSummary(sales, items, txs, { from: since90 }).cogs;
  const turnover = inventoryTurnover(cogs90, inv.costValue);
  const doi = daysOfInventory(cogs90, inv.costValue, 90);
  const slow = findSlowMovers(
    items.map((i) => ({ id: i.id, name: i.name, remaining: onHand(i), unitCost: landed(i), lastSaleAt: i.lastSaleAt, receivedAt: i.receivedAt })),
    settings.costDefaults.slowMoverDays,
  );
  const empty = items.length === 0 && sales.length === 0 && txs.length === 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Profit comes from recorded sales (revenue − refunds − Amazon fees − cost of goods sold − operating expenses). Cash comes from recorded transactions. The two aren't the same."
      />
      {empty && (
        <div className="mb-5">
          <Notice tone="info">
            Nothing recorded yet. Add <Link className="underline" href="/inventory">inventory and sales</Link> and{" "}
            <Link className="underline" href="/cash-flow">transactions</Link> to fill in this dashboard. It only shows numbers you&apos;ve recorded.
          </Notice>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total revenue (net)" value={fmtUSD(all.netRevenue)} hint={`${fmtUSD(all.grossRevenue)} gross − ${fmtUSD(all.refunds)} refunds`} />
        <Stat label="Estimated net profit" value={fmtUSD(all.netProfit)} tone={all.netProfit < 0 ? "bad" : all.netProfit > 0 ? "good" : undefined} />
        <Stat label="ROI" value={fmtPct(all.roiPct, 1)} hint="Net profit ÷ (COGS + operating expenses)" />
        <Stat label="Profit margin" value={fmtPct(all.marginPct, 1)} hint="Net profit ÷ net revenue" />
        <Stat label="Product cost (COGS)" value={fmtUSD(all.cogs)} />
        <Stat label="Amazon fees" value={fmtUSD(all.amazonFees)} />
        <Stat label="Inbound shipping" value={fmtUSD(shipping)} hint="From transactions" />
        <Stat label="Other expenses" value={fmtUSD(all.operatingExpenses)} hint="Operating expenses from transactions" />
        <Stat label="Inventory value" value={fmtUSD(inv.costValue)} hint="At landed cost" />
        <Stat label="Cash invested" value={fmtUSD(inv.capitalInvested)} hint="All inventory purchased, at landed cost" />
        <Stat label="Cash available" value={fmtUSD(cash)} hint={hasCapital ? "From transactions" : `Starting from your ${fmtUSD(opening)} budget`} />
        <Stat label="Units sold" value={fmtNum(all.unitsSold)} hint={all.unitsRefunded ? `${all.unitsRefunded} refunded` : undefined} />
        <Stat label="Units in inventory" value={fmtNum(inv.unitsOnHand)} />
        <Stat label="Avg profit / unit" value={fmtUSD(all.avgProfitPerUnit)} hint="Gross profit ÷ net units sold" />
        <Stat label="Avg ROI on units sold" value={fmtPct(all.cogs > 0 ? ((all.grossProfit) / all.cogs) * 100 : null, 1)} hint="Gross profit ÷ COGS" />
        <Stat label="Inventory turnover (90 days)" value={turnover === null ? "Unknown" : `${turnover.toFixed(2)}×`} hint={doi === null ? "Needs sales and inventory" : `≈ ${Math.round(doi)} days of inventory (approx.)`} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Stat label="This month's revenue" value={fmtUSD(month.netRevenue)} />
        <Stat label="This month's profit" value={fmtUSD(month.netProfit)} tone={month.netProfit < 0 ? "bad" : undefined} />
      </div>

      <div className="mt-5">
        <Card title="Monthly revenue and profit (last 12 months)">
          <MonthlyChart data={series} />
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Slow-moving inventory">
          {slow.length === 0 ? (
            <p className="text-sm text-muted">None flagged (threshold: {settings.costDefaults.slowMoverDays} days without a sale).</p>
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="r">On hand</th>
                    <th className="r">Capital tied up</th>
                    <th className="r">Days inactive</th>
                  </tr>
                </thead>
                <tbody>
                  {slow.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="r">{s.remaining}</td>
                      <td className="r">{fmtUSD(s.capitalTiedUp)}</td>
                      <td className="r">{s.daysSinceActivity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
      <div className="mt-5">
        <Card title="Google Sheets">
          <GoogleSheetsSync
            back="/dashboard"
            result={typeof sp.sheets === "string" ? sp.sheets : undefined}
            error={typeof sp.sheetsError === "string" ? sp.sheetsError : undefined}
          />
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">
        Turnover uses COGS over the last 90 days divided by the current inventory value, which approximates average inventory. Profit figures depend on the fees and costs you recorded.
      </p>
    </>
  );
}
