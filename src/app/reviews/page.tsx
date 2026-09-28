import { connection } from "next/server";
import { ProductPicker } from "@/components/ProductPicker";
import { Card, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { getProduct, listProducts } from "@/lib/repo/products";
import { ReviewTool } from "./ReviewTool";

export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const id = typeof sp.product === "string" ? Number(sp.product) : NaN;
  const rec = Number.isInteger(id) ? getProduct(db, id) : null;
  return (
    <>
      <PageHeader
        title="Review Analysis"
        subtitle="Paste customer reviews to find common complaints (defects, packaging, size, quality, missing parts, instructions, shipping) and compliments. Use it to judge return risk and product selection. It never writes, edits, or asks for reviews."
      />
      <Card className="mb-5">
        <ProductPicker action="/reviews" products={listProducts(db)} selected={rec?.id} label="Pre-fill complaints saved in Listing Research (optional)" />
      </Card>
      <ReviewTool key={rec?.id ?? "blank"} initial={rec?.data.listing?.complaints ?? ""} />
    </>
  );
}
