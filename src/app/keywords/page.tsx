import { connection } from "next/server";
import { ProductPicker } from "@/components/ProductPicker";
import { Card, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { getProduct, listProducts } from "@/lib/repo/products";
import { KeywordTool } from "./KeywordTool";

export default async function KeywordsPage({ searchParams }: PageProps<"/keywords">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const id = typeof sp.product === "string" ? Number(sp.product) : NaN;
  const rec = Number.isInteger(id) ? getProduct(db, id) : null;
  return (
    <>
      <PageHeader
        title="Keyword Research"
        subtitle="Paste your title, competitor titles, and search terms you've seen. The tool finds shared phrases and sorts them by intent. It works only from the text you paste; it isn't search-volume data."
      />
      <Card className="mb-5">
        <ProductPicker action="/keywords" products={listProducts(db)} selected={rec?.id} label="Pre-fill from a product (optional)" />
      </Card>
      <KeywordTool
        key={rec?.id ?? "blank"}
        initialTitle={rec?.data.listing?.title || rec?.data.name || ""}
        initialTerms={rec?.data.listing?.searchTerms ?? ""}
        brand={rec?.data.brand ?? ""}
      />
    </>
  );
}
