import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/*
 * Keep in sync with MIGRATIONS in ./migrate.ts. Timestamps are ISO-8601 strings.
 */

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  data: text("data", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Researched products. Most fields live in `data` (validated by productInputSchema). */
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default(""),
  brand: text("brand"),
  asin: text("asin"),
  upc: text("upc"),
  category: text("category"),
  status: text("status").notNull().default("researching"),
  watch: integer("watch", { mode: "boolean" }).notNull().default(false),
  importBatch: text("import_batch"),
  data: text("data", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const priceObservations = sqliteTable("price_observations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  at: text("at").notNull(),
  /** "amazon" = Amazon sale price; "source" = supplier purchase price. */
  side: text("side").notNull().default("amazon"),
  price: real("price").notNull(),
  sellerCount: integer("seller_count"),
  salesRank: integer("sales_rank"),
  source: text("source"),
});

export const researchLog = sqliteTable("research_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id"),
  createdAt: text("created_at").notNull(),
  productName: text("product_name").notNull(),
  status: text("status").notNull(),
  dataSources: text("data_sources", { mode: "json" }).notNull(),
  snapshot: text("snapshot", { mode: "json" }).notNull(),
  summary: text("summary", { mode: "json" }).notNull(),
  notes: text("notes"),
});

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  website: text("website"),
  contact: text("contact"),
  location: text("location"),
  products: text("products"),
  moq: text("moq"),
  pricing: text("pricing"),
  shippingTerms: text("shipping_terms"),
  paymentTerms: text("payment_terms"),
  leadTimeDays: integer("lead_time_days"),
  returnPolicy: text("return_policy"),
  invoiceAvailable: integer("invoice_available", { mode: "boolean" }),
  authorizationStatus: text("authorization_status").notNull().default("unknown"),
  reliabilityNotes: text("reliability_notes"),
  lastOrderDate: text("last_order_date"),
  lastPrice: real("last_price"),
  currentPrice: real("current_price"),
  createdAt: text("created_at").notNull(),
});

export const inventory = sqliteTable("inventory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sku: text("sku").notNull(),
  asin: text("asin"),
  name: text("name").notNull(),
  brand: text("brand"),
  supplierId: integer("supplier_id"),
  supplierName: text("supplier_name"),
  purchaseDate: text("purchase_date"),
  unitCost: real("unit_cost").notNull(),
  qtyPurchased: integer("qty_purchased").notNull().default(0),
  qtyReceived: integer("qty_received").notNull().default(0),
  qtySent: integer("qty_sent").notNull().default(0),
  qtySold: integer("qty_sold").notNull().default(0),
  salePrice: real("sale_price"),
  feesPerUnit: real("fees_per_unit"),
  shippingPerUnit: real("shipping_per_unit").notNull().default(0),
  prepPerUnit: real("prep_per_unit").notNull().default(0),
  storageLocation: text("storage_location"),
  expirationDate: text("expiration_date"),
  lot: text("lot"),
  notes: text("notes"),
  receivedAt: text("received_at"),
  lastSaleAt: text("last_sale_at"),
  createdAt: text("created_at").notNull(),
});

export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inventoryId: integer("inventory_id").notNull(),
  date: text("date").notNull(),
  qty: integer("qty").notNull(),
  salePrice: real("sale_price").notNull(),
  /** Total Amazon fees for this sale (all units). */
  fees: real("fees").notNull().default(0),
  /** Units refunded and returned from this sale. */
  refundedQty: integer("refunded_qty").notNull().default(0),
  notes: text("notes"),
});

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poNumber: text("po_number").notNull(),
  supplierId: integer("supplier_id"),
  supplierName: text("supplier_name").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull().default("draft"),
  shipping: real("shipping").notNull().default(0),
  otherCosts: real("other_costs").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const poLines = sqliteTable("po_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poId: integer("po_id").notNull(),
  product: text("product").notNull(),
  sku: text("sku"),
  asin: text("asin"),
  quantity: integer("quantity").notNull(),
  unitCost: real("unit_cost").notNull(),
  expectedSalePrice: real("expected_sale_price"),
  expectedFeesPerUnit: real("expected_fees_per_unit"),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  type: text("type").notNull(),
  productId: integer("product_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: text("data", { mode: "json" }),
  dataSource: text("data_source").notNull(),
  dataTimestamp: text("data_timestamp"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
});

export const checklists = sqliteTable("checklists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  period: text("period").notNull(),
  periodKey: text("period_key").notNull(),
  done: text("done", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull(),
});
