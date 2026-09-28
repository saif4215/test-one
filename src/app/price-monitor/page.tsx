import Link from "next/link";
import { connection } from "next/server";
import { Card, EmptyState, LinkButton, PageHeader, Pill, riskTone, TableWrap } from "@/components/ui";
import { analyzeAll } from "@/lib/analysis/load";
import { getDb } from "@/lib/db/client";
import { ageInDays } from "@/lib/data/provenance";
import { field } from "@/lib/domain/product";
import { fmtDateTime, fmtPct, fmtUSD } from "@/lib/format";
import { getSettings } from "@/lib/repo/products";

export default async function PriceMonitorPage({ searchParams }: PageProps<"/price-monitor">) {
  await connection();
  const sp = await searchParams;
  const showAll = sp.all === "1";
  const db = getDb();
  const settings = getSettings(db);
  const rows = analyzeAll(db, showAll ? {} : { watch: true }).filter((r) => showAll || r.rec.watch);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Price Monitor"
        subtitle="Price history from the observations you've recorded (or from a connected source): averages, range, volatility, seller-count changes, and warnings. History doesn't predict future prices."
        actions={
          <Link className="btn btn-secondary" href={showAll ? "/price-monitor" : "/price-monitor?all=1"}>
            {showAll ? "Watchlist only" : "Show all products"}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title={showAll ? "No products yet" : "Your watchlist is empty"} action={<LinkButton href="/products">Find products to watch</LinkButton>}>
          Open a product and click ☆ Watch. Then record price observations on its page as you check it.
        </EmptyState>
      ) : (
        <Card>
          <TableWrap>
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="r">Current</th>
                  <th className="r">30d avg</th>
                  <th className="r">90d avg</th>
                  <th className="r">Low / high</th>
                  <th>Volatility</th>
                  <th>Sellers</th>
                  <th>Last checked</th>
                  <th>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ rec, analysis: a }) => {
                  const h = a.priceHistory;
                  const sale = field(rec.data, "salePrice", rec.updatedAt);
                  const lastAt = h.currentAt ?? sale.checkedAt ?? null;
                  const age = ageInDays(lastAt ?? undefined, now);
                  const stale = age === null || age > settings.costDefaults.staleAfterDays;
                  return (
                    <tr key={rec.id}>
                      <td className="min-w-40">
                        <Link className="font-medium text-accent hover:underline" href={`/products/${rec.id}`}>{rec.data.name || "(unnamed)"}</Link>
                        <div className="text-xs text-muted">
                          {h.observations} observations
                          {h.observations >= 2 && (
                            <>
                              {" · "}
                              <Link className="text-accent hover:underline" href={`/products/${rec.id}#price-history`}>Chart</Link>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="r">{fmtUSD(h.current ?? rec.data.salePrice)}</td>
                      <td className="r">{fmtUSD(h.avg30)}</td>
                      <td className="r">{fmtUSD(h.avg90)}</td>
                      <td className="r">{h.lowest === null ? "Unknown" : `${fmtUSD(h.lowest)} / ${fmtUSD(h.highest)}`}</td>
                      <td>
                        <Pill tone={riskTone(h.volatilityLevel)}>{h.volatilityLevel}</Pill>
                        {h.volatilityPct !== null && <div className="text-xs text-muted">{fmtPct(h.volatilityPct, 1)}</div>}
                      </td>
                      <td>{h.sellerCountChange ? `${h.sellerCountChange.from} → ${h.sellerCountChange.to}` : rec.data.sellerCount ?? "Unknown"}</td>
                      <td className="whitespace-nowrap text-xs">
                        {fmtDateTime(lastAt)}
                        {stale && <div className="font-semibold text-warn">Data may be stale.</div>}
                      </td>
                      <td className="max-w-xs text-xs">{h.warnings.join(" ") || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
