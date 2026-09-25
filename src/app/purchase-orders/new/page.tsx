import { connection } from "next/server";
import { createPurchaseOrderAction } from "@/app/actions/operations";
import { Card, Field, Notice, NumberInput, PageHeader, TextInput } from "@/components/ui";
import { loadAnalysis } from "@/lib/analysis/load";
import { getDb } from "@/lib/db/client";
import { listSuppliers, nextPoNumber } from "@/lib/repo/operations";

const LINES = 6;

export default async function NewPurchaseOrderPage({ searchParams }: PageProps<"/purchase-orders/new">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const suppliers = listSuppliers(db);
  const pid = typeof sp.product === "string" ? Number(sp.product) : NaN;
  const loaded = Number.isInteger(pid) ? loadAnalysis(db, pid) : null;
  const p = loaded?.rec.data;
  const a = loaded?.analysis;
  const first = p
    ? {
        product: p.name,
        asin: p.asin ?? "",
        quantity: a?.testBuy?.quantity || p.quantity || null,
        unitCost: p.purchasePrice,
        expectedSalePrice: p.salePrice,
        expectedFeesPerUnit: a?.unit ? Number(a.unit.deductedCost.toFixed(2)) : null,
      }
    : null;

  return (
    <>
      <PageHeader title="New purchase order" subtitle="Shipping and other costs are spread across the lines by value to get each line's landed cost per unit." />
      {typeof sp.error === "string" && (
        <div className="mb-4">
          <Notice tone="bad">{sp.error}</Notice>
        </div>
      )}
      {first && a?.testBuy && (
        <div className="mb-4">
          <Notice tone="info">
            Line 1 is pre-filled from your analysis of {p?.name}, using the suggested test quantity of {a.testBuy.quantity}. Expected fees are the estimated
            deducted costs per unit. Change anything that doesn&apos;t match your supplier&apos;s quote.
          </Notice>
        </div>
      )}
      <form action={createPurchaseOrderAction} className="space-y-5">
        {loaded && <input type="hidden" name="productId" value={loaded.rec.id} />}
        <Card title="Order">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="PO number" name="poNumber"><TextInput name="poNumber" defaultValue={nextPoNumber(db)} /></Field>
            <Field label="Supplier" name="supplierId">
              <select id="supplierId" name="supplierId" className="input" defaultValue="">
                <option value="">Other (type below)</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Other supplier name" name="supplierName"><TextInput name="supplierName" defaultValue={p?.sourceName} /></Field>
            <Field label="Date" name="date"><TextInput name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
            <Field label="Shipping $" name="shipping"><NumberInput name="shipping" min={0} defaultValue={0} /></Field>
            <Field label="Other costs $" name="otherCosts"><NumberInput name="otherCosts" min={0} defaultValue={0} /></Field>
            <Field label="Notes" name="notes" className="sm:col-span-2"><TextInput name="notes" /></Field>
          </div>
        </Card>
        <Card title="Lines">
          <div className="space-y-3">
            {Array.from({ length: LINES }, (_, i) => {
              const d = i === 0 ? first : null;
              return (
                <div key={i} className="grid gap-2 border-b border-border pb-3 last:border-0 sm:grid-cols-3 lg:grid-cols-7">
                  <Field label={`Product ${i + 1}`} name={`line${i}_product`} className="sm:col-span-3 lg:col-span-2"><TextInput name={`line${i}_product`} defaultValue={d?.product} /></Field>
                  <Field label="ASIN" name={`line${i}_asin`}><TextInput name={`line${i}_asin`} defaultValue={d?.asin} /></Field>
                  <Field label="Qty" name={`line${i}_quantity`}><NumberInput name={`line${i}_quantity`} step="1" min={0} defaultValue={d?.quantity} /></Field>
                  <Field label="Unit cost $" name={`line${i}_unitCost`}><NumberInput name={`line${i}_unitCost`} min={0} defaultValue={d?.unitCost} /></Field>
                  <Field label="Exp. sale $" name={`line${i}_expectedSalePrice`}><NumberInput name={`line${i}_expectedSalePrice`} min={0} defaultValue={d?.expectedSalePrice} /></Field>
                  <Field label="Exp. fees / unit $" name={`line${i}_expectedFeesPerUnit`}><NumberInput name={`line${i}_expectedFeesPerUnit`} min={0} defaultValue={d?.expectedFeesPerUnit} /></Field>
                </div>
              );
            })}
          </div>
        </Card>
        <div className="flex justify-end">
          <button className="btn" type="submit">Create purchase order</button>
        </div>
      </form>
    </>
  );
}
