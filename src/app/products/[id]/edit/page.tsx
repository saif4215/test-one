import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ProductForm } from "@/components/ProductForm";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { getProduct } from "@/lib/repo/products";

export default async function EditProductPage({ params }: PageProps<"/products/[id]/edit">) {
  await connection();
  const { id: idParam } = await params;
  const id = Number(idParam);
  const rec = Number.isInteger(id) ? getProduct(getDb(), id) : null;
  if (!rec) notFound();
  return (
    <>
      <PageHeader
        title={`Edit: ${rec.data.name || "(unnamed)"}`}
        subtitle="Changes are labeled with their source and timestamp, and the full analysis recalculates. Values you leave unchanged keep their original source."
      />
      <ProductForm product={rec.data} id={id} submitLabel="Save and re-analyze" />
    </>
  );
}
