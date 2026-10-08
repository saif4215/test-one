/**
 * Agreement records: creation, access control, versioned editing, attachments
 * and the review step. Everything here enforces authorization on the server;
 * the UI hiding a button is never the only protection.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db/client";
import {
  agreementAccess,
  agreementVersions,
  agreements,
  attachments,
  signatureRequests,
  signatures,
  templates,
  users,
  type AttachmentRef,
} from "@/lib/db/schema";
import { lastActivity, recordEvent } from "./audit";
import { buildDocument, type AttachmentInfo, type BuiltDocument } from "./document";
import { parseCents } from "./money";
import { capabilities, type AccessLevel, type Actor, type Capabilities } from "./permissions";
import { applyQuickDefaults } from "./quick";
import { readinessIssues, type Issue } from "./readiness";
import {
  agreementDataSchema,
  checkpointsSchema,
  defaultAgreementData,
  parseAgreementData,
  partyDisplayName,
  type AgreementData,
} from "./schema";
import { newId, randomToken, sha256Hex } from "./security";
import type { AgreementStatus } from "./status";
import { MAX_ATTACHMENTS_PER_AGREEMENT, getFile, putFile, validateUpload } from "./storage";
import { CLAUSES, DEFAULT_CLAUSES } from "./template";

export type AgreementRow = typeof agreements.$inferSelect;
export type VersionRow = typeof agreementVersions.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type Result<T = true> = { ok: true; value: T } | { ok: false; error: string; fields?: Record<string, string> };

const fail = (error: string, fields?: Record<string, string>): { ok: false; error: string; fields?: Record<string, string> } => ({ ok: false, error, fields });

/* ---------------- templates ---------------- */

export type TemplateRow = typeof templates.$inferSelect;

/** Makes sure version 1 of the master template exists (seeded from the built-in wording). */
export function ensureTemplate(db: DB, now = new Date()): TemplateRow {
  const latest = latestTemplate(db);
  if (latest) return latest;
  const row: TemplateRow = {
    id: newId(),
    versionNo: 1,
    clauses: { ...DEFAULT_CLAUSES },
    note: "Initial template",
    createdBy: null,
    createdAt: now.toISOString(),
  };
  db.insert(templates).values(row).run();
  return row;
}

export function latestTemplate(db: DB): TemplateRow | null {
  return db.select().from(templates).orderBy(desc(templates.versionNo)).limit(1).get() ?? null;
}

export function listTemplates(db: DB): TemplateRow[] {
  return db.select().from(templates).orderBy(desc(templates.versionNo)).all();
}

/** Saves a NEW template version. Existing agreement versions keep the wording they were created with. */
export function saveTemplate(db: DB, actor: Actor, clauses: Record<string, string>, note: string, now = new Date()): Result<TemplateRow> {
  if (actor.role !== "admin") return fail("Only administrators can change the master template.");
  const current = ensureTemplate(db, now);
  const next: Record<string, string> = { ...current.clauses };
  for (const c of CLAUSES) {
    const v = clauses[c.key];
    if (typeof v === "string") {
      if (v.length > 20000) return fail(`The text for "${c.title}" is too long.`);
      next[c.key] = v;
    }
  }
  const changed = CLAUSES.filter((c) => next[c.key] !== current.clauses[c.key]).map((c) => c.key);
  if (!changed.length) return fail("Nothing changed.");
  const row: TemplateRow = { id: newId(), versionNo: current.versionNo + 1, clauses: next, note: note.trim().slice(0, 300), createdBy: actor.id, createdAt: now.toISOString() };
  db.insert(templates).values(row).run();
  recordEvent(db, { type: "template.updated", actorType: "user", actorRef: actor.id, metadata: { versionNo: row.versionNo, changedClauses: changed, note: row.note } }, now);
  return { ok: true, value: row };
}

/* ---------------- ids, hashes ---------------- */

export function newAgreementId(now = new Date()): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomToken(8);
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += alphabet[bytes.charCodeAt(i) % alphabet.length];
  return `MCA-${now.getUTCFullYear()}-${suffix}`;
}

/** Stable hash of everything that defines a version's contract content. */
export function contentHash(data: AgreementData, snapshot: Record<string, string>, refs: AttachmentRef[]): string {
  const sorted = (o: unknown): unknown =>
    Array.isArray(o) ? o.map(sorted) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)])) : o;
  return sha256Hex(JSON.stringify(sorted({ data, snapshot, refs: refs.map((r) => ({ id: r.id, sha256: r.sha256, schedule: r.schedule })) })));
}

/* ---------------- access ---------------- */

export function accessLevel(db: DB, actor: Actor, agreementId: string): AccessLevel | null {
  if (actor.role === "admin") return db.select().from(agreements).where(eq(agreements.id, agreementId)).get() ? "admin" : null;
  const row = db.select().from(agreementAccess).where(and(eq(agreementAccess.agreementId, agreementId), eq(agreementAccess.userId, actor.id))).get();
  return (row?.level as AccessLevel | undefined) ?? null;
}

export function caps(db: DB, actor: Actor, agreementId: string): Capabilities {
  return capabilities(accessLevel(db, actor, agreementId));
}

export function grantAccess(db: DB, actor: Actor, agreementId: string, email: string, level: "editor" | "viewer", party: string | null, now = new Date()): Result {
  if (!caps(db, actor, agreementId).manageAccess) return fail("You can't manage access to this agreement.");
  const user = db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
  if (!user || user.status !== "active") return fail("No active user has that email. Invite them from Admin → Users first.");
  if (user.role === "admin") return fail("Administrators already have access to every agreement.");
  if (user.role === "seller" && level === "editor") return fail("Sellers can view and sign but not edit. Choose Viewer.");
  const existing = db.select().from(agreementAccess).where(and(eq(agreementAccess.agreementId, agreementId), eq(agreementAccess.userId, user.id))).get();
  if (existing?.level === "owner") return fail("That user already owns this agreement.");
  if (existing) db.update(agreementAccess).set({ level, party }).where(and(eq(agreementAccess.agreementId, agreementId), eq(agreementAccess.userId, user.id))).run();
  else db.insert(agreementAccess).values({ agreementId, userId: user.id, level, party, createdAt: now.toISOString() }).run();
  if (party === "buyer") db.update(agreements).set({ buyerUserId: user.id }).where(eq(agreements.id, agreementId)).run();
  if (party === "seller") db.update(agreements).set({ sellerUserId: user.id }).where(eq(agreements.id, agreementId)).run();
  recordEvent(db, { agreementId, type: "agreement.access_granted", actorType: "user", actorRef: actor.id, metadata: { userId: user.id, level, party } }, now);
  return { ok: true, value: true };
}

export function revokeAccess(db: DB, actor: Actor, agreementId: string, userId: string, now = new Date()): Result {
  if (!caps(db, actor, agreementId).manageAccess) return fail("You can't manage access to this agreement.");
  const row = db.select().from(agreementAccess).where(and(eq(agreementAccess.agreementId, agreementId), eq(agreementAccess.userId, userId))).get();
  if (!row) return fail("That user doesn't have access.");
  if (row.level === "owner") return fail("The owner's access can't be removed.");
  db.delete(agreementAccess).where(and(eq(agreementAccess.agreementId, agreementId), eq(agreementAccess.userId, userId))).run();
  recordEvent(db, { agreementId, type: "agreement.access_revoked", actorType: "user", actorRef: actor.id, metadata: { userId } }, now);
  return { ok: true, value: true };
}

export function listParticipants(db: DB, agreementId: string) {
  return db
    .select({ userId: agreementAccess.userId, level: agreementAccess.level, party: agreementAccess.party, name: users.name, email: users.email, role: users.role })
    .from(agreementAccess)
    .innerJoin(users, eq(users.id, agreementAccess.userId))
    .where(eq(agreementAccess.agreementId, agreementId))
    .all();
}

/* ---------------- create / read ---------------- */

export function createAgreement(db: DB, actor: Actor, opts: { mode?: "full" | "quick" } = {}, now = new Date()): Result<{ agreement: AgreementRow; version: VersionRow }> {
  if (actor.role === "seller") return fail("Sellers can't create agreements.");
  const tpl = ensureTemplate(db, now);
  const data = defaultAgreementData();
  data.mode = opts.mode === "quick" ? "quick" : "full";
  const id = newAgreementId(now);
  const versionId = newId();
  const t = now.toISOString();
  db.transaction((tx) => {
    tx.insert(agreements).values({ id, createdBy: actor.id, businessName: "Maruf Cafe", status: "draft", currentVersionId: versionId, currentVersionNo: 1, createdAt: t, updatedAt: t, lastActivityAt: t }).run();
    tx.insert(agreementVersions).values({
      id: versionId, agreementId: id, versionNo: 1, data, attachmentRefs: [], templateId: tpl.id, templateSnapshot: tpl.clauses,
      contentHash: contentHash(data, tpl.clauses, []), changeSummary: "Initial draft", createdBy: actor.id, createdAt: t,
    }).run();
    if (actor.role !== "admin") tx.insert(agreementAccess).values({ agreementId: id, userId: actor.id, level: "owner", party: actor.role === "buyer" ? "buyer" : null, createdAt: t }).run();
    if (actor.role === "buyer") tx.update(agreements).set({ buyerUserId: actor.id }).where(eq(agreements.id, id)).run();
  });
  recordEvent(db, { agreementId: id, versionId, type: "agreement.created", actorType: "user", actorRef: actor.id, metadata: { templateVersion: tpl.versionNo } }, now);
  recordEvent(db, { agreementId: id, versionId, type: "version.created", actorType: "user", actorRef: actor.id, metadata: { versionNo: 1 } }, now);
  return { ok: true, value: { agreement: getAgreementRow(db, id)!, version: getVersionRow(db, versionId)! } };
}

export const getAgreementRow = (db: DB, id: string): AgreementRow | null => db.select().from(agreements).where(eq(agreements.id, id)).get() ?? null;
export const getVersionRow = (db: DB, id: string): VersionRow | null => db.select().from(agreementVersions).where(eq(agreementVersions.id, id)).get() ?? null;
export const listVersions = (db: DB, agreementId: string): VersionRow[] => db.select().from(agreementVersions).where(eq(agreementVersions.agreementId, agreementId)).orderBy(desc(agreementVersions.versionNo)).all();

export function versionData(v: VersionRow): AgreementData {
  const parsed = parseAgreementData(v.data);
  if (!parsed.success) throw new Error(`Stored agreement data for version ${v.id} is invalid.`);
  return parsed.data;
}

export interface AgreementBundle {
  agreement: AgreementRow;
  version: VersionRow;
  data: AgreementData;
  caps: Capabilities;
  level: AccessLevel;
}

/** Loads an agreement only if the actor may see it. Returns null for "no such agreement" and "not yours" alike. */
export function loadAgreement(db: DB, actor: Actor, id: string): AgreementBundle | null {
  const level = accessLevel(db, actor, id);
  if (!level) return null;
  const agreement = getAgreementRow(db, id);
  const version = agreement?.currentVersionId ? getVersionRow(db, agreement.currentVersionId) : null;
  if (!agreement || !version) return null;
  return { agreement, version, data: versionData(version), caps: capabilities(level), level };
}

export interface ListFilters {
  status?: AgreementStatus;
}

export function listAgreements(db: DB, actor: Actor, filters: ListFilters = {}) {
  let rows: AgreementRow[];
  if (actor.role === "admin") rows = db.select().from(agreements).orderBy(desc(agreements.lastActivityAt)).all();
  else {
    const ids = db.select({ id: agreementAccess.agreementId }).from(agreementAccess).where(eq(agreementAccess.userId, actor.id)).all().map((r) => r.id);
    rows = ids.length ? db.select().from(agreements).where(inArray(agreements.id, ids)).orderBy(desc(agreements.lastActivityAt)).all() : [];
  }
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  return rows.map((a) => {
    const req = activeRequest(db, a.id);
    const signers = req ? db.select().from(signatures).where(eq(signatures.requestId, req.id)).all() : [];
    const last = lastActivity(db, a.id);
    return {
      agreement: a,
      outstanding: signers.filter((s) => s.status !== "signed").map((s) => s.party as "buyer" | "seller"),
      lastActivity: last ? { type: last.type, at: last.at } : null,
    };
  });
}

/** The newest signature request that is still live, or the newest at all. */
export function activeRequest(db: DB, agreementId: string) {
  const rows = db.select().from(signatureRequests).where(eq(signatureRequests.agreementId, agreementId)).orderBy(desc(signatureRequests.createdAt)).all();
  return rows.find((r) => r.status === "active") ?? rows[0] ?? null;
}

/* ---------------- editing ---------------- */

const stepSlices = {
  buyer: z.object({ buyer: agreementDataSchema.shape.buyer }),
  seller: z.object({ seller: agreementDataSchema.shape.seller }),
  business: z.object({ business: agreementDataSchema.shape.business }),
  assets: z.object({ assets: agreementDataSchema.shape.assets }),
  price: z.object({ price: agreementDataSchema.shape.price }),
  terms: z.object({
    lease: agreementDataSchema.shape.lease,
    closing: agreementDataSchema.shape.closing,
    liabilities: agreementDataSchema.shape.liabilities,
    conditions: agreementDataSchema.shape.conditions,
    permits: agreementDataSchema.shape.permits,
    employment: agreementDataSchema.shape.employment,
    terms: agreementDataSchema.shape.terms,
    additionalConditions: agreementDataSchema.shape.additionalConditions,
  }),
  submit: z.object({ checkpoints: checkpointsSchema }),
  clauses: z.object({ clauseOverrides: agreementDataSchema.shape.clauseOverrides }),
  quick: z.object({
    buyer: agreementDataSchema.shape.buyer,
    seller: agreementDataSchema.shape.seller,
    business: agreementDataSchema.shape.business,
    assets: agreementDataSchema.shape.assets,
    price: agreementDataSchema.shape.price,
    lease: agreementDataSchema.shape.lease,
    closing: agreementDataSchema.shape.closing,
    quick: agreementDataSchema.shape.quick,
    checkpoints: agreementDataSchema.shape.checkpoints,
  }),
} as const;
export type EditableStep = keyof typeof stepSlices;
export const isEditableStep = (s: string): s is EditableStep => s in stepSlices;

function zodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join(".")] ||= i.message;
  return out;
}

function touch(db: DB, id: string, now: Date, extra: Partial<typeof agreements.$inferInsert> = {}) {
  db.update(agreements).set({ ...extra, updatedAt: now.toISOString(), lastActivityAt: now.toISOString() }).where(eq(agreements.id, id)).run();
}

function summaryColumns(d: AgreementData) {
  return {
    buyerName: partyDisplayName(d.buyer),
    sellerName: partyDisplayName(d.seller),
    businessName: d.business.name || "Maruf Cafe",
    purchasePrice: parseCents(d.price.totalPrice) === null ? "" : d.price.totalPrice,
    effectiveDate: d.business.effectiveDate || null,
    closingDate: d.business.proposedClosingDate || d.closing.closingDate || null,
  };
}

/** The current version can only be edited while no signatures have been requested for it. */
function editable(db: DB, actor: Actor, id: string): Result<AgreementBundle> {
  const b = loadAgreement(db, actor, id);
  if (!b) return fail("Agreement not found.");
  if (!b.caps.edit) return fail("You don't have permission to edit this agreement.");
  if (b.agreement.status === "cancelled") return fail("This agreement was cancelled and can't be edited.");
  if (b.version.signaturesRequested) {
    return fail("Signatures have been requested for this version, so it can't be changed. Create a revision to change it; the pending signature request will be withdrawn and everyone must sign the new version.");
  }
  return { ok: true, value: b };
}

export function saveStep(db: DB, actor: Actor, agreementId: string, step: EditableStep, rawSlice: unknown, now = new Date()): Result {
  const e = editable(db, actor, agreementId);
  if (!e.ok) return e;
  const { agreement, version, data } = e.value;
  const slice = stepSlices[step].safeParse(rawSlice);
  if (!slice.success) return fail("Please fix the highlighted fields.", zodErrors(slice.error));
  // Only overwrite the parts the caller actually sent; zod fills missing keys with blanks, which must not wipe saved data.
  const sent = Object.fromEntries(Object.entries(slice.data).filter(([k]) => rawSlice !== null && typeof rawSlice === "object" && k in (rawSlice as object)));
  const merged = agreementDataSchema.safeParse({ ...data, ...sent });
  if (!merged.success) return fail("Please fix the highlighted fields.", zodErrors(merged.error));
  const next = merged.data.mode === "quick" ? applyQuickDefaults(merged.data) : merged.data;
  db.transaction((tx) => {
    tx.update(agreementVersions).set({ data: next, contentHash: contentHash(next, version.templateSnapshot, version.attachmentRefs) }).where(eq(agreementVersions.id, version.id)).run();
    touch(tx as unknown as DB, agreementId, now, { ...summaryColumns(next), ...(agreement.status === "awaiting_review" ? { status: "draft" } : {}) });
  });
  recordEvent(db, { agreementId, versionId: version.id, type: "agreement.updated", actorType: "user", actorRef: actor.id, metadata: { step } }, now);
  if (agreement.status === "awaiting_review") recordEvent(db, { agreementId, versionId: version.id, type: "agreement.returned_to_draft", actorType: "user", actorRef: actor.id, metadata: { reason: "edited" } }, now);
  return { ok: true, value: true };
}

/** Re-bases a draft on the latest master template (explicit action; drafts only). */
export function upgradeToLatestTemplate(db: DB, actor: Actor, agreementId: string, now = new Date()): Result {
  const e = editable(db, actor, agreementId);
  if (!e.ok) return e;
  const tpl = ensureTemplate(db, now);
  const v = e.value.version;
  if (tpl.id === v.templateId) return fail("This agreement already uses the latest template.");
  db.update(agreementVersions).set({ templateId: tpl.id, templateSnapshot: tpl.clauses, contentHash: contentHash(e.value.data, tpl.clauses, v.attachmentRefs) }).where(eq(agreementVersions.id, v.id)).run();
  touch(db, agreementId, now, e.value.agreement.status === "awaiting_review" ? { status: "draft" } : {});
  recordEvent(db, { agreementId, versionId: v.id, type: "agreement.template_upgraded", actorType: "user", actorRef: actor.id, metadata: { templateVersion: tpl.versionNo } }, now);
  return { ok: true, value: true };
}

/* ---------------- attachments ---------------- */

export function attachmentInfos(db: DB, refs: AttachmentRef[]): AttachmentInfo[] {
  if (!refs.length) return [];
  const rows = db.select().from(attachments).where(inArray(attachments.id, refs.map((r) => r.id))).all();
  return refs
    .map((r) => rows.find((x) => x.id === r.id))
    .filter((x): x is AttachmentRow => !!x)
    .map((x) => ({ id: x.id, fileName: x.fileName, schedule: x.schedule, contentType: x.contentType, sha256: x.sha256, mergeable: ["application/pdf", "image/png", "image/jpeg"].includes(x.contentType) }));
}

export function listAttachments(db: DB, agreementId: string): AttachmentRow[] {
  return db.select().from(attachments).where(and(eq(attachments.agreementId, agreementId), isNull(attachments.deletedAt))).all().filter((a) => a.kind !== "signed_pdf" && a.kind !== "certificate" && a.kind !== "sent_pdf");
}

export const SCHEDULE_LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;

export function addAttachment(
  db: DB,
  actor: Actor,
  agreementId: string,
  file: { name: string; bytes: Buffer },
  meta: { kind: "supporting" | "inventory" | "photo"; schedule: string | null },
  now = new Date(),
): Result<AttachmentRow> {
  const e = editable(db, actor, agreementId);
  if (!e.ok) return e;
  const v = validateUpload(file.name, file.bytes);
  if (!v.ok) return fail(v.error);
  if (meta.schedule && !(SCHEDULE_LETTERS as readonly string[]).includes(meta.schedule)) return fail("Choose a schedule from A to G.");
  const count = e.value.version.attachmentRefs.length;
  if (count >= MAX_ATTACHMENTS_PER_AGREEMENT) return fail(`An agreement can have at most ${MAX_ATTACHMENTS_PER_AGREEMENT} attachments.`);
  let stored: { key: string; sha256: string };
  try {
    stored = putFile(file.bytes);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "The file could not be stored.");
  }
  const row: AttachmentRow = {
    id: newId(), agreementId, kind: meta.kind, schedule: meta.schedule, storageKey: stored.key, fileName: v.value.fileName,
    contentType: v.value.contentType, size: file.bytes.length, sha256: stored.sha256, versionId: e.value.version.id,
    uploadedBy: actor.id, uploadedAt: now.toISOString(), deletedAt: null,
  };
  const refs = [...e.value.version.attachmentRefs, { id: row.id, sha256: row.sha256, fileName: row.fileName, schedule: row.schedule }];
  db.transaction((tx) => {
    tx.insert(attachments).values(row).run();
    tx.update(agreementVersions).set({ attachmentRefs: refs, contentHash: contentHash(e.value.data, e.value.version.templateSnapshot, refs) }).where(eq(agreementVersions.id, e.value.version.id)).run();
    touch(tx as unknown as DB, agreementId, now, e.value.agreement.status === "awaiting_review" ? { status: "draft" } : {});
  });
  recordEvent(db, { agreementId, versionId: e.value.version.id, type: "attachment.uploaded", actorType: "user", actorRef: actor.id, metadata: { attachmentId: row.id, fileName: row.fileName, sha256: row.sha256, size: row.size } }, now);
  return { ok: true, value: row };
}

export function removeAttachment(db: DB, actor: Actor, agreementId: string, attachmentId: string, now = new Date()): Result {
  const e = editable(db, actor, agreementId);
  if (!e.ok) return e;
  const refs = e.value.version.attachmentRefs.filter((r) => r.id !== attachmentId);
  if (refs.length === e.value.version.attachmentRefs.length) return fail("That attachment isn't part of the current version.");
  db.transaction((tx) => {
    tx.update(agreementVersions).set({ attachmentRefs: refs, contentHash: contentHash(e.value.data, e.value.version.templateSnapshot, refs) }).where(eq(agreementVersions.id, e.value.version.id)).run();
    // The file itself is kept (earlier versions may still reference it); it is only detached from this version.
    touch(tx as unknown as DB, agreementId, now, e.value.agreement.status === "awaiting_review" ? { status: "draft" } : {});
  });
  recordEvent(db, { agreementId, versionId: e.value.version.id, type: "attachment.removed", actorType: "user", actorRef: actor.id, metadata: { attachmentId } }, now);
  return { ok: true, value: true };
}

/** Authorized read of one stored file. Returns null unless the actor may see the agreement and the file belongs to it. */
export function readAttachment(db: DB, actor: Actor, agreementId: string, attachmentId: string): { row: AttachmentRow; bytes: Buffer } | null {
  if (!accessLevel(db, actor, agreementId)) return null;
  const row = db.select().from(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.agreementId, agreementId))).get();
  if (!row || row.deletedAt) return null;
  return { row, bytes: getFile(row.storageKey) };
}

/* ---------------- documents ---------------- */

export function documentForVersion(db: DB, agreement: AgreementRow, version: VersionRow, opts: { draft: boolean }): BuiltDocument {
  return buildDocument({
    agreementId: agreement.id,
    versionNo: version.versionNo,
    data: versionData(version),
    snapshot: version.templateSnapshot,
    attachments: attachmentInfos(db, version.attachmentRefs),
    draft: opts.draft,
  });
}

export function readiness(db: DB, b: Pick<AgreementBundle, "agreement" | "version" | "data">): Issue[] {
  return readinessIssues(b.data, { snapshot: b.version.templateSnapshot, attachments: attachmentInfos(db, b.version.attachmentRefs), agreementId: b.agreement.id, versionNo: b.version.versionNo });
}

/* ---------------- review step ---------------- */

export function submitForReview(db: DB, actor: Actor, agreementId: string, now = new Date()): Result<Issue[]> {
  const e = editable(db, actor, agreementId);
  if (!e.ok) return e;
  if (e.value.agreement.status !== "draft") return fail("Only drafts can be submitted for review.");
  const issues = readiness(db, e.value);
  if (issues.length) return { ok: false, error: `${issues.length} item${issues.length === 1 ? "" : "s"} still need attention before this can be submitted.`, fields: Object.fromEntries(issues.map((i, n) => [`${n}`, `${i.step}: ${i.message}`])) };
  const v = e.value.version;
  db.update(agreementVersions).set({ contentHash: contentHash(e.value.data, v.templateSnapshot, v.attachmentRefs) }).where(eq(agreementVersions.id, v.id)).run();
  touch(db, agreementId, now, { status: "awaiting_review" });
  recordEvent(db, { agreementId, versionId: v.id, type: "agreement.submitted_for_review", actorType: "user", actorRef: actor.id }, now);
  return { ok: true, value: [] };
}

export function returnToDraft(db: DB, actor: Actor, agreementId: string, now = new Date()): Result {
  const e = editable(db, actor, agreementId);
  if (!e.ok) return e;
  if (e.value.agreement.status !== "awaiting_review") return fail("This agreement isn't awaiting review.");
  touch(db, agreementId, now, { status: "draft" });
  recordEvent(db, { agreementId, versionId: e.value.version.id, type: "agreement.returned_to_draft", actorType: "user", actorRef: actor.id, metadata: { reason: "returned by user" } }, now);
  return { ok: true, value: true };
}

export { touch as touchAgreement };
