import Link from "next/link";
import { connection } from "next/server";
import { saveListingAction } from "@/app/actions/listing";
import { ProductPicker } from "@/components/ProductPicker";
import { Card, EmptyState, Field, LinkButton, Notice, NumberInput, PageHeader, TextInput } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { fmtDateTime } from "@/lib/format";
import { getProduct, listProducts } from "@/lib/repo/products";

const Area = ({ name, value, rows = 3, placeholder }: { name: string; value?: string; rows?: number; placeholder?: string }) => (
  <textarea id={name} name={name} rows={rows} defaultValue={value ?? ""} placeholder={placeholder} className="input" />
);

export default async function ListingResearchPage({ searchParams }: PageProps<"/listing-research">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const products = listProducts(db);
  const id = typeof sp.product === "string" ? Number(sp.product) : NaN;
  const rec = Number.isInteger(id) ? getProduct(db, id) : null;
  const l = rec?.data.listing;

  return (
    <>
      <PageHeader
        title="Listing Research"
        subtitle="Record what you see on an Amazon listing: title, bullets, variations, pack count, customer questions, and complaints. It's saved with the product and feeds the other listing tools. Summarize in your own words instead of copying large blocks of text."
      />
      <Card>
        <ProductPicker action="/listing-research" products={products} selected={rec?.id} />
      </Card>
      {!rec ? (
        <div className="mt-5">
          <EmptyState title="Choose a product" action={<LinkButton href="/analyze">Analyze a product first</LinkButton>}>
            Listing research is saved with a product you&apos;ve analyzed or imported.
          </EmptyState>
        </div>
      ) : (
        <>
          {sp.saved && (
            <div className="mt-4">
              <Notice tone="good">Saved {fmtDateTime(l?.checkedAt)}.</Notice>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Link className="btn btn-secondary btn-sm" href={`/listing-writer?product=${rec.id}`}>Write listing copy</Link>
            <Link className="btn btn-secondary btn-sm" href={`/keywords?product=${rec.id}`}>Keyword research</Link>
            <Link className="btn btn-secondary btn-sm" href={`/reviews?product=${rec.id}`}>Review analysis</Link>
            <Link className="btn btn-secondary btn-sm" href={`/match?product=${rec.id}`}>Check product match</Link>
            <Link className="btn btn-secondary btn-sm" href={`/products/${rec.id}`}>Deal report</Link>
          </div>
          <form action={saveListingAction.bind(null, rec.id)} className="mt-4 space-y-5">
            <Card title={`Listing: ${rec.data.name || "(unnamed)"}${rec.data.asin ? ` · ${rec.data.asin}` : ""}`}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Listing title" name="title" className="sm:col-span-2 lg:col-span-4"><TextInput name="title" defaultValue={l?.title || rec.data.name} /></Field>
                <Field label="Size" name="size"><TextInput name="size" defaultValue={l?.size} /></Field>
                <Field label="Color" name="color"><TextInput name="color" defaultValue={l?.color} /></Field>
                <Field label="Pack count" name="packCount"><NumberInput name="packCount" step="1" defaultValue={l?.packCount} /></Field>
                <Field label="Number of images" name="imageCount"><NumberInput name="imageCount" step="1" defaultValue={l?.imageCount} /></Field>
                <Field label="Variations (size/color options)" name="variations" className="sm:col-span-2 lg:col-span-4"><TextInput name="variations" defaultValue={l?.variations} placeholder="e.g. Small / Large; Gray / Red" /></Field>
                <Field label="Bullet points (one per line, your summary)" name="bullets" className="sm:col-span-2"><Area name="bullets" value={l?.bullets.join("\n")} rows={5} /></Field>
                <Field label="Description notes" name="description" className="sm:col-span-2"><Area name="description" value={l?.description} rows={5} /></Field>
                <Field label="Search terms seen or researched" name="searchTerms" className="sm:col-span-2"><Area name="searchTerms" value={l?.searchTerms} placeholder="Comma or line separated" /></Field>
                <Field label="Customer questions" name="customerQuestions" className="sm:col-span-2"><Area name="customerQuestions" value={l?.customerQuestions} /></Field>
                <Field label="Customer complaints" name="complaints" className="sm:col-span-2"><Area name="complaints" value={l?.complaints} /></Field>
                <Field label="Common review themes" name="reviewThemes" className="sm:col-span-2"><Area name="reviewThemes" value={l?.reviewThemes} placeholder="Paste from Review Analysis or summarize" /></Field>
              </div>
            </Card>
            <div className="flex justify-end">
              <button className="btn" type="submit">Save listing research</button>
            </div>
          </form>
        </>
      )}
    </>
  );
}
