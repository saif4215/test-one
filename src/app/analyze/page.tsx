import { connection } from "next/server";
import { ProductForm } from "@/components/ProductForm";
import { Card, KindBadge, Notice, PageHeader, TableWrap } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { EMPTY_PRODUCT } from "@/lib/domain/product";
import { fmtDateTime, fmtUSD } from "@/lib/format";
import { gatherProduct } from "@/lib/providers";

export default async function AnalyzePage({ searchParams }: PageProps<"/analyze">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const db = getDb();
  const gathered = q ? await gatherProduct(db, q) : null;

  return (
    <>
      <PageHeader
        title="Analyze Product"
        subtitle="Enter an ASIN, UPC/EAN, product URL, or product name. The app fills in whatever your data sources can confirm. You fill in the rest, and anything left blank shows as Unknown."
      />
      <Card>
        <form className="flex flex-col gap-2 sm:flex-row" action="/analyze">
          <label htmlFor="q" className="sr-only">
            ASIN, UPC, URL, or product name
          </label>
          <input id="q" name="q" defaultValue={q} className="input flex-1" placeholder="B0… · 036000291452 · https://… · product name" />
          <button className="btn" type="submit">
            Look up
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          Or skip the lookup and fill in the form below. Retailer URLs are saved as the source; the app never scrapes them.
        </p>
      </Card>

      {gathered && (
        <div className="mt-4 space-y-2">
          <div className="text-sm">
            Looked up <strong>{gathered.query.type === "empty" ? "nothing" : gathered.query.type.toUpperCase()}</strong>
            {gathered.sourcesUsed.length > 0 ? ` using ${gathered.sourcesUsed.join(", ")}.` : ". No connected source had data for it."}
          </div>
          {gathered.messages.map((m, i) => (
            <Notice key={i} tone={m.startsWith("Live data unavailable") ? "warn" : "info"}>
              {m}
            </Notice>
          ))}
        </div>
      )}

      {gathered && gathered.candidates.length > 0 && (
        <div className="mt-4">
          <Card title="Possible retailer listings (not filled in automatically)">
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Source</th>
                    <th className="r">Listed price</th>
                    <th>Type</th>
                    <th>Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {gathered.candidates.map((c) => (
                    <tr key={c.url}>
                      <td className="max-w-md">
                        <a className="text-accent underline" href={c.url} target="_blank" rel="noopener noreferrer nofollow">
                          {c.title}
                        </a>
                      </td>
                      <td>{c.source}</td>
                      <td className="r">{c.price === null ? "Not listed" : `${fmtUSD(c.price)}${c.currency && c.currency !== "USD" ? ` ${c.currency}` : ""}`}</td>
                      <td>
                        <KindBadge kind="THIRD_PARTY" />
                      </td>
                      <td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(c.checkedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <p className="mt-2 text-xs text-muted">
              Open the listing and confirm it&apos;s the exact product (brand, size, pack count, condition) at the current price, then enter the purchase price and
              source below.
            </p>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <ProductForm key={q} product={gathered?.product ?? EMPTY_PRODUCT} />
      </div>
    </>
  );
}
