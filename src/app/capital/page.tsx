import Link from "next/link";
import { connection } from "next/server";
import { BeginnerHelp } from "@/components/BeginnerHelp";
import { Card, Field, Notice, NumberInput, PageHeader, TableWrap } from "@/components/ui";
import { analyzeAll } from "@/lib/analysis/load";
import { allocateCapital, budgetUnits } from "@/lib/calc/capital";
import { getDb } from "@/lib/db/client";
import { fmtUSD } from "@/lib/format";
import { getSettings } from "@/lib/repo/products";

export default async function CapitalPage({ searchParams }: PageProps<"/capital">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const s = getSettings(db);
  const q = typeof sp.budget === "string" ? Number(sp.budget) : NaN;
  const budget = Number.isFinite(q) && q > 0 ? q : s.startingBudget;
  const scenarios = budget ? allocateCapital(budget) : [];
  const moderate = scenarios[1];
  const products = budget
    ? analyzeAll(db)
        .filter((r) => r.analysis.unit && r.analysis.unit.upfrontCost > 0 && r.rec.status !== "rejected")
        .map((r) => ({ rec: r.rec, a: r.analysis, units: budgetUnits(budget, r.analysis.unit!.upfrontCost, moderate.split.inventory) }))
    : [];

  return (
    <>
      <PageHeader
        title="Capital Planner"
        subtitle="How to split a budget between inventory, shipping and prep, operating costs, and a reserve. It never assumes you'll spend everything on inventory."
      />
      <BeginnerHelp>
        The <strong>reserve</strong> covers returns, fee surprises, price drops, and slow sellers, and lets you act on the next opportunity. New
        resellers usually do better with the conservative split until real sales data builds up.
      </BeginnerHelp>
      <Card>
        <form action="/capital" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Budget ($)" name="budget" className="flex-1">
            <NumberInput name="budget" defaultValue={budget} min={0} placeholder="Set a starting budget" />
          </Field>
          <button className="btn" type="submit">Plan</button>
        </form>
      </Card>
      {!budget ? (
        <div className="mt-5">
          <Notice tone="info">
            Enter a budget above, or set your starting budget in <Link className="underline" href="/settings">Settings</Link>.
          </Notice>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <Card title={`Allocation scenarios for ${fmtUSD(budget)}`}>
              <TableWrap>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th className="r">Inventory</th>
                      <th className="r">Shipping &amp; prep</th>
                      <th className="r">Operating</th>
                      <th className="r">Reserve</th>
                      <th>Assumption</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((sc) => (
                      <tr key={sc.name}>
                        <td className="font-medium">{sc.name}</td>
                        <td className="r">{fmtUSD(sc.amounts.inventory)} <span className="text-xs text-muted">({sc.split.inventory}%)</span></td>
                        <td className="r">{fmtUSD(sc.amounts.shippingAndPrep)} <span className="text-xs text-muted">({sc.split.shippingAndPrep}%)</span></td>
                        <td className="r">{fmtUSD(sc.amounts.operating)} <span className="text-xs text-muted">({sc.split.operating}%)</span></td>
                        <td className="r">{fmtUSD(sc.amounts.reserve)} <span className="text-xs text-muted">({sc.split.reserve}%)</span></td>
                        <td className="text-muted">{sc.assumption}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <p className="mt-2 text-xs text-muted">These are illustrations based on the stated assumptions, not advice. Adjust them to your situation.</p>
            </Card>
          </div>
          <div className="mt-5">
            <Card title="Units per product (moderate inventory allocation)">
              {products.length === 0 ? (
                <p className="text-sm text-muted">Analyze products with purchase and selling prices to see unit counts here.</p>
              ) : (
                <TableWrap>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="r">Upfront / unit</th>
                        <th className="r">Max theoretical units</th>
                        <th className="r">Suggested (keeps a reserve)</th>
                        <th className="r">Suggested test buy</th>
                        <th className="r">Cash left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map(({ rec, a, units }) => (
                        <tr key={rec.id}>
                          <td>
                            <Link className="text-accent hover:underline" href={`/products/${rec.id}`}>{rec.data.name || "(unnamed)"}</Link>
                          </td>
                          <td className="r">{fmtUSD(a.unit!.upfrontCost)}</td>
                          <td className="r">{units.maxTheoreticalUnits}</td>
                          <td className="r">{units.suggestedUnits}</td>
                          <td className="r">{a.testBuy ? a.testBuy.quantity : "—"}</td>
                          <td className="r">{fmtUSD(units.cashRemaining)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
              <p className="mt-2 text-xs text-muted">
                &ldquo;Max theoretical&rdquo; spends the whole budget on one product, which isn&apos;t recommended. For an unfamiliar product, start with the test buy.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
