import { saveSupplierAction } from "@/app/actions/operations";
import type { Supplier } from "@/lib/repo/operations";
import { Field, NumberInput, TextInput, TriSelect } from "./ui";

export function SupplierForm({ s }: { s?: Supplier }) {
  return (
    <form action={saveSupplierAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field label="Supplier name" name="name"><TextInput name="name" defaultValue={s?.name} required /></Field>
      <Field label="Website" name="website"><TextInput name="website" type="url" defaultValue={s?.website} placeholder="https://…" /></Field>
      <Field label="Contact" name="contact"><TextInput name="contact" defaultValue={s?.contact} /></Field>
      <Field label="Location" name="location"><TextInput name="location" defaultValue={s?.location} /></Field>
      <Field label="Products / brands" name="products" className="lg:col-span-2"><TextInput name="products" defaultValue={s?.products} /></Field>
      <Field label="MOQ" name="moq"><TextInput name="moq" defaultValue={s?.moq} placeholder="e.g. $500 or 1 case" /></Field>
      <Field label="Pricing" name="pricing"><TextInput name="pricing" defaultValue={s?.pricing} placeholder="e.g. 40% off MSRP" /></Field>
      <Field label="Shipping terms" name="shippingTerms"><TextInput name="shippingTerms" defaultValue={s?.shippingTerms} /></Field>
      <Field label="Payment terms" name="paymentTerms"><TextInput name="paymentTerms" defaultValue={s?.paymentTerms} placeholder="e.g. Prepaid, Net 30" /></Field>
      <Field label="Lead time (days)" name="leadTimeDays"><NumberInput name="leadTimeDays" step="1" defaultValue={s?.leadTimeDays} /></Field>
      <Field label="Return policy" name="returnPolicy"><TextInput name="returnPolicy" defaultValue={s?.returnPolicy} /></Field>
      <Field label="Provides invoices?" name="invoiceAvailable"><TriSelect name="invoiceAvailable" value={s?.invoiceAvailable ?? null} /></Field>
      <Field label="Authorization status" name="authorizationStatus">
        <select id="authorizationStatus" name="authorizationStatus" className="input" defaultValue={s?.authorizationStatus ?? "unknown"}>
          <option value="unknown">Unknown</option>
          <option value="authorized">Authorized distributor / brand direct</option>
          <option value="retail">Retailer (arbitrage source)</option>
          <option value="unverified">Unverified</option>
        </select>
      </Field>
      <Field label="Last order date" name="lastOrderDate"><TextInput name="lastOrderDate" type="date" defaultValue={s?.lastOrderDate} /></Field>
      <Field label="Last price $" name="lastPrice"><NumberInput name="lastPrice" defaultValue={s?.lastPrice} /></Field>
      <Field label="Current price $" name="currentPrice"><NumberInput name="currentPrice" defaultValue={s?.currentPrice} /></Field>
      <Field label="Reliability notes" name="reliabilityNotes" className="sm:col-span-2 lg:col-span-3">
        <textarea id="reliabilityNotes" name="reliabilityNotes" rows={2} className="input" defaultValue={s?.reliabilityNotes ?? ""} />
      </Field>
      <div>
        <button className="btn" type="submit">{s ? "Save supplier" : "Add supplier"}</button>
      </div>
    </form>
  );
}
