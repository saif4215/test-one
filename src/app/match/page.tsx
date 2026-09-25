import Link from "next/link";
import { connection } from "next/server";
import { saveMatchVerdictAction } from "@/app/actions/products";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { getProduct } from "@/lib/repo/products";
import { Matcher } from "./Matcher";

export default async function MatchPage({ searchParams }: PageProps<"/match">) {
  await connection();
  const sp = await searchParams;
  const id = typeof sp.product === "string" ? Number(sp.product) : NaN;
  const rec = Number.isInteger(id) ? getProduct(getDb(), id) : null;
  return (
    <>
      <PageHeader
        title="Product Matching"
        subtitle="Checks whether a supplier item is the same product as an Amazon listing. A MATCH needs a matching UPC/EAN, brand, and pack count with no conflicts. Similar titles are never enough on their own."
      />
      {rec && (
        <p className="mb-4 text-sm">
          The Amazon side is pre-filled from <Link className="text-accent underline" href={`/products/${rec.id}`}>{rec.data.name}</Link>. Check it
          against the live listing.
        </p>
      )}
      <Matcher
        key={rec?.id ?? "blank"}
        productId={rec?.id}
        saveAction={rec ? saveMatchVerdictAction.bind(null, rec.id) : undefined}
        initialAmazon={
          rec
            ? { title: rec.data.name, brand: rec.data.brand ?? "", gtin: rec.data.upc ?? "", condition: rec.data.condition }
            : undefined
        }
      />
    </>
  );
}
