import Link from "next/link";
import { connection } from "next/server";
import { Card, EmptyState, KindBadge, Notice, PageHeader, TableWrap } from "@/components/ui";
import { analyzeAll } from "@/lib/analysis/load";
import { reorderPoint, safetyStock } from "@/lib/calc/inventory";
import { onHand } from "@/lib/calc/metrics";
import { getDb } from "@/lib/db/client";
import { field } from "@/lib/domain/product";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { listInventory, listSales, listSuppliers } from "@/lib/repo/operations";
import { getSettings } from "@/lib/repo/products";

export default async function SalesIntelligencePage() {
  await connection();
  const db = getDb();
  const settings = getSettings(db);
  const products = analyzeAll(db).filter((r) => r.rec.status !== "rejected");
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const d90 = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const sales = listSales(db, { from: d90 });
  const suppliers = new Map(listSuppliers(db).map((s) => [s.id, s]));
  const own = listInventory(db)
    .map((i) => {
      const s90 = sales.filter((s) => s.inventoryId === i.id);
      const u30 = s90.filter((s) => s.date >= d30).reduce((a, s) => a + s.qty, 0);
      const u90 = s90.reduce((a, s) => a + s.qty, 0);
      const daily = u30 / 30;
      const lead = (i.supplierId && suppliers.get(i.supplierId)?.leadTimeDays) || null;
      return {
        item: i,
        u30,
        u90,
        daily,
        cover: daily > 0 ? onHand(i) / daily : null,
        lead,
        rop: daily > 0 ? reorderPoint(daily, lead ?? 14, safetyStock(daily, settings.costDefaults.safetyDays)) : null,
      };
    })
    .filter((r) => r.item.qtyReceived > 0);

  return (
    <>
      <PageHeader
        title="Sales Intelligence"
        subtitle="Sales indicators for products you're researching, and your own actual sales velocity for the inventory you hold."
      />
      <Notice tone="info">
        Sales rank is an indicator, not a unit count. Exact Amazon unit sales aren&apos;t public: <strong>Unknown</strong> unless a legitimate source
        supplies an estimate, which is always shown as a labeled range.
      </Notice>

      <div className="mt-5">
        <Card title="Research products: sales indicators">
          {products.length === 0 ? (
            <EmptyState title="No products researched yet" />
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="r">Sales rank</th>
                    <th className="r">Sellers</th>
                    <th>Listing sales / month</th>
                    <th>Source</th>
                    <th>Your est. / month</th>
                    <th>Est. days to sell qty</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(({ rec, analysis: a }) => {
                    const ls = field(rec.data, "listingMonthlySalesLow", rec.updatedAt);
                    const v = a.velocity;
                    return (
                      <tr key={rec.id}>
                        <td className="min-w-40">
                          <Link className="text-accent hover:underline" href={`/products/${rec.id}`}>{rec.data.name || "(unnamed)"}</Link>
                        </td>
                        <td className="r">{rec.data.salesRank === null ? "Unknown" : `#${fmtNum(rec.data.salesRank)}`}</td>
                        <td className="r">{rec.data.sellerCount ?? "Unknown"}</td>
                        <td>
                          {rec.data.listingMonthlySalesLow === null
                            ? "Unknown"
                            : `${fmtNum(rec.data.listingMonthlySalesLow)}–${fmtNum(rec.data.listingMonthlySalesHigh ?? rec.data.listingMonthlySalesLow)}`}
                        </td>
                        <td className="text-xs">
                          <KindBadge kind={ls.kind} /> <span className="text-muted">{ls.value !== null ? `${ls.source ?? ""} · ${fmtDateTime(ls.checkedAt)}` : ""}</span>
                        </td>
                        <td>{v.sufficient ? `${v.monthly.low.toFixed(1)}–${v.monthly.high.toFixed(1)} (est.)` : "Insufficient data"}</td>
                        <td>
                          {v.sufficient && v.inventoryDurationDays && Number.isFinite(v.inventoryDurationDays.high)
                            ? `${Math.round(v.inventoryDurationDays.low)}–${Math.round(v.inventoryDurationDays.high)} (est.)`
                            : "Unknown"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Your inventory: actual sales velocity (from recorded sales)">
          {own.length === 0 ? (
            <p className="text-sm text-muted">No received inventory yet.</p>
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="r">Sold (30 days)</th>
                    <th className="r">Sold (90 days)</th>
                    <th className="r">Avg / day</th>
                    <th className="r">On hand</th>
                    <th className="r">Days of cover</th>
                    <th className="r">Reorder point</th>
                  </tr>
                </thead>
                <tbody>
                  {own.map((r) => (
                    <tr key={r.item.id}>
                      <td>{r.item.name}</td>
                      <td className="r">{r.u30}</td>
                      <td className="r">{r.u90}</td>
                      <td className="r">{r.daily.toFixed(2)}</td>
                      <td className={`r ${r.rop !== null && onHand(r.item) <= r.rop ? "font-semibold text-warn" : ""}`}>{onHand(r.item)}</td>
                      <td className="r">{r.cover === null ? "—" : Math.round(r.cover)}</td>
                      <td className="r">
                        {r.rop ?? "—"}
                        {r.rop !== null && r.lead === null && <div className="text-xs text-muted">14-day lead assumed</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          <p className="mt-2 text-xs text-muted">
            Reorder point = average daily sales × supplier lead time + safety stock ({settings.costDefaults.safetyDays} days). Based on your last 30 days of sales; actual demand can differ.
          </p>
        </Card>
      </div>
    </>
  );
}
