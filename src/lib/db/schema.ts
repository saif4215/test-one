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

/** Uploaded spreadsheets. The original rows are kept unchanged so exports never lose data (§34). */
export const imports = sqliteTable("imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batch: text("batch").notNull(),
  filename: text("filename").notNull(),
  createdAt: text("created_at").notNull(),
  headers: text("headers", { mode: "json" }).notNull(),
  rows: text("rows", { mode: "json" }).notNull(),
  mapping: text("mapping", { mode: "json" }).notNull(),
  options: text("options", { mode: "json" }).notNull(),
});

export const checklists = sqliteTable("checklists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  period: text("period").notNull(),
  periodKey: text("period_key").notNull(),
  done: text("done", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull(),
});

/* ---- Maruf Cafe purchase agreements and e-signature module (docs/AGREEMENTS.md) ---- */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("invited"),
  passwordHash: text("password_hash"),
  inviteTokenHash: text("invite_token_hash"),
  inviteExpiresAt: text("invite_expires_at"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull(),
});

export const userSessions = sqliteTable("user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  versionNo: integer("version_no").notNull(),
  clauses: text("clauses", { mode: "json" }).$type<Record<string, string>>().notNull(),
  note: text("note").notNull().default(""),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
});

export const agreements = sqliteTable("agreements", {
  id: text("id").primaryKey(),
  createdBy: text("created_by").notNull(),
  buyerUserId: text("buyer_user_id"),
  sellerUserId: text("seller_user_id"),
  businessName: text("business_name").notNull().default("Maruf Cafe"),
  buyerName: text("buyer_name").notNull().default(""),
  sellerName: text("seller_name").notNull().default(""),
  purchasePrice: text("purchase_price").notNull().default(""),
  effectiveDate: text("effective_date"),
  closingDate: text("closing_date"),
  status: text("status").notNull().default("draft"),
  currentVersionId: text("current_version_id"),
  currentVersionNo: integer("current_version_no").notNull().default(1),
  signedVersionId: text("signed_version_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastActivityAt: text("last_activity_at").notNull(),
});

export const agreementAccess = sqliteTable("agreement_access", {
  agreementId: text("agreement_id").notNull(),
  userId: text("user_id").notNull(),
  level: text("level").notNull(),
  party: text("party"),
  createdAt: text("created_at").notNull(),
});

export const agreementVersions = sqliteTable("agreement_versions", {
  id: text("id").primaryKey(),
  agreementId: text("agreement_id").notNull(),
  versionNo: integer("version_no").notNull(),
  data: text("data", { mode: "json" }).$type<unknown>().notNull(),
  attachmentRefs: text("attachment_refs", { mode: "json" }).$type<AttachmentRef[]>().notNull(),
  templateId: text("template_id").notNull(),
  templateSnapshot: text("template_snapshot", { mode: "json" }).$type<Record<string, string>>().notNull(),
  contentHash: text("content_hash"),
  documentHash: text("document_hash"),
  signaturesRequested: integer("signatures_requested", { mode: "boolean" }).notNull().default(false),
  signaturesRequestedAt: text("signatures_requested_at"),
  supersededAt: text("superseded_at"),
  changeSummary: text("change_summary").notNull().default(""),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
});

/** Frozen into a version when attachments are added so a signed version always lists the same files. */
export interface AttachmentRef {
  id: string;
  sha256: string;
  fileName: string;
  schedule: string | null;
}

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  agreementId: text("agreement_id").notNull(),
  kind: text("kind").notNull(),
  schedule: text("schedule"),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  versionId: text("version_id"),
  uploadedBy: text("uploaded_by"),
  uploadedAt: text("uploaded_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const signatureRequests = sqliteTable("signature_requests", {
  id: text("id").primaryKey(),
  agreementId: text("agreement_id").notNull(),
  versionId: text("version_id").notNull(),
  provider: text("provider").notNull(),
  providerEnvelopeId: text("provider_envelope_id"),
  signingOrder: text("signing_order").notNull(),
  status: text("status").notNull().default("active"),
  sentDocumentHash: text("sent_document_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
  providerVerifiedAt: text("provider_verified_at"),
  signedAttachmentId: text("signed_attachment_id"),
  certificateAttachmentId: text("certificate_attachment_id"),
  lastProviderStatus: text("last_provider_status"),
});

export const signatures = sqliteTable("signatures", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  agreementId: text("agreement_id").notNull(),
  versionId: text("version_id").notNull(),
  party: text("party").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  routingOrder: integer("routing_order").notNull().default(1),
  clientUserId: text("client_user_id").notNull(),
  providerRecipientId: text("provider_recipient_id"),
  status: text("status").notNull().default("pending"),
  tokenHash: text("token_hash"),
  tokenExpiresAt: text("token_expires_at"),
  tokenRevokedAt: text("token_revoked_at"),
  otpHash: text("otp_hash"),
  otpExpiresAt: text("otp_expires_at"),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  verifiedAt: text("verified_at"),
  consent: text("consent", { mode: "json" }).$type<SignerConsent | null>(),
  invitedAt: text("invited_at"),
  viewedAt: text("viewed_at"),
  signedAt: text("signed_at"),
  declinedAt: text("declined_at"),
  declineReason: text("decline_reason"),
  providerSignedAt: text("provider_signed_at"),
});

export interface SignerConsent {
  consentVersion: string;
  consentTextSha256: string;
  esignConsent: boolean;
  reviewedAll: boolean;
  documentHash: string;
  acceptedAt: string;
  ip: string | null;
  userAgent: string | null;
  authMethod: string;
  authVerifiedAt: string;
}

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  seq: integer("seq").notNull(),
  agreementId: text("agreement_id"),
  versionId: text("version_id"),
  type: text("type").notNull(),
  at: text("at").notNull(),
  actorType: text("actor_type").notNull(),
  actorRef: text("actor_ref"),
  providerRef: text("provider_ref"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
});

export const emailLog = sqliteTable("email_log", {
  id: text("id").primaryKey(),
  agreementId: text("agreement_id"),
  signatureId: text("signature_id"),
  kind: text("kind").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  provider: text("provider").notNull(),
  providerMessageId: text("provider_message_id"),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deliveredAt: text("delivered_at"),
});

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  receivedAt: text("received_at").notNull(),
  outcome: text("outcome").notNull(),
});

export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: text("updated_at").notNull(),
});
