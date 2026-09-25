import { connection } from "next/server";
import {
  createInventoryAction,
  deleteInventoryAction,
  deleteSaleAction,
  recordSaleAction,
  updateQuantitiesAction,
} from "@/app/actions/operations";
import { Card, EmptyState, Field, Notice, NumberInput, PageHeader, Stat, TableWrap, TextInput } from "@/components/ui";
import { findSlowMovers } from "@/lib/calc/inventory";
import { inventorySummary, landed, onHand } from "@/lib/calc/metrics";
import { getDb } from "@/lib/db/client";
import { fmtNum, fmtUSD } from "@/lib/format";
import { listInventory, listSales, listSuppliers } from "@/lib/repo/operations";
import { getSettings } from "@/lib/repo/products";

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const items = listInventory(db);
  const sales = listSales(db).slice(0, 25);
  const suppliers = listSuppliers(db);
  const settings = getSettings(db);
  const sum = inventorySummary(items);
  const slow = findSlowMovers(
    items.map((i) => ({ id: i.id, name: i.name, remaining: onHand(i), unitCost: landed(i), lastSaleAt: i.lastSaleAt, receivedAt: i.receivedAt })),
    settings.costDefaults.slowMoverDays,
  );
  const byId = new Map(items.map((i) => [i.id, i]));

  return (
    <>
      <PageHeader title="Track Inventory" subtitle="SKUs, quantities, landed cost, expected profit, and sales. Receiving a purchase order adds its lines here automatically." />
      {typeof sp.error === "string" && (
        <div className="mb-4">
          <Notice tone="bad">{sp.error}</Notice>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Units in inventory" value={fmtNum(sum.unitsOnHand)} />
        <Stat label="Inventory value (cost)" value={fmtUSD(sum.costValue)} hint="On-hand units × landed cost" />
        <Stat label="Capital invested" value={fmtUSD(sum.capitalInvested)} hint="All units purchased, at landed cost" />
        <Stat
          label="Est. inventory profit"
          value={fmtUSD(sum.estimatedProfit)}
          hint={sum.itemsMissingPrice ? `Estimate · ${sum.itemsMissingPrice} item(s) without a price excluded` : "Estimate at expected prices"}
        />
      </div>

      <div className="mt-5">
        <Card title={`Items (${items.length})`}>
          {items.length === 0 ? (
            <EmptyState title="No inventory yet">Add an item below, or receive a purchase order.</EmptyState>
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>SKU / product</th>
                    <th>Supplier</th>
                    <th className="r">Landed cost</th>
                    <th className="r">Bought</th>
                    <th className="r">Sold</th>
                    <th className="r">On hand</th>
                    <th className="r">Profit / unit (est.)</th>
                    <th>Update</th>
                    <th>Record sale</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const profit = i.salePrice !== null && i.feesPerUnit !== null ? i.salePrice - i.feesPerUnit - landed(i) : null;
                    return (
                      <tr key={i.id}>
                        <td className="min-w-44">
                          <div className="font-medium">{i.name}</div>
                          <div className="text-xs text-muted">
                            {[i.sku, i.asin, i.purchaseDate && `bought ${i.purchaseDate}`, i.expirationDate && `exp ${i.expirationDate}`, i.lot && `lot ${i.lot}`, i.storageLocation]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </td>
                        <td>{i.supplierName ?? "—"}</td>
                        <td className="r">
                          {fmtUSD(landed(i))}
                          <div className="text-xs text-muted">
                            {fmtUSD(i.unitCost)} + {fmtUSD(i.shippingPerUnit + i.prepPerUnit)}
                          </div>
                        </td>
                        <td className="r">{i.qtyPurchased}</td>
                        <td className="r">{i.qtySold}</td>
                        <td className="r font-semibold">{onHand(i)}</td>
                        <td className="r">
                          {profit === null ? "Unknown" : fmtUSD(profit)}
                          {profit !== null && <div className="text-xs text-muted">total {fmtUSD(profit * onHand(i))}</div>}
                        </td>
                        <td>
                          <details>
                            <summary className="cursor-pointer text-sm text-accent">Edit</summary>
                            <form action={updateQuantitiesAction.bind(null, i.id)} className="mt-2 grid w-56 gap-2">
                              <Field label="Received" name={`r${i.id}`}><input name="qtyReceived" type="number" defaultValue={i.qtyReceived} className="input" /></Field>
                              <Field label="Sent to Amazon" name={`s${i.id}`}><input name="qtySent" type="number" defaultValue={i.qtySent} className="input" /></Field>
                              <Field label="Sale price $" name={`p${i.id}`}><input name="salePrice" type="number" step="any" defaultValue={i.salePrice ?? ""} className="input" /></Field>
                              <Field label="Fees / unit $" name={`f${i.id}`}><input name="feesPerUnit" type="number" step="any" defaultValue={i.feesPerUnit ?? ""} className="input" /></Field>
                              <Field label="Location" name={`l${i.id}`}><input name="storageLocation" defaultValue={i.storageLocation ?? ""} className="input" /></Field>
                              <button className="btn btn-secondary btn-sm" type="submit">Save</button>
                            </form>
                            <form action={deleteInventoryAction.bind(null, i.id)} className="mt-2">
                              <button className="btn btn-danger btn-sm" type="submit">Delete item</button>
                            </form>
                          </details>
                        </td>
                        <td>
                          <form action={recordSaleAction.bind(null, i.id)} className="flex flex-wrap items-end gap-1">
                            <input name="qty" type="number" min={1} placeholder="Qty" aria-label="Quantity sold" className="input w-16" />
                            <input name="salePrice" type="number" step="any" placeholder="Price" defaultValue={i.salePrice ?? ""} aria-label="Sale price" className="input w-20" />
                            <input name="fees" type="number" step="any" placeholder="Total fees" aria-label="Total Amazon fees for this sale" className="input w-24" />
                            <button className="btn btn-secondary btn-sm" type="submit">Add</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title={`Slow-moving inventory (no sale in ${settings.costDefaults.slowMoverDays}+ days)`}>
          {slow.length === 0 ? (
            <p className="text-sm text-muted">None flagged.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {slow.map((s) => (
                <li key={s.id}>
                  <strong>{s.name}</strong>: {s.remaining} units, {fmtUSD(s.capitalTiedUp)} tied up. {s.reason}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            A pricing review isn&apos;t automatic liquidation. Compare the storage fees you&apos;ll keep paying against the profit you&apos;d give up by cutting the price.
          </p>
        </Card>
        <Card title="Recent sales">
          {sales.length === 0 ? (
            <p className="text-sm text-muted">No sales recorded yet.</p>
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th className="r">Qty</th>
                    <th className="r">Price</th>
                    <th className="r">Fees</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id}>
                      <td>{s.date}</td>
                      <td>{byId.get(s.inventoryId)?.name ?? "—"}</td>
                      <td className="r">{s.qty}</td>
                      <td className="r">{fmtUSD(s.salePrice)}</td>
                      <td className="r">{fmtUSD(s.fees)}</td>
                      <td>
                        <form action={deleteSaleAction.bind(null, s.id)}>
                          <button className="btn btn-danger btn-sm" type="submit" aria-label="Delete sale">×</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Add inventory item">
          <form action={createInventoryAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Product name" name="name" className="sm:col-span-2"><TextInput name="name" required /></Field>
            <Field label="SKU" name="sku"><TextInput name="sku" placeholder="Auto" /></Field>
            <Field label="ASIN" name="asin"><TextInput name="asin" /></Field>
            <Field label="Brand" name="brand"><TextInput name="brand" /></Field>
            <Field label="Supplier" name="supplierId">
              <select id="supplierId" name="supplierId" className="input">
                <option value="">None / other</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Purchase date" name="purchaseDate"><TextInput name="purchaseDate" type="date" /></Field>
            <Field label="Unit cost $" name="unitCost"><NumberInput name="unitCost" min={0} /></Field>
            <Field label="Qty purchased" name="qtyPurchased"><NumberInput name="qtyPurchased" step="1" min={0} /></Field>
            <Field label="Qty received" name="qtyReceived" hint="Blank = same as purchased"><NumberInput name="qtyReceived" step="1" min={0} /></Field>
            <Field label="Qty sent to Amazon" name="qtySent"><NumberInput name="qtySent" step="1" min={0} /></Field>
            <Field label="Shipping / unit $" name="shippingPerUnit"><NumberInput name="shippingPerUnit" min={0} /></Field>
            <Field label="Prep / unit $" name="prepPerUnit"><NumberInput name="prepPerUnit" min={0} /></Field>
            <Field label="Expected sale price $" name="salePrice"><NumberInput name="salePrice" min={0} /></Field>
            <Field label="Amazon fees / unit $" name="feesPerUnit"><NumberInput name="feesPerUnit" min={0} /></Field>
            <Field label="Storage location" name="storageLocation"><TextInput name="storageLocation" /></Field>
            <Field label="Expiration date" name="expirationDate"><TextInput name="expirationDate" type="date" /></Field>
            <Field label="Batch / lot" name="lot"><TextInput name="lot" /></Field>
            <Field label="Notes" name="notes" className="sm:col-span-2"><TextInput name="notes" /></Field>
            <div className="flex items-end">
              <button className="btn" type="submit">Add item</button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
