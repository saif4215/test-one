import { connection } from "next/server";
import { ProductPicker } from "@/components/ProductPicker";
import { Card, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { getProduct, listProducts } from "@/lib/repo/products";
import { Writer } from "./Writer";

export default async function ListingWriterPage({ searchParams }: PageProps<"/listing-writer">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const id = typeof sp.product === "string" ? Number(sp.product) : NaN;
  const rec = Number.isInteger(id) ? getProduct(db, id) : null;
  const l = rec?.data.listing;
  return (
    <>
      <PageHeader
        title="Listing Writer"
        subtitle="Creates an original title, five bullets, a description, and backend search terms from details you enter. It adds no facts of its own, and claims that need proof (medical, guarantees, certifications, awards, 'best') are left out and flagged."
      />
      <Card className="mb-5">
        <ProductPicker action="/listing-writer" products={listProducts(db)} selected={rec?.id} label="Pre-fill from a product (optional)" />
      </Card>
      <Writer
        key={rec?.id ?? "blank"}
        initial={{
          brand: rec?.data.brand ?? "",
          productName: rec?.data.name ?? "",
          size: l?.size ?? "",
          color: l?.color ?? "",
          packCount: l?.packCount ? String(l.packCount) : "",
          keywords: l?.searchTerms ?? "",
        }}
      />
      <p className="mt-4 text-xs text-muted">
        Only create or edit listings you&apos;re allowed to (for example, your own brand or a new product you have the rights to). When you resell an existing
        product, use the listing that already exists.
      </p>
    </>
  );
}
