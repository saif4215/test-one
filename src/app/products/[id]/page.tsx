import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  addPriceObservationAction,
  deletePriceObservationAction,
  deleteProductAction,
  logResearchAction,
  setStatusAction,
  toggleWatchAction,
} from "@/app/actions/products";
import { DealReport } from "@/components/DealReport";
import { PriceChart } from "@/components/PriceChart";
import { Card, Field, LinkButton, NumberInput, PageHeader, TableWrap, TextInput } from "@/components/ui";
import { loadAnalysis } from "@/lib/analysis/load";
import { getDb } from "@/lib/db/client";
import { fmtDateTime, fmtNum, fmtUSD } from "@/lib/format";
import { getSettings, listPriceObservations, listResearchLog, PRODUCT_STATUSES } from "@/lib/repo/products";
import { BeginnerHelp } from "@/components/BeginnerHelp";

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  await connection();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const loaded = loadAnalysis(db, id);
  if (!loaded) notFound();
  const { rec, analysis } = loaded;
  const settings = getSettings(db);
  const amazonObs = listPriceObservations(db, id, "amazon");
  const sourceObs = listPriceObservations(db, id, "source");
  const log = listResearchLog(db, id).slice(0, 10);

  return (
    <>
      <PageHeader
        title={rec.data.name || "(unnamed product)"}
        subtitle={[rec.data.brand, rec.data.asin && `ASIN ${rec.data.asin}`, rec.data.category].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <LinkButton href={`/products/${id}/edit`}>Edit data</LinkButton>
            <LinkButton href={`/match?product=${id}`} variant="secondary">Check match</LinkButton>
            <LinkButton href={`/products/${id}/report`} variant="secondary">Deal report</LinkButton>
            <a className="btn btn-secondary" href={`/products/${id}/report.md`}>Download .md</a>
            <form action={toggleWatchAction.bind(null, id, !rec.watch)}>
              <button className="btn btn-secondary" type="submit">{rec.watch ? "★ Watching" : "☆ Watch"}</button>
            </form>
          </>
        }
      />

      <BeginnerHelp>
        <strong>Profit</strong> is what&apos;s left after every cost. <strong>ROI</strong> compares that profit to the money you pay upfront.{" "}
        <strong>Break-even</strong> is the lowest price at which you don&apos;t lose money. Values tagged <em>Estimate</em> or <em>Assumption</em> haven&apos;t
        been confirmed, so check them before you buy. <em>Unknown</em> means the data is missing, not zero.
      </BeginnerHelp>
      <Card className="no-print mb-5">
        <form action={setStatusAction.bind(null, id)} className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <Field label="Research status" name="status">
            <select id="status" name="status" defaultValue={rec.status} className="input">
              {PRODUCT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Note (saved to research log)" name="notes">
            <TextInput name="notes" placeholder="Why this decision?" />
          </Field>
          <button className="btn btn-secondary" type="submit">Update status</button>
        </form>
        {rec.status === "buying" || rec.status === "test_buy" ? (
          <p className="mt-3 text-sm">
            Ready to order? <Link className="text-accent underline" href={`/purchase-orders/new?product=${id}`}>Create a purchase order</Link>.
          </p>
        ) : null}
      </Card>

      <DealReport a={analysis} advanced={settings.mode === "advanced"} />

      <div className="mt-5" id="price-history">
        <Card title="Amazon selling price history">
          <PriceChart points={amazonObs.map((o) => ({ at: o.at, price: o.price, sellerCount: o.sellerCount }))} avg90={analysis.priceHistory.avg90} />
        </Card>
      </div>

      <div className="no-print mt-6 grid gap-5 lg:grid-cols-2">
        <Card title="Record a price observation">
          <form action={addPriceObservationAction.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
            <Field label="Price ($)" name="price"><NumberInput name="price" min={0} /></Field>
            <Field label="Side" name="side">
              <select id="side" name="side" className="input">
                <option value="amazon">Amazon selling price</option>
                <option value="source">Supplier purchase price</option>
              </select>
            </Field>
            <Field label="Seller count" name="sellerCount"><NumberInput name="sellerCount" step="1" /></Field>
            <Field label="Sales rank" name="salesRank"><NumberInput name="salesRank" step="1" /></Field>
            <Field label="Observed at" name="at"><input id="at" name="at" type="datetime-local" className="input" /></Field>
            <Field label="Source" name="source"><TextInput name="source" placeholder="e.g. listing page" /></Field>
            <div className="sm:col-span-2">
              <button className="btn btn-secondary" type="submit">Add observation</button>
            </div>
          </form>
        </Card>
        <Card title="Observations">
          {amazonObs.length + sourceObs.length === 0 ? (
            <p className="text-sm text-muted">None yet.</p>
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Side</th>
                    <th className="r">Price</th>
                    <th className="r">Sellers</th>
                    <th>Source</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...amazonObs, ...sourceObs]
                    .sort((x, y) => y.at.localeCompare(x.at))
                    .map((o) => (
                      <tr key={o.id}>
                        <td className="whitespace-nowrap">{fmtDateTime(o.at)}</td>
                        <td>{o.side === "amazon" ? "Amazon" : "Supplier"}</td>
                        <td className="r">{fmtUSD(o.price)}</td>
                        <td className="r">{o.sellerCount ?? "—"}</td>
                        <td className="text-muted">{o.source ?? "—"}</td>
                        <td>
                          <form action={deletePriceObservationAction.bind(null, id, o.id)}>
                            <button className="btn btn-danger btn-sm" type="submit" aria-label="Delete observation">×</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="no-print mt-5">
        <Card
          title="Research log"
          actions={
            <form action={logResearchAction.bind(null, id)} className="flex gap-2">
              <input type="hidden" name="status" value="snapshot" />
              <button className="btn btn-secondary btn-sm" type="submit">Save snapshot</button>
            </form>
          }
        >
          {log.length === 0 ? (
            <p className="text-sm text-muted">No entries.</p>
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Status</th>
                    <th className="r">Profit</th>
                    <th className="r">ROI</th>
                    <th>Confidence</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((l) => {
                    const s = l.summary as { profit: number | null; roiPct: number | null; confidence: string };
                    return (
                      <tr key={l.id}>
                        <td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                        <td>{l.status}</td>
                        <td className="r">{fmtUSD(s.profit)}</td>
                        <td className="r">{s.roiPct === null ? "Unknown" : `${fmtNum(s.roiPct, 1)}%`}</td>
                        <td>{s.confidence}</td>
                        <td className="text-muted">{l.notes ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="no-print mt-8 flex justify-end">
        <form action={deleteProductAction.bind(null, id)}>
          <button className="btn btn-danger" type="submit">Delete product</button>
        </form>
      </div>
    </>
  );
}
