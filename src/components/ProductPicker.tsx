import type { ProductRecord } from "@/lib/repo/products";

/** A GET form that reloads the current page with ?product=<id>. */
export function ProductPicker({ action, products, selected, label = "Product" }: { action: string; products: ProductRecord[]; selected?: number; label?: string }) {
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="block flex-1 text-sm" htmlFor="product-picker">
        <span className="mb-1 block font-medium">{label}</span>
        <select id="product-picker" name="product" className="input" defaultValue={selected ?? ""}>
          <option value="">None (start blank)</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.data.name || `Product #${p.id}`}
              {p.data.asin ? ` · ${p.data.asin}` : ""}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-secondary" type="submit">Load</button>
    </form>
  );
}
