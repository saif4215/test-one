import Link from "next/link";
import { connection } from "next/server";
import { Card, EmptyState, Field, LinkButton, NumberInput, PageHeader, Pill, riskTone, statusTone, TableWrap, Disclaimer, Notice } from "@/components/ui";
import { analyzeAll } from "@/lib/analysis/load";
import { allocateCapital, suggestTestQuantity } from "@/lib/calc/capital";
import { applyFilters, type DealFilters } from "@/lib/calc/filters";
import { getDb } from "@/lib/db/client";
import { fmtPct, fmtUSD } from "@/lib/format";
import { getSettings } from "@/lib/repo/products";

type SP = Record<string, string | string[] | undefined>;
const num = (sp: SP, k: string): number | null => {
  const v = sp[k];
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (sp: SP, k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : null);

const QUICK = [
  { label: "Under $20", q: "maxBuy=20" },
  { label: "At least $10 profit", q: "minProfit=10" },
  { label: "Low competition (≤5 sellers)", q: "maxSellers=5" },
  { label: "Strong sales indicators (≥10/mo est.)", q: "minSales=10" },
  { label: "Wholesale", q: "sourceType=wholesale" },
  { label: "Online arbitrage", q: "sourceType=online" },
  { label: "Retail arbitrage", q: "sourceType=retail" },
  { label: "Watchlist only", q: "scope=watch" },
];

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  await connection();
  const sp = (await searchParams) as SP;
  const db = getDb();
  const s = getSettings(db);
  const sf = s.filters;

  const filters: DealFilters = {
    ...sf,
    minProfit: num(sp, "minProfit") ?? sf.minProfit ?? s.targetMinProfit,
    minRoiPct: num(sp, "minRoi") ?? sf.minRoiPct ?? s.targetRoiPct,
    minMarginPct: num(sp, "minMargin") ?? sf.minMarginPct ?? s.targetMarginPct,
    maxPurchasePrice: num(sp, "maxBuy") ?? sf.maxPurchasePrice,
    maxSellerCount: num(sp, "maxSellers") ?? sf.maxSellerCount,
    maxSalesRank: num(sp, "maxRank") ?? sf.maxSalesRank,
    minMonthlySalesLow: num(sp, "minSales") ?? sf.minMonthlySalesLow,
    maxInventoryDays: num(sp, "maxDays") ?? sf.maxInventoryDays,
    maxCapitalPerProduct: num(sp, "maxCapital") ?? sf.maxCapitalPerProduct,
    maxRiskLevel: (str(sp, "maxRisk") as DealFilters["maxRiskLevel"]) ?? sf.maxRiskLevel,
    excludedCategories: [...sf.excludedCategories, ...s.avoidCategories],
  };
  const budget = num(sp, "budget") ?? s.startingBudget;
  const sourceType = str(sp, "sourceType");
  const scope = str(sp, "scope");

  let rows = analyzeAll(db, scope === "watch" ? { watch: true } : {});
  if (sourceType) rows = rows.filter((r) => r.rec.data.sourceType === sourceType);
  const results = rows.map((r) => ({ ...r, outcome: applyFilters(r.analysis.filterSubject, filters) }));
  const pass = results.filter((r) => r.outcome.status === "PASS");
  const needs = results.filter((r) => r.outcome.status === "NEEDS DATA");
  const fail = results.filter((r) => r.outcome.status === "FAIL");

  const plan = budget
    ? pass.map((r) => {
        const a = r.analysis;
        const t = a.unit
          ? suggestTestQuantity({
              capitalAvailable: budget,
              unitInvestment: a.unit.upfrontCost,
              risk: a.overallRisk,
              ownMonthlySalesLow: a.velocity.sufficient ? a.velocity.monthly.low : null,
              priceVolatility: a.priceHistory.volatilityLevel,
              monthsToExpiration: a.product.expiring ? a.product.monthsToExpiration : null,
              maxCapitalPctPerProduct: s.costDefaults.maxCapitalPctPerProduct,
            })
          : null;
        return { id: r.rec.id, name: r.rec.data.name, qty: t?.quantity ?? 0, capital: t?.investment ?? 0, profit: (a.unit?.profit ?? 0) * (t?.quantity ?? 0) };
      })
    : [];
  const planCapital = plan.reduce((x, p) => x + p.capital, 0);
  const planProfit = plan.reduce((x, p) => x + p.profit, 0);
  const moderate = budget ? allocateCapital(budget)[1] : null;

  return (
    <>
      <PageHeader
        title="Find Deals"
        subtitle="Runs every saved and imported product through your criteria (the research pipeline) and explains why each one passed or failed. Results are not ranked."
        actions={<LinkButton href="/scan" variant="secondary">Import more products</LinkButton>}
      />
      <Card>
        <form action="/deals" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Min profit $" name="minProfit"><NumberInput name="minProfit" defaultValue={filters.minProfit} /></Field>
          <Field label="Min ROI %" name="minRoi"><NumberInput name="minRoi" defaultValue={filters.minRoiPct} /></Field>
          <Field label="Min margin %" name="minMargin"><NumberInput name="minMargin" defaultValue={filters.minMarginPct} /></Field>
          <Field label="Max buy $" name="maxBuy"><NumberInput name="maxBuy" defaultValue={filters.maxPurchasePrice} placeholder="Any" /></Field>
          <Field label="Max sellers" name="maxSellers"><NumberInput name="maxSellers" defaultValue={filters.maxSellerCount} placeholder="Any" /></Field>
          <Field label="Max sales rank" name="maxRank"><NumberInput name="maxRank" defaultValue={filters.maxSalesRank} placeholder="Any" /></Field>
          <Field label="Min your sales/mo" name="minSales"><NumberInput name="minSales" defaultValue={filters.minMonthlySalesLow} placeholder="Any" /></Field>
          <Field label="Max inventory days" name="maxDays"><NumberInput name="maxDays" defaultValue={filters.maxInventoryDays} placeholder="Any" /></Field>
          <Field label="Max capital/product $" name="maxCapital"><NumberInput name="maxCapital" defaultValue={filters.maxCapitalPerProduct} placeholder="Any" /></Field>
          <Field label="Max risk" name="maxRisk">
            <select id="maxRisk" name="maxRisk" className="input" defaultValue={filters.maxRiskLevel ?? ""}>
              <option value="">Any</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </Field>
          <Field label="Sourcing" name="sourceType">
            <select id="sourceType" name="sourceType" className="input" defaultValue={sourceType ?? ""}>
              <option value="">Any</option>
              <option value="retail">Retail arbitrage</option>
              <option value="online">Online arbitrage</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </Field>
          <Field label="My budget $" name="budget"><NumberInput name="budget" defaultValue={budget} placeholder="From settings" /></Field>
          <input type="hidden" name="scope" value={scope ?? ""} />
          <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-6">
            <button className="btn" type="submit">Find deals</button>
            <Link className="btn btn-secondary" href="/deals">Reset to settings</Link>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {QUICK.map((q) => (
            <Link key={q.q} href={`/deals?${q.q}`} className="rounded-full border border-border px-3 py-1 hover:border-accent">
              {q.label}
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Always applied from Settings: {[filters.excludeRestricted && "exclude restricted/unverified", filters.excludeFragile && "exclude fragile", filters.excludeExpiring && "exclude expiring", filters.excludeHazmat && "exclude hazmat", filters.excludedCategories?.length && `exclude ${filters.excludedCategories.join(", ")}`, filters.allowedCategories?.length && `only ${filters.allowedCategories.join(", ")}`].filter(Boolean).join("; ") || "none"}.
        </p>
      </Card>

      {results.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="No products to search yet" action={<LinkButton href="/scan">Scan a spreadsheet</LinkButton>}>
            Find Deals searches the products you&apos;ve analyzed or imported. It doesn&apos;t invent products, and it doesn&apos;t scrape websites.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <Card title={`Opportunities that pass (${pass.length})`}>
            {pass.length === 0 ? (
              <p className="text-sm text-muted">No products meet every criterion with the data available.</p>
            ) : (
              <TableWrap>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Source</th>
                      <th className="r">Buy</th>
                      <th className="r">Sell</th>
                      <th className="r">Profit (est.)</th>
                      <th className="r">ROI (est.)</th>
                      <th>Sales (est./mo)</th>
                      <th>Risk</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pass.map(({ rec, analysis: a }) => (
                      <tr key={rec.id}>
                        <td className="min-w-40">
                          <Link className="font-medium text-accent hover:underline" href={`/products/${rec.id}`}>{rec.data.name || "(unnamed)"}</Link>
                          <div className="text-xs text-muted">{[rec.data.brand, rec.data.asin].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="text-xs">
                          {rec.data.sourceUrl ? (
                            <a className="text-accent underline" href={rec.data.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{rec.data.sourceName ?? "Link"}</a>
                          ) : (
                            rec.data.sourceName ?? "Unknown"
                          )}
                          <div className="text-muted">{rec.data.prov.purchasePrice?.checkedAt?.slice(0, 10) ?? "no timestamp"}</div>
                        </td>
                        <td className="r">{fmtUSD(rec.data.purchasePrice)}</td>
                        <td className="r">{fmtUSD(rec.data.salePrice)}</td>
                        <td className="r">{fmtUSD(a.unit?.profit)}</td>
                        <td className="r">{fmtPct(a.unit?.roiPct, 1)}</td>
                        <td>{a.velocity.sufficient ? `${a.velocity.monthly.low.toFixed(1)}–${a.velocity.monthly.high.toFixed(1)}` : "Unknown"}</td>
                        <td><Pill tone={riskTone(a.overallRisk)}>{a.overallRisk}</Pill></td>
                        <td className="text-xs">{a.confidence.level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          {budget && pass.length > 0 && (
            <Card title={`Purchase list for a $${budget.toLocaleString()} budget (test quantities)`}>
              <TableWrap>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="r">Test qty</th>
                      <th className="r">Capital</th>
                      <th className="r">Est. profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="r">{p.qty}</td>
                        <td className="r">{fmtUSD(p.capital)}</td>
                        <td className="r">{fmtUSD(p.profit)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="font-semibold">Total</td>
                      <td></td>
                      <td className="r font-semibold">{fmtUSD(planCapital)}</td>
                      <td className="r font-semibold">{fmtUSD(planProfit)}</td>
                    </tr>
                  </tbody>
                </table>
              </TableWrap>
              <p className="mt-3 text-sm">
                Cash left after these test buys: <strong>{fmtUSD(budget - planCapital)}</strong>.
                {moderate && ` A moderate plan keeps about ${fmtUSD(moderate.amounts.reserve)} in reserve and ${fmtUSD(moderate.amounts.operating)} for operating costs.`}
              </p>
              {moderate && planCapital > moderate.amounts.inventory + moderate.amounts.shippingAndPrep && (
                <div className="mt-2">
                  <Notice tone="warn">
                    These test buys use more than a moderate inventory allocation. Consider fewer products so you keep a reserve for returns, fees, and price drops.
                  </Notice>
                </div>
              )}
              <p className="mt-2 text-xs text-muted">Profit assumes every unit sells at the expected price, which isn&apos;t guaranteed.</p>
            </Card>
          )}

          <Card title={`Need more data (${needs.length})`}>
            {needs.length === 0 ? (
              <p className="text-sm text-muted">None.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {needs.map(({ rec, outcome }) => (
                  <li key={rec.id}>
                    <Link className="font-medium text-accent hover:underline" href={`/products/${rec.id}/edit`}>{rec.data.name || "(unnamed)"}</Link>
                    <span className="text-muted">: {outcome.results.filter((x) => x.status === "UNKNOWN").map((x) => x.reason).join("; ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Did not pass (${fail.length})`}>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Show products and reasons</summary>
              <ul className="mt-3 space-y-3 text-sm">
                {fail.map(({ rec, outcome }) => (
                  <li key={rec.id}>
                    <Link className="font-medium text-accent hover:underline" href={`/products/${rec.id}`}>{rec.data.name || "(unnamed)"}</Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {outcome.results.map((x) => (
                        <span key={x.criterion} title={x.reason}>
                          <Pill tone={statusTone(x.status)}>{x.criterion}: {x.reason}</Pill>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        </div>
      )}
      <div className="mt-6">
        <Disclaimer />
      </div>
    </>
  );
}
