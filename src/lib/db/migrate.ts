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
  `
  -- Maruf Cafe purchase agreements and e-signature module (see docs/AGREEMENTS.md).
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,                       -- admin | attorney | buyer | seller
    status TEXT NOT NULL DEFAULT 'invited',   -- invited | active | disabled
    password_hash TEXT,
    invite_token_hash TEXT,
    invite_expires_at TEXT,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE user_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX user_sessions_user ON user_sessions(user_id);

  CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    version_no INTEGER NOT NULL UNIQUE,
    clauses TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE agreements (
    id TEXT PRIMARY KEY,
    created_by TEXT NOT NULL REFERENCES users(id),
    buyer_user_id TEXT REFERENCES users(id),
    seller_user_id TEXT REFERENCES users(id),
    business_name TEXT NOT NULL DEFAULT 'Maruf Cafe',
    buyer_name TEXT NOT NULL DEFAULT '',
    seller_name TEXT NOT NULL DEFAULT '',
    purchase_price TEXT NOT NULL DEFAULT '',
    effective_date TEXT,
    closing_date TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    current_version_id TEXT,
    current_version_no INTEGER NOT NULL DEFAULT 1,
    signed_version_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL
  );
  CREATE INDEX agreements_status ON agreements(status);

  CREATE TABLE agreement_access (
    agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level TEXT NOT NULL,                      -- owner | editor | viewer
    party TEXT,                               -- buyer | seller | attorney | null
    created_at TEXT NOT NULL,
    PRIMARY KEY (agreement_id, user_id)
  );

  CREATE TABLE agreement_versions (
    id TEXT PRIMARY KEY,
    agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    data TEXT NOT NULL,
    attachment_refs TEXT NOT NULL DEFAULT '[]',
    template_id TEXT NOT NULL REFERENCES templates(id),
    template_snapshot TEXT NOT NULL,
    content_hash TEXT,
    document_hash TEXT,
    signatures_requested INTEGER NOT NULL DEFAULT 0,
    signatures_requested_at TEXT,
    superseded_at TEXT,
    change_summary TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (agreement_id, version_no)
  );

  CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,                       -- supporting | inventory | photo | signed_pdf | certificate
    schedule TEXT,                            -- A..G or null
    storage_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    version_id TEXT,
    uploaded_by TEXT,
    uploaded_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX attachments_agreement ON attachments(agreement_id);

  CREATE TABLE signature_requests (
    id TEXT PRIMARY KEY,
    agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
    version_id TEXT NOT NULL REFERENCES agreement_versions(id),
    provider TEXT NOT NULL,
    provider_envelope_id TEXT,
    signing_order TEXT NOT NULL,              -- buyer_first | seller_first | parallel
    status TEXT NOT NULL DEFAULT 'active',    -- active | completed | declined | expired | cancelled | superseded
    sent_document_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    provider_verified_at TEXT,
    signed_attachment_id TEXT,
    certificate_attachment_id TEXT,
    last_provider_status TEXT
  );
  CREATE UNIQUE INDEX signature_requests_envelope ON signature_requests(provider_envelope_id) WHERE provider_envelope_id IS NOT NULL;
  CREATE INDEX signature_requests_agreement ON signature_requests(agreement_id);

  CREATE TABLE signatures (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
    agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
    version_id TEXT NOT NULL REFERENCES agreement_versions(id),
    party TEXT NOT NULL,                      -- buyer | seller
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    routing_order INTEGER NOT NULL DEFAULT 1,
    client_user_id TEXT NOT NULL,
    provider_recipient_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | invited | viewed | signed | declined | expired | revoked
    token_hash TEXT,
    token_expires_at TEXT,
    token_revoked_at TEXT,
    otp_hash TEXT,
    otp_expires_at TEXT,
    otp_attempts INTEGER NOT NULL DEFAULT 0,
    verified_at TEXT,
    consent TEXT,
    invited_at TEXT,
    viewed_at TEXT,
    signed_at TEXT,
    declined_at TEXT,
    decline_reason TEXT,
    provider_signed_at TEXT,
    UNIQUE (request_id, party)
  );
  CREATE UNIQUE INDEX signatures_token ON signatures(token_hash) WHERE token_hash IS NOT NULL;

  CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL,
    agreement_id TEXT,
    version_id TEXT,
    type TEXT NOT NULL,
    at TEXT NOT NULL,
    actor_type TEXT NOT NULL,                 -- user | signer | provider | system
    actor_ref TEXT,
    provider_ref TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
  );
  CREATE INDEX audit_agreement ON audit_events(agreement_id, seq);
  CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
  CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;

  CREATE TABLE email_log (
    id TEXT PRIMARY KEY,
    agreement_id TEXT,
    signature_id TEXT,
    kind TEXT NOT NULL,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    provider_message_id TEXT,
    status TEXT NOT NULL,                     -- failed | accepted | delivered | delayed | bounced | complained
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    delivered_at TEXT
  );
  CREATE INDEX email_log_message ON email_log(provider_message_id);

  CREATE TABLE webhook_events (
    id TEXT PRIMARY KEY,                      -- "<source>:<event id>"
    source TEXT NOT NULL,
    received_at TEXT NOT NULL,
    outcome TEXT NOT NULL
  );

  CREATE TABLE app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
