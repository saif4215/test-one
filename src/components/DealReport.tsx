import type { DealAnalysis } from "@/lib/analysis/analyzeProduct";
import { fmtDateTime, fmtNum, fmtPct, fmtRange, fmtUSD } from "@/lib/format";
import {
  Card,
  confidenceTone,
  Disclaimer,
  KindBadge,
  Notice,
  Pill,
  riskTone,
  Stat,
  statusTone,
  TableWrap,
} from "./ui";

function fmtValue(v: number | null, format: "usd" | "number" | "pct") {
  return format === "usd" ? fmtUSD(v) : format === "pct" ? fmtPct(v) : fmtNum(v);
}

function List({ items, empty }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty ?? "None."}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function DealReport({ a, advanced = false }: { a: DealAnalysis; advanced?: boolean }) {
  const p = a.product;
  const u = a.unit;
  const upfront = a.costLines.filter((l) => l.group === "upfront");
  const deducted = a.costLines.filter((l) => l.group === "deducted");
  return (
    <div className="space-y-5">
      <Notice tone={a.liveDataNote.startsWith("Live data used") ? "good" : "warn"}>{a.liveDataNote}</Notice>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Est. profit / unit" value={fmtUSD(u?.profit)} tone={u ? (u.profit > 0 ? "good" : "bad") : undefined} hint="Estimate" />
        <Stat label="ROI" value={fmtPct(u?.roiPct)} hint="Profit ÷ upfront investment" />
        <Stat label="Margin" value={fmtPct(u?.marginPct)} hint="Profit ÷ selling price" />
        <Stat label="Break-even price" value={fmtUSD(a.breakEvenPrice)} hint="Profit = $0" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Data confidence:</span>
        <Pill tone={confidenceTone(a.confidence.level)}>{a.confidence.level}</Pill>
        <span className="text-muted">Overall risk:</span>
        <Pill tone={riskTone(a.overallRisk)}>{a.overallRisk}</Pill>
        <span className="text-muted">Your filters:</span>
        <Pill tone={statusTone(a.filter.status)}>{a.filter.status}</Pill>
      </div>
      <p className="text-sm text-muted">{a.confidence.reason}</p>
      {a.unknownCosts.length > 0 && u && (
        <Notice tone="warn" title="Incomplete costs:">
          Profit excludes unknown costs ({a.unknownCosts.join(", ")}), so actual profit will be lower. Add the missing data to complete it.
        </Notice>
      )}

      <Card title="1. Product summary">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Product", p.name || "Unknown"],
            ["Brand", p.brand ?? "Unknown"],
            ["ASIN", p.asin ?? "Unknown"],
            ["UPC/EAN", p.upc ?? "Unknown"],
            ["Category", p.category ?? "Unknown"],
            ["Condition", p.condition],
            ["Fulfillment", p.fulfillment],
            ["Source", p.sourceName ?? "Unknown"],
            ["Quantity", p.quantity !== null ? fmtNum(p.quantity) : "Unknown"],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
          {p.sourceUrl && (
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <dt className="w-28 shrink-0 text-muted">Source URL</dt>
              <dd className="min-w-0 break-all">
                <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline">
                  {p.sourceUrl}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="Data points and sources">
        <TableWrap>
          <table className="data">
            <thead>
              <tr>
                <th>Data point</th>
                <th className="r">Value</th>
                <th>Type</th>
                <th>Source</th>
                <th>Checked</th>
              </tr>
            </thead>
            <tbody>
              {a.dataPoints.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  <td className="r">{fmtValue(d.value, d.format)}</td>
                  <td>
                    <KindBadge kind={d.kind} />
                  </td>
                  <td className="text-muted">
                    {d.value === null ? d.note : d.source ?? "—"}
                    {d.stale && <span className="ml-1 font-semibold text-warn">Data may be stale.</span>}
                  </td>
                  <td className="whitespace-nowrap text-muted">{d.checkedAt ? fmtDateTime(d.checkedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="2–9. Financial analysis (per unit)">
        <TableWrap>
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th className="r">Amount</th>
                <th>Type</th>
                <th>Source / note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-semibold">Selling price</td>
                <td className="r font-semibold">{fmtUSD(p.salePrice)}</td>
                <td>
                  <KindBadge kind={p.salePrice === null ? "UNKNOWN" : p.prov.salePrice?.kind ?? "USER_PROVIDED"} />
                </td>
                <td className="text-muted">{p.prov.salePrice?.source ?? (p.salePrice === null ? "Data unavailable — verify before purchasing." : "Entered by user")}</td>
              </tr>
              <tr>
                <td colSpan={4} className="bg-surface-2 text-xs font-semibold uppercase text-muted">
                  Upfront costs (your investment)
                </td>
              </tr>
              {upfront.map((l) => (
                <tr key={l.key}>
                  <td>{l.label}</td>
                  <td className="r">{fmtUSD(l.value)}</td>
                  <td>
                    <KindBadge kind={l.kind} />
                  </td>
                  <td className="text-muted">{[l.source, l.note].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="bg-surface-2 text-xs font-semibold uppercase text-muted">
                  Costs deducted from the sale
                </td>
              </tr>
              {deducted.map((l) => (
                <tr key={l.key}>
                  <td>{l.label}</td>
                  <td className="r">{fmtUSD(l.value)}</td>
                  <td>
                    <KindBadge kind={l.kind} />
                  </td>
                  <td className="text-muted">{[l.source, l.note].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {u ? (
          <div className="mt-4 space-y-1 rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed sm:text-sm">
            <div>Total cost = {fmtUSD(u.upfrontCost)} upfront + {fmtUSD(u.deductedCost)} deducted = {fmtUSD(u.totalCost)}</div>
            <div>
              Estimated profit = {fmtUSD(u.salePrice)} − {fmtUSD(u.totalCost)} = <strong>{fmtUSD(u.profit)}</strong>
            </div>
            <div>
              ROI = {fmtUSD(u.profit)} ÷ {fmtUSD(u.upfrontCost)} × 100 = <strong>{fmtPct(u.roiPct)}</strong>
            </div>
            <div>
              Margin = {fmtUSD(u.profit)} ÷ {fmtUSD(u.salePrice)} × 100 = <strong>{fmtPct(u.marginPct)}</strong>
            </div>
            <div>Amazon fees (referral + closing + fulfillment + storage) = {fmtUSD(u.amazonFees)}</div>
          </div>
        ) : (
          <Notice tone="warn">Purchase price and selling price are both needed to calculate profit. Data unavailable — verify before purchasing.</Notice>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Break-even selling price" value={fmtUSD(a.breakEvenPrice)} hint="Lowest price with profit ≥ $0" />
          <Stat label="Maximum buy price" value={fmtUSD(a.maxBuyCost)} hint="Highest price (before tax) that still meets your profit and ROI targets" />
          <Stat label="Min. profitable selling price" value={fmtUSD(a.minProfitablePrice)} hint="Lowest selling price that still meets your profit and ROI targets" />
        </div>
        {a.batch && (
          <p className="mt-3 text-sm">
            For {fmtNum(a.batch.quantity)} units: total investment {fmtUSD(a.batch.totalInvestment)}, expected revenue {fmtUSD(a.batch.expectedRevenue)},
            estimated total profit <strong>{fmtUSD(a.batch.totalProfit)}</strong> (ROI {fmtPct(a.batch.roiPct)}), if every unit sells at the expected price.
          </p>
        )}
      </Card>

      <Card title="FBA vs FBM">
        <TableWrap>
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th className="r">FBA</th>
                <th className="r">FBM</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Fulfillment / shipping", (x: NonNullable<typeof u>) => fmtUSD(x.fulfillmentFee)],
                  ["Storage", (x: NonNullable<typeof u>) => fmtUSD(x.storage)],
                  ["Upfront cost", (x: NonNullable<typeof u>) => fmtUSD(x.upfrontCost)],
                  ["Est. profit", (x: NonNullable<typeof u>) => fmtUSD(x.profit)],
                  ["ROI", (x: NonNullable<typeof u>) => fmtPct(x.roiPct)],
                ] as const
              ).map(([label, fn]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="r">{a.fulfillment.fba ? fn(a.fulfillment.fba) : "Unknown"}</td>
                  <td className="r">{a.fulfillment.fbm ? fn(a.fulfillment.fbm) : "Unknown"}</td>
                </tr>
              ))}
              <tr>
                <td className="text-muted">Completeness</td>
                <td className="text-right text-xs text-muted">{a.fulfillment.fbaNote}</td>
                <td className="text-right text-xs text-muted">{a.fulfillment.fbmNote}</td>
              </tr>
            </tbody>
          </table>
        </TableWrap>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">Tradeoffs to consider</summary>
          <TableWrap>
            <table className="data mt-2">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>FBA</th>
                  <th>FBM</th>
                </tr>
              </thead>
              <tbody>
                {a.fulfillment.tradeoffs.map((t) => (
                  <tr key={t.factor}>
                    <td>{t.factor}</td>
                    <td>{t.fba}</td>
                    <td>{t.fbm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-2 text-xs text-muted">Neither method is always better; it depends on the product and how you operate.</p>
        </details>
      </Card>

      {a.scenarios.length > 0 && (
        <Card title="Scenario analysis">
          <TableWrap>
            <table className="data">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="r">Price</th>
                  <th className="r">Fees</th>
                  <th className="r">Total cost</th>
                  <th className="r">Profit</th>
                  <th className="r">ROI</th>
                  <th>What changed</th>
                </tr>
              </thead>
              <tbody>
                {a.scenarios.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="r">{fmtUSD(s.price)}</td>
                    <td className="r">{fmtUSD(s.economics.amazonFees)}</td>
                    <td className="r">{fmtUSD(s.economics.totalCost)}</td>
                    <td className={`r ${s.economics.profit < 0 ? "text-bad" : ""}`}>{fmtUSD(s.economics.profit)}</td>
                    <td className="r">{fmtPct(s.economics.roiPct)}</td>
                    <td className="text-muted">{s.assumption}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-2 text-xs text-muted">No scenario is guaranteed. The high-price scenario appears only when historical data supports it.</p>
        </Card>
      )}

      {a.sensitivity.length > 0 && (
        <Card title="Sensitivity analysis">
          <details open={advanced}>
            <summary className="cursor-pointer text-sm font-medium">How sensitive is this deal to changes?</summary>
            <TableWrap>
              <table className="data mt-2">
                <thead>
                  <tr>
                    <th>Change</th>
                    <th className="r">Profit / unit</th>
                    <th className="r">vs. base</th>
                    <th className="r">ROI</th>
                    <th className="r">Margin</th>
                    <th className="r">Est. monthly profit</th>
                  </tr>
                </thead>
                <tbody>
                  {a.sensitivity.map((r) => (
                    <tr key={r.change}>
                      <td>{r.change}</td>
                      <td className={`r ${r.profit < 0 ? "text-bad" : ""}`}>{fmtUSD(r.profit)}</td>
                      <td className={`r ${r.profitDelta < 0 ? "text-bad" : r.profitDelta > 0 ? "text-good" : ""}`}>
                        {r.profitDelta === 0 ? "—" : `${r.profitDelta > 0 ? "+" : ""}${fmtUSD(r.profitDelta)}`}
                      </td>
                      <td className="r">{fmtPct(r.roiPct)}</td>
                      <td className="r">{fmtPct(r.marginPct)}</td>
                      <td className="r">{r.monthlyProfit === null ? "Unknown" : fmtUSD(r.monthlyProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <p className="mt-2 text-xs text-muted">
              Monthly profit uses the low end of your estimated sales; it shows Unknown when there&apos;s no sales data.
            </p>
          </details>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="10–11. Competition and demand">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Seller count</dt>
              <dd>{p.sellerCount !== null ? `${p.sellerCount}${p.fbaSellerCount !== null ? ` (${p.fbaSellerCount} FBA)` : ""}` : "Unknown"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Amazon on listing</dt>
              <dd>{p.amazonOnListing === null ? "Unknown" : p.amazonOnListing ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Sales rank</dt>
              <dd>{p.salesRank !== null ? `#${fmtNum(p.salesRank)} (an indicator, not unit sales)` : "Unknown"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Buy Box</dt>
              <dd>Not guaranteed</dd>
            </div>
          </dl>
          <h3 className="mt-4 text-sm font-semibold">Estimated sales velocity (your units)</h3>
          {a.velocity.sufficient ? (
            <>
              <TableWrap>
                <table className="data mt-2">
                  <tbody>
                    <tr><td>Daily (estimate)</td><td className="r">{fmtRange(a.velocity.daily.low, a.velocity.daily.high, 2)}</td></tr>
                    <tr><td>Weekly (estimate)</td><td className="r">{fmtRange(a.velocity.weekly.low, a.velocity.weekly.high, 1)}</td></tr>
                    <tr><td>Monthly (estimate)</td><td className="r">{fmtRange(a.velocity.monthly.low, a.velocity.monthly.high, 1)}</td></tr>
                    <tr><td>Next 90 days (estimate)</td><td className="r">{fmtRange(a.velocity.next90Days.low, a.velocity.next90Days.high, 0)}</td></tr>
                    {a.velocity.inventoryDurationDays && (
                      <tr>
                        <td>Days to sell {fmtNum(p.quantity)} units (estimate)</td>
                        <td className="r">{fmtRange(a.velocity.inventoryDurationDays.low, a.velocity.inventoryDurationDays.high, 0, "days")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableWrap>
              <p className="mt-2 text-xs text-muted">{a.velocity.assumptions.join(" ")}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-warn">{a.velocity.message}</p>
          )}
        </Card>

        <Card title="Price history">
          {a.priceHistory.observations === 0 ? (
            <p className="text-sm text-muted">No price history recorded. Add observations below the report to track this product over time.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ["Current", fmtUSD(a.priceHistory.current)],
                  ["30-day avg", fmtUSD(a.priceHistory.avg30)],
                  ["60-day avg", fmtUSD(a.priceHistory.avg60)],
                  ["90-day avg", fmtUSD(a.priceHistory.avg90)],
                  ["Lowest", fmtUSD(a.priceHistory.lowest)],
                  ["Highest", fmtUSD(a.priceHistory.highest)],
                  ["Volatility", a.priceHistory.volatilityPct === null ? "Unknown" : `${fmtPct(a.priceHistory.volatilityPct, 1)} (${a.priceHistory.volatilityLevel})`],
                  ["Observations", fmtNum(a.priceHistory.observations)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="num">{v}</dd>
                  </div>
                ))}
              </dl>
              {a.priceHistory.warnings.length > 0 && (
                <div className="mt-3 space-y-2">
                  {a.priceHistory.warnings.map((w) => (
                    <Notice key={w} tone="warn">{w}</Notice>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-muted">Past prices don&apos;t predict future prices.</p>
            </>
          )}
        </Card>
      </div>

      <Card title="12. Risk analysis">
        <TableWrap>
          <table className="data">
            <thead>
              <tr>
                <th>Risk</th>
                <th>Level</th>
                <th>Why it matters</th>
                <th>Verify</th>
                <th>Reduce exposure</th>
              </tr>
            </thead>
            <tbody>
              {a.risks.map((r) => (
                <tr key={r.category}>
                  <td className="font-medium">{r.category}</td>
                  <td>
                    <Pill tone={riskTone(r.level)}>{r.level}</Pill>
                  </td>
                  <td>{r.why}</td>
                  <td className="text-muted">{r.verify}</td>
                  <td className="text-muted">{r.mitigation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="Deal filters">
        <TableWrap>
          <table className="data">
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Result</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {a.filter.results.map((r) => (
                <tr key={r.criterion}>
                  <td>{r.criterion}</td>
                  <td>
                    <Pill tone={statusTone(r.status)}>{r.status}</Pill>
                  </td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What makes this potentially attractive">
          <List items={a.attractive} empty="Nothing stands out yet with the available data." />
        </Card>
        <Card title="What could make it unprofitable">
          <List items={a.unprofitableIf} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="15. Suggested test quantity">
          {a.testBuy ? (
            <>
              <p className="text-lg font-semibold">
                {a.testBuy.quantity} units <span className="text-sm font-normal text-muted">({fmtUSD(a.testBuy.investment)} upfront)</span>
              </p>
              <List items={a.testBuy.reasons} />
            </>
          ) : (
            <p className="text-sm text-muted">{a.testBuyNote}</p>
          )}
        </Card>
        <Card title="16. Scaling considerations">
          {a.scaling ? (
            <>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted">Initial order</dt>
                <dd className="num text-right">{a.scaling.initialOrder} units</dd>
                <dt className="text-muted">Safety stock</dt>
                <dd className="num text-right">{a.scaling.safetyStock} units</dd>
                <dt className="text-muted">Reorder point</dt>
                <dd className="num text-right">{a.scaling.reorderPoint} units</dd>
                <dt className="text-muted">Max inventory target</dt>
                <dd className="num text-right">{a.scaling.maxInventoryTarget} units</dd>
                <dt className="text-muted">Expected monthly purchases</dt>
                <dd className="num text-right">{fmtUSD(a.scaling.expectedMonthlyPurchases)}</dd>
              </dl>
              <List items={a.scaling.notes} />
            </>
          ) : (
            <p className="text-sm text-muted">
              Scaling needs reliable sales data and a budget. Only scale after a test buy shows acceptable results with real sales.
            </p>
          )}
        </Card>
      </div>

      <Card title="Assumptions">
        <List items={a.assumptions} />
      </Card>
      <Card title="13. Missing information">
        <List items={a.missing.map((m) => `${m}: Data unavailable — verify before purchasing.`)} empty="No key data missing." />
      </Card>
      <Card title="14. Verify before buying">
        <ul className="space-y-1 text-sm">
          {a.verify.map((v) => (
            <li key={v} className="flex gap-2">
              <span aria-hidden>☐</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-muted">Analysis generated {fmtDateTime(a.generatedAt)}.</p>
      <Disclaimer />
    </div>
  );
}
