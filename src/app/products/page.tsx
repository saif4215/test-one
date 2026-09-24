import Link from "next/link";
import { connection } from "next/server";
import { Card, EmptyState, LinkButton, PageHeader, Pill, riskTone, statusTone, TableWrap } from "@/components/ui";
import { analyzeAll } from "@/lib/analysis/load";
import { getDb } from "@/lib/db/client";
import { fmtPct, fmtUSD } from "@/lib/format";
import { PRODUCT_STATUSES, type ProductStatus } from "@/lib/repo/products";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const status = typeof sp.status === "string" && sp.status ? (sp.status as ProductStatus) : undefined;
  const batch = typeof sp.batch === "string" && sp.batch ? sp.batch : undefined;
  const db = getDb();
  let rows = analyzeAll(db, { status, importBatch: batch });
  if (q) {
    rows = rows.filter(({ rec }) =>
      [rec.data.name, rec.data.brand, rec.data.asin, rec.data.upc, rec.data.category, rec.data.sourceName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }

  return (
    <>
      <PageHeader
        title="Find Products"
        subtitle="Every product you've analyzed, imported, or watchlisted, in the order it was updated. Nothing is ranked; use the filters and the Find Deals page to narrow the list."
        actions={
          <>
            <LinkButton href="/analyze">Analyze a product</LinkButton>
            <LinkButton href="/scan" variant="secondary">Import spreadsheet</LinkButton>
          </>
        }
      />
      <Card>
        <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto]" action="/products">
          <input name="q" defaultValue={q} placeholder="Search name, brand, ASIN, UPC, category, source" className="input" aria-label="Search" />
          <select name="status" defaultValue={status ?? ""} className="input" aria-label="Status">
            <option value="">All statuses</option>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button className="btn btn-secondary" type="submit">Filter</button>
        </form>
        {batch && (
          <p className="mt-2 text-sm">
            Showing import batch <strong>{batch}</strong>. <Link className="text-accent underline" href="/products">Show all</Link>
          </p>
        )}
      </Card>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState title="No products yet" action={<LinkButton href="/analyze">Analyze your first product</LinkButton>}>
            Analyze a product, or import a spreadsheet of candidates.
          </EmptyState>
        ) : (
          <Card>
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="r">Cost</th>
                    <th className="r">Sale price</th>
                    <th className="r">Est. fees</th>
                    <th className="r">Profit</th>
                    <th className="r">ROI</th>
                    <th>Competition</th>
                    <th>Risk</th>
                    <th>Filters</th>
                    <th className="r">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ rec, analysis: a }) => (
                    <tr key={rec.id}>
                      <td className="min-w-48">
                        <Link href={`/products/${rec.id}`} className="font-medium text-accent hover:underline">
                          {rec.data.name || "(unnamed)"}
                        </Link>
                        <div className="text-xs text-muted">
                          {[rec.data.brand, rec.data.asin, PRODUCT_STATUSES.find((s) => s.value === rec.status)?.label].filter(Boolean).join(" · ")}
                          {rec.watch && " · ★ watching"}
                        </div>
                      </td>
                      <td className="r">{fmtUSD(rec.data.purchasePrice)}</td>
                      <td className="r">{fmtUSD(rec.data.salePrice)}</td>
                      <td className="r">{fmtUSD(a.unit?.amazonFees)}</td>
                      <td className={`r ${a.unit && a.unit.profit < 0 ? "text-bad" : ""}`}>{fmtUSD(a.unit?.profit)}</td>
                      <td className="r">{fmtPct(a.unit?.roiPct, 1)}</td>
                      <td>{rec.data.sellerCount !== null ? `${rec.data.sellerCount} sellers` : "Unknown"}</td>
                      <td>
                        <Pill tone={riskTone(a.overallRisk)}>{a.overallRisk}</Pill>
                      </td>
                      <td>
                        <Pill tone={statusTone(a.filter.status)}>{a.filter.status}</Pill>
                      </td>
                      <td className="r">{a.missing.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        )}
      </div>
    </>
  );
}
