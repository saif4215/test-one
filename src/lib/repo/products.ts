import { and, asc, desc, eq, or } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { priceObservations, products, researchLog, settings } from "@/lib/db/schema";
import type { PriceObservation } from "@/lib/calc/priceHistory";
import { productInputSchema, type ProductInput } from "@/lib/domain/product";
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from "@/lib/domain/settings";

const nowIso = () => new Date().toISOString();

// ---------- settings ----------

export function getSettings(db: DB): Settings {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) return DEFAULT_SETTINGS;
  const parsed = settingsSchema.safeParse(row.data);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function saveSettings(db: DB, s: Settings): Settings {
  const data = settingsSchema.parse(s);
  db.insert(settings)
    .values({ id: 1, data, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: settings.id, set: { data, updatedAt: nowIso() } })
    .run();
  return data;
}

// ---------- products ----------

export type ProductStatus = "researching" | "watch" | "test_buy" | "buying" | "rejected" | "purchased";

export const PRODUCT_STATUSES: { value: ProductStatus; label: string }[] = [
  { value: "researching", label: "Researching" },
  { value: "watch", label: "Watching" },
  { value: "test_buy", label: "Test buy" },
  { value: "buying", label: "Buying" },
  { value: "purchased", label: "Purchased" },
  { value: "rejected", label: "Rejected" },
];

export interface ProductRecord {
  id: number;
  status: ProductStatus;
  watch: boolean;
  importBatch: string | null;
  createdAt: string;
  updatedAt: string;
  data: ProductInput;
}

function toRecord(row: typeof products.$inferSelect): ProductRecord {
  const parsed = productInputSchema.safeParse(row.data);
  return {
    id: row.id,
    status: row.status as ProductStatus,
    watch: row.watch,
    importBatch: row.importBatch,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    data: parsed.success ? parsed.data : productInputSchema.parse({ name: row.name }),
  };
}

export function listProducts(
  db: DB,
  opts: { watch?: boolean; status?: ProductStatus; importBatch?: string } = {},
): ProductRecord[] {
  const conds = [];
  if (opts.watch !== undefined) conds.push(eq(products.watch, opts.watch));
  if (opts.status) conds.push(eq(products.status, opts.status));
  if (opts.importBatch) conds.push(eq(products.importBatch, opts.importBatch));
  return db
    .select()
    .from(products)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(products.updatedAt))
    .all()
    .map(toRecord);
}

export function getProduct(db: DB, id: number): ProductRecord | null {
  const row = db.select().from(products).where(eq(products.id, id)).get();
  return row ? toRecord(row) : null;
}

export function findProductByIdentifier(db: DB, q: { asin?: string | null; upc?: string | null }): ProductRecord | null {
  const conds = [];
  if (q.asin) conds.push(eq(products.asin, q.asin.toUpperCase()));
  if (q.upc) conds.push(eq(products.upc, q.upc.replace(/\D/g, "")));
  if (!conds.length) return null;
  const row = db.select().from(products).where(or(...conds)).orderBy(desc(products.updatedAt)).get();
  return row ? toRecord(row) : null;
}

function indexed(input: ProductInput) {
  return {
    name: input.name,
    brand: input.brand,
    asin: input.asin ? input.asin.toUpperCase() : null,
    upc: input.upc ? input.upc.replace(/\D/g, "") : null,
    category: input.category,
  };
}

export function createProduct(
  db: DB,
  input: ProductInput,
  meta: { status?: ProductStatus; watch?: boolean; importBatch?: string | null } = {},
): number {
  const data = productInputSchema.parse(input);
  const ts = nowIso();
  const res = db
    .insert(products)
    .values({
      ...indexed(data),
      status: meta.status ?? "researching",
      watch: meta.watch ?? false,
      importBatch: meta.importBatch ?? null,
      data,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return Number(res.lastInsertRowid);
}

export function updateProduct(db: DB, id: number, input: ProductInput): void {
  const data = productInputSchema.parse(input);
  db.update(products)
    .set({ ...indexed(data), data, updatedAt: nowIso() })
    .where(eq(products.id, id))
    .run();
}

export function setProductStatus(db: DB, id: number, status: ProductStatus): void {
  db.update(products).set({ status, updatedAt: nowIso() }).where(eq(products.id, id)).run();
}

export function setProductWatch(db: DB, id: number, watch: boolean): void {
  db.update(products).set({ watch, updatedAt: nowIso() }).where(eq(products.id, id)).run();
}

export function deleteProduct(db: DB, id: number): void {
  db.delete(products).where(eq(products.id, id)).run();
}

// ---------- price observations ----------

export function addPriceObservation(
  db: DB,
  o: {
    productId: number;
    at?: string;
    side?: "amazon" | "source";
    price: number;
    sellerCount?: number | null;
    salesRank?: number | null;
    source?: string | null;
  },
): void {
  db.insert(priceObservations)
    .values({
      productId: o.productId,
      at: o.at ?? nowIso(),
      side: o.side ?? "amazon",
      price: o.price,
      sellerCount: o.sellerCount ?? null,
      salesRank: o.salesRank ?? null,
      source: o.source ?? null,
    })
    .run();
}

export function listPriceObservations(db: DB, productId: number, side: "amazon" | "source" = "amazon") {
  return db
    .select()
    .from(priceObservations)
    .where(and(eq(priceObservations.productId, productId), eq(priceObservations.side, side)))
    .orderBy(asc(priceObservations.at))
    .all();
}

export function priceHistoryFor(db: DB, productId: number): PriceObservation[] {
  return listPriceObservations(db, productId, "amazon").map((o) => ({ at: o.at, price: o.price, sellerCount: o.sellerCount }));
}

export function deletePriceObservation(db: DB, id: number): void {
  db.delete(priceObservations).where(eq(priceObservations.id, id)).run();
}

// ---------- research log (§67) ----------

export function addResearchLog(
  db: DB,
  e: {
    productId: number | null;
    productName: string;
    status: string;
    dataSources: string[];
    snapshot: unknown;
    summary: unknown;
    notes?: string | null;
  },
): number {
  const res = db
    .insert(researchLog)
    .values({
      productId: e.productId,
      createdAt: nowIso(),
      productName: e.productName || "(unnamed)",
      status: e.status,
      dataSources: e.dataSources,
      snapshot: e.snapshot,
      summary: e.summary,
      notes: e.notes ?? null,
    })
    .run();
  return Number(res.lastInsertRowid);
}

export function listResearchLog(db: DB, productId?: number) {
  return db
    .select()
    .from(researchLog)
    .where(productId ? eq(researchLog.productId, productId) : undefined)
    .orderBy(desc(researchLog.createdAt), desc(researchLog.id))
    .all();
}
