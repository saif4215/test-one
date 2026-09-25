import { FEE_CATEGORIES } from "@/data/feeTables.us";
import { Field } from "./ui";

export function ImportOptionsFields({
  kind = "USER_PROVIDED",
  asOf,
  category,
  fulfillment = "FBA",
}: {
  kind?: string;
  asOf?: string;
  category?: string | null;
  fulfillment?: string;
}) {
  const d = asOf ? new Date(asOf) : new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Sales/competition data came from" name="marketDataKind" hint="Sets how those columns are labeled.">
        <select id="marketDataKind" name="marketDataKind" className="input" defaultValue={kind}>
          <option value="USER_PROVIDED">I checked it myself</option>
          <option value="THIRD_PARTY">A third-party tool export</option>
          <option value="VERIFIED">Amazon data (e.g. a Seller Central report)</option>
        </select>
      </Field>
      <Field label="Data as of" name="asOf" hint="When the prices were pulled.">
        <input id="asOf" name="asOf" type="datetime-local" className="input" defaultValue={local} />
      </Field>
      <Field label="Default fee category" name="defaultCategory" hint="For rows without a category column.">
        <select id="defaultCategory" name="defaultCategory" className="input" defaultValue={category ?? ""}>
          <option value="">Unknown</option>
          {FEE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Fulfillment" name="fulfillment">
        <select id="fulfillment" name="fulfillment" className="input" defaultValue={fulfillment}>
          <option value="FBA">FBA</option>
          <option value="FBM">FBM</option>
        </select>
      </Field>
    </div>
  );
}
