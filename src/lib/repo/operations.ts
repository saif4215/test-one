import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { alerts, checklists, inventory, poLines, purchaseOrders, sales, suppliers, transactions } from "@/lib/db/schema";
import type { TransactionType } from "@/lib/calc/ledger";

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

// ---------- suppliers (§19) ----------

export type SupplierInput = Omit<typeof suppliers.$inferInsert, "id" | "createdAt">;
export type Supplier = typeof suppliers.$inferSelect;

export function listSuppliers(db: DB): Supplier[] {
  return db.select().from(suppliers).orderBy(asc(suppliers.name)).all();
}
export function getSupplier(db: DB, id: number): Supplier | null {
  return db.select().from(suppliers).where(eq(suppliers.id, id)).get() ?? null;
}
export function createSupplier(db: DB, s: SupplierInput): number {
  return Number(db.insert(suppliers).values({ ...s, createdAt: nowIso() }).run().lastInsertRowid);
}
export function updateSupplier(db: DB, id: number, s: SupplierInput): void {
  db.update(suppliers).set(s).where(eq(suppliers.id, id)).run();
}
export function deleteSupplier(db: DB, id: number): void {
  db.delete(suppliers).where(eq(suppliers.id, id)).run();
}

// ---------- inventory (§9) ----------

export type InventoryInput = Omit<typeof inventory.$inferInsert, "id" | "createdAt">;
export type InventoryItem = typeof inventory.$inferSelect;

export function listInventory(db: DB): InventoryItem[] {
  return db.select().from(inventory).orderBy(desc(inventory.createdAt), desc(inventory.id)).all();
}
export function getInventoryItem(db: DB, id: number): InventoryItem | null {
  return db.select().from(inventory).where(eq(inventory.id, id)).get() ?? null;
}
export function createInventoryItem(db: DB, i: InventoryInput): number {
  return Number(db.insert(inventory).values({ ...i, createdAt: nowIso() }).run().lastInsertRowid);
}
export function updateInventoryItem(db: DB, id: number, i: Partial<InventoryInput>): void {
  db.update(inventory).set(i).where(eq(inventory.id, id)).run();
}
export function deleteInventoryItem(db: DB, id: number): void {
  db.delete(inventory).where(eq(inventory.id, id)).run();
}

/** Units on hand (received but not yet sold), including units at Amazon. */
export function remainingQty(i: InventoryItem): number {
  return Math.max(0, i.qtyReceived - i.qtySold);
}

/** Landed cost per unit: purchase + inbound shipping + prep. */
export function landedUnitCost(i: InventoryItem): number {
  return i.unitCost + i.shippingPerUnit + i.prepPerUnit;
}

// ---------- sales ----------

export type Sale = typeof sales.$inferSelect;

export function recordSale(
  db: DB,
  s: { inventoryId: number; date?: string; qty: number; salePrice: number; fees: number; notes?: string | null },
): number {
  return db.transaction((tx) => {
    const item = tx.select().from(inventory).where(eq(inventory.id, s.inventoryId)).get();
    if (!item) throw new Error("Inventory item not found");
    const date = s.date ?? today();
    const id = Number(
      tx
        .insert(sales)
        .values({ inventoryId: s.inventoryId, date, qty: s.qty, salePrice: s.salePrice, fees: s.fees, notes: s.notes ?? null })
        .run().lastInsertRowid,
    );
    const lastSaleAt = !item.lastSaleAt || item.lastSaleAt < date ? date : item.lastSaleAt;
    tx.update(inventory)
      .set({ qtySold: item.qtySold + s.qty, lastSaleAt })
      .where(eq(inventory.id, s.inventoryId))
      .run();
    return id;
  });
}

export function listSales(db: DB, range?: { from?: string; to?: string }): Sale[] {
  const conds = [];
  if (range?.from) conds.push(gte(sales.date, range.from));
  if (range?.to) conds.push(lt(sales.date, range.to));
  return db
    .select()
    .from(sales)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(sales.date), desc(sales.id))
    .all();
}

export function deleteSale(db: DB, id: number): void {
  db.transaction((tx) => {
    const sale = tx.select().from(sales).where(eq(sales.id, id)).get();
    if (!sale) return;
    const item = tx.select().from(inventory).where(eq(inventory.id, sale.inventoryId)).get();
    if (item) tx.update(inventory).set({ qtySold: Math.max(0, item.qtySold - sale.qty) }).where(eq(inventory.id, item.id)).run();
    tx.delete(sales).where(eq(sales.id, id)).run();
  });
}

// ---------- purchase orders (§10) ----------

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type POLineRow = typeof poLines.$inferSelect;

export function nextPoNumber(db: DB): string {
  const count = db.select().from(purchaseOrders).all().length;
  return `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

export function createPurchaseOrder(
  db: DB,
  po: {
    poNumber?: string;
    supplierId?: number | null;
    supplierName: string;
    date?: string;
    shipping: number;
    otherCosts: number;
    notes?: string | null;
    lines: Omit<typeof poLines.$inferInsert, "id" | "poId">[];
  },
): number {
  return db.transaction((tx) => {
    const id = Number(
      tx
        .insert(purchaseOrders)
        .values({
          poNumber: po.poNumber || nextPoNumber(db),
          supplierId: po.supplierId ?? null,
          supplierName: po.supplierName,
          date: po.date ?? today(),
          status: "draft",
          shipping: po.shipping,
          otherCosts: po.otherCosts,
          notes: po.notes ?? null,
          createdAt: nowIso(),
        })
        .run().lastInsertRowid,
    );
    for (const l of po.lines) tx.insert(poLines).values({ ...l, poId: id }).run();
    return id;
  });
}

export function listPurchaseOrders(db: DB): (PurchaseOrder & { lines: POLineRow[] })[] {
  const pos = db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.date), desc(purchaseOrders.id)).all();
  const lines = db.select().from(poLines).all();
  return pos.map((p) => ({ ...p, lines: lines.filter((l) => l.poId === p.id) }));
}

export function getPurchaseOrder(db: DB, id: number): (PurchaseOrder & { lines: POLineRow[] }) | null {
  const po = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
  if (!po) return null;
  return { ...po, lines: db.select().from(poLines).where(eq(poLines.poId, id)).all() };
}

export function setPurchaseOrderStatus(db: DB, id: number, status: string): void {
  db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, id)).run();
}

export function deletePurchaseOrder(db: DB, id: number): void {
  db.delete(purchaseOrders).where(eq(purchaseOrders.id, id)).run();
}

/**
 * Marks a PO received. Each line becomes an inventory item at its landed unit
 * cost, and the purchase and shipping are recorded as cash-flow transactions.
 */
export function receivePurchaseOrder(db: DB, id: number): void {
  const po = getPurchaseOrder(db, id);
  if (!po || po.status === "received") return;
  const subtotal = po.lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);
  const extra = po.shipping + po.otherCosts;
  db.transaction((tx) => {
    for (const [i, l] of po.lines.entries()) {
      const share = subtotal > 0 ? (l.quantity * l.unitCost) / subtotal : 0;
      tx.insert(inventory)
        .values({
          sku: l.sku || `${po.poNumber}-${i + 1}`,
          asin: l.asin,
          name: l.product,
          supplierId: po.supplierId,
          supplierName: po.supplierName,
          purchaseDate: po.date,
          unitCost: l.unitCost,
          qtyPurchased: l.quantity,
          qtyReceived: l.quantity,
          salePrice: l.expectedSalePrice,
          feesPerUnit: l.expectedFeesPerUnit,
          shippingPerUnit: l.quantity > 0 ? (extra * share) / l.quantity : 0,
          prepPerUnit: 0,
          receivedAt: today(),
          createdAt: nowIso(),
        })
        .run();
    }
    tx.insert(transactions)
      .values({ date: po.date, type: "inventory_purchase", amount: subtotal, description: `${po.poNumber} — ${po.supplierName}`, createdAt: nowIso() })
      .run();
    if (po.shipping > 0)
      tx.insert(transactions)
        .values({ date: po.date, type: "inbound_shipping", amount: po.shipping, description: `${po.poNumber} shipping`, createdAt: nowIso() })
        .run();
    if (po.otherCosts > 0)
      tx.insert(transactions)
        .values({ date: po.date, type: "other_expense", amount: po.otherCosts, description: `${po.poNumber} other costs`, createdAt: nowIso() })
        .run();
    tx.update(purchaseOrders).set({ status: "received" }).where(eq(purchaseOrders.id, id)).run();
    if (po.supplierId)
      tx.update(suppliers).set({ lastOrderDate: po.date }).where(eq(suppliers.id, po.supplierId)).run();
  });
}

// ---------- transactions (§11, §26) ----------

export type TransactionRow = typeof transactions.$inferSelect;

export function addTransaction(db: DB, t: { date: string; type: TransactionType; amount: number; description?: string | null }): number {
  return Number(
    db
      .insert(transactions)
      .values({ date: t.date, type: t.type, amount: Math.abs(t.amount), description: t.description ?? null, createdAt: nowIso() })
      .run().lastInsertRowid,
  );
}
export function listTransactions(db: DB): TransactionRow[] {
  return db.select().from(transactions).orderBy(desc(transactions.date), desc(transactions.id)).all();
}
export function deleteTransaction(db: DB, id: number): void {
  db.delete(transactions).where(eq(transactions.id, id)).run();
}

// ---------- alerts (§36, §65) ----------

export type AlertRow = typeof alerts.$inferSelect;

export function addAlert(
  db: DB,
  a: { type: string; productId?: number | null; title: string; message: string; data?: unknown; dataSource: string; dataTimestamp?: string | null },
): number {
  return Number(
    db
      .insert(alerts)
      .values({
        createdAt: nowIso(),
        type: a.type,
        productId: a.productId ?? null,
        title: a.title,
        message: a.message,
        data: a.data ?? null,
        dataSource: a.dataSource,
        dataTimestamp: a.dataTimestamp ?? null,
      })
      .run().lastInsertRowid,
  );
}
export function listAlerts(db: DB, opts: { unreadOnly?: boolean } = {}): AlertRow[] {
  return db
    .select()
    .from(alerts)
    .where(opts.unreadOnly ? eq(alerts.read, false) : undefined)
    .orderBy(desc(alerts.createdAt), desc(alerts.id))
    .all();
}
export function markAlertRead(db: DB, id: number, read = true): void {
  db.update(alerts).set({ read }).where(eq(alerts.id, id)).run();
}
export function deleteAlert(db: DB, id: number): void {
  db.delete(alerts).where(eq(alerts.id, id)).run();
}

// ---------- workflow checklists (§29–31) ----------

export function getChecklist(db: DB, period: string, periodKey: string): string[] {
  const row = db.select().from(checklists).where(and(eq(checklists.period, period), eq(checklists.periodKey, periodKey))).get();
  return (row?.done as string[] | undefined) ?? [];
}

export function toggleChecklistItem(db: DB, period: string, periodKey: string, item: string): string[] {
  const done = new Set(getChecklist(db, period, periodKey));
  if (done.has(item)) done.delete(item);
  else done.add(item);
  const list = [...done];
  db.insert(checklists)
    .values({ period, periodKey, done: list, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: [checklists.period, checklists.periodKey], set: { done: list, updatedAt: nowIso() } })
    .run();
  return list;
}
