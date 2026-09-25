import type Database from "better-sqlite3";

/** Applied in order; each entry runs once. Keep in sync with ./schema.ts. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);

  CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    brand TEXT, asin TEXT, upc TEXT, category TEXT,
    status TEXT NOT NULL DEFAULT 'researching',
    watch INTEGER NOT NULL DEFAULT 0,
    import_batch TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX products_asin ON products(asin);
  CREATE INDEX products_upc ON products(upc);

  CREATE TABLE price_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    side TEXT NOT NULL DEFAULT 'amazon',
    price REAL NOT NULL,
    seller_count INTEGER, sales_rank INTEGER, source TEXT
  );
  CREATE INDEX price_obs_product ON price_observations(product_id, at);

  CREATE TABLE research_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    created_at TEXT NOT NULL,
    product_name TEXT NOT NULL,
    status TEXT NOT NULL,
    data_sources TEXT NOT NULL, snapshot TEXT NOT NULL, summary TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, website TEXT, contact TEXT, location TEXT, products TEXT,
    moq TEXT, pricing TEXT, shipping_terms TEXT, payment_terms TEXT,
    lead_time_days INTEGER, return_policy TEXT, invoice_available INTEGER,
    authorization_status TEXT NOT NULL DEFAULT 'unknown',
    reliability_notes TEXT, last_order_date TEXT, last_price REAL, current_price REAL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL, asin TEXT, name TEXT NOT NULL, brand TEXT,
    supplier_id INTEGER, supplier_name TEXT, purchase_date TEXT,
    unit_cost REAL NOT NULL,
    qty_purchased INTEGER NOT NULL DEFAULT 0, qty_received INTEGER NOT NULL DEFAULT 0,
    qty_sent INTEGER NOT NULL DEFAULT 0, qty_sold INTEGER NOT NULL DEFAULT 0,
    sale_price REAL, fees_per_unit REAL,
    shipping_per_unit REAL NOT NULL DEFAULT 0, prep_per_unit REAL NOT NULL DEFAULT 0,
    storage_location TEXT, expiration_date TEXT, lot TEXT, notes TEXT,
    received_at TEXT, last_sale_at TEXT, created_at TEXT NOT NULL
  );

  CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    date TEXT NOT NULL, qty INTEGER NOT NULL, sale_price REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0, refunded_qty INTEGER NOT NULL DEFAULT 0, notes TEXT
  );

  CREATE TABLE purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL, supplier_id INTEGER, supplier_name TEXT NOT NULL,
    date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    shipping REAL NOT NULL DEFAULT 0, other_costs REAL NOT NULL DEFAULT 0,
    notes TEXT, created_at TEXT NOT NULL
  );

  CREATE TABLE po_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product TEXT NOT NULL, sku TEXT, asin TEXT,
    quantity INTEGER NOT NULL, unit_cost REAL NOT NULL,
    expected_sale_price REAL, expected_fees_per_unit REAL
  );

  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL,
    description TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX transactions_date ON transactions(date);

  CREATE TABLE alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL, type TEXT NOT NULL, product_id INTEGER,
    title TEXT NOT NULL, message TEXT NOT NULL, data TEXT,
    data_source TEXT NOT NULL, data_timestamp TEXT,
    read INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL, period_key TEXT NOT NULL,
    done TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(period, period_key)
  );
  `,
  `
  CREATE TABLE imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL,
    headers TEXT NOT NULL,
    rows TEXT NOT NULL,
    mapping TEXT NOT NULL,
    options TEXT NOT NULL
  );
  `,
];

export function migrate(sqlite: Database.Database): void {
  sqlite.pragma("foreign_keys = ON");
  const current = sqlite.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    sqlite.transaction(() => {
      sqlite.exec(MIGRATIONS[v]);
      sqlite.pragma(`user_version = ${v + 1}`);
    })();
  }
}
