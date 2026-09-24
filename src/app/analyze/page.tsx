import { connection } from "next/server";
import { ProductForm } from "@/components/ProductForm";
import { Card, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { EMPTY_PRODUCT } from "@/lib/domain/product";
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

      <div className="mt-6">
        <ProductForm key={q} product={gathered?.product ?? EMPTY_PRODUCT} />
      </div>
    </>
  );
}
