import { notFound } from "next/navigation";
import { connection } from "next/server";
import { deleteSupplierAction } from "@/app/actions/operations";
import { SupplierForm } from "@/components/SupplierForm";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { getSupplier } from "@/lib/repo/operations";

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  await connection();
  const { id: idParam } = await params;
  const id = Number(idParam);
  const s = Number.isInteger(id) ? getSupplier(getDb(), id) : null;
  if (!s) notFound();
  return (
    <>
      <PageHeader
        title={s.name}
        actions={
          <>
            <LinkButton href="/suppliers" variant="secondary">All suppliers</LinkButton>
            <form action={deleteSupplierAction.bind(null, id)}>
              <button className="btn btn-danger" type="submit">Delete</button>
            </form>
          </>
        }
      />
      <Card>
        <SupplierForm s={s} />
      </Card>
    </>
  );
}
