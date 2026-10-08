import { and, eq, gt } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { userSessions, users } from "@/lib/db/schema";
import type { Role } from "./permissions";
import { isRole } from "./permissions";
import { hashPassword, newId, passwordProblem, randomToken, sha256Hex, verifyPassword } from "./security";

export type UserRow = typeof users.$inferSelect;

export const SESSION_COOKIE_NAME = "mc_session";
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Invites a user. The one-time invite token is returned once; only its hash is stored. */
export function inviteUser(db: DB, input: { email: string; name: string; role: Role }, now = new Date()): Result<{ user: UserRow; inviteToken: string }> {
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (!input.name.trim()) return { ok: false, error: "Enter the person's name." };
  if (!isRole(input.role)) return { ok: false, error: "Choose a role." };
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  const token = randomToken();
  const inviteExpiresAt = new Date(now.getTime() + INVITE_LIFETIME_MS).toISOString();
  if (existing) {
    if (existing.status === "disabled") return { ok: false, error: "That account is disabled. Enable it first." };
    // Inviting an existing address sends a fresh link: for someone not yet activated it renews the invitation,
    // for an active user it works as a password reset. Their role and access are left as they are.
    db.update(users).set({ inviteTokenHash: sha256Hex(token), inviteExpiresAt, ...(existing.status === "invited" ? { name: input.name.trim(), role: input.role } : {}) }).where(eq(users.id, existing.id)).run();
    return { ok: true, value: { user: { ...existing, ...(existing.status === "invited" ? { role: input.role, name: input.name.trim() } : {}) }, inviteToken: token } };
  }
  const row: UserRow = {
    id: newId(),
    email,
    name: input.name.trim(),
    role: input.role,
    status: "invited",
    passwordHash: null,
    inviteTokenHash: sha256Hex(token),
    inviteExpiresAt,
    failedLogins: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: now.toISOString(),
  };
  db.insert(users).values(row).run();
  return { ok: true, value: { user: row, inviteToken: token } };
}

export function findInvite(db: DB, token: string, now = new Date()): UserRow | null {
  if (!token) return null;
  const u = db.select().from(users).where(eq(users.inviteTokenHash, sha256Hex(token))).get();
  if (!u || (u.status !== "invited" && u.status !== "active") || !u.inviteExpiresAt || new Date(u.inviteExpiresAt) < now) return null;
  return u;
}

export async function acceptInvite(db: DB, token: string, password: string, now = new Date()): Promise<Result<UserRow>> {
  const u = findInvite(db, token, now);
  if (!u) return { ok: false, error: "This invitation is invalid or has expired. Ask an administrator for a new one." };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  const passwordHash = await hashPassword(password);
  db.update(users).set({ passwordHash, status: "active", inviteTokenHash: null, inviteExpiresAt: null, failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id)).run();
  revokeSessions(db, u.id); // a reset signs the person out everywhere
  return { ok: true, value: { ...u, status: "active", passwordHash } };
}

/** Creates (or resets) an active administrator. Used by the setup script. */
export async function bootstrapAdmin(db: DB, email: string, name: string, password: string, now = new Date()): Promise<Result<UserRow>> {
  const e = normalizeEmail(email);
  if (!isEmail(e)) return { ok: false, error: "Enter a valid email address." };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  const passwordHash = await hashPassword(password);
  const existing = db.select().from(users).where(eq(users.email, e)).get();
  if (existing) {
    db.update(users).set({ passwordHash, status: "active", role: "admin", failedLogins: 0, lockedUntil: null }).where(eq(users.id, existing.id)).run();
    return { ok: true, value: { ...existing, role: "admin", status: "active", passwordHash } };
  }
  const row: UserRow = {
    id: newId(), email: e, name: name.trim() || e, role: "admin", status: "active", passwordHash,
    inviteTokenHash: null, inviteExpiresAt: null, failedLogins: 0, lockedUntil: null, lastLoginAt: null, createdAt: now.toISOString(),
  };
  db.insert(users).values(row).run();
  return { ok: true, value: row };
}

/** One generic error for every failure so the form never reveals which emails have accounts. */
const BAD_LOGIN = "That email and password combination didn't work.";

export async function login(
  db: DB,
  email: string,
  password: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
  now = new Date(),
): Promise<Result<{ token: string; user: UserRow }>> {
  const u = db.select().from(users).where(eq(users.email, normalizeEmail(email))).get();
  if (u?.lockedUntil && new Date(u.lockedUntil) > now) {
    return { ok: false, error: "Too many failed attempts. Try again in a few minutes." };
  }
  const good = await verifyPassword(password, u?.passwordHash ?? null);
  if (!u || !good || u.status !== "active") {
    if (u) {
      const failed = u.failedLogins + 1;
      db.update(users)
        .set(failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MS).toISOString() } : { failedLogins: failed })
        .where(eq(users.id, u.id))
        .run();
    }
    return { ok: false, error: BAD_LOGIN };
  }
  const token = randomToken();
  db.insert(userSessions)
    .values({
      tokenHash: sha256Hex(token),
      userId: u.id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(),
      lastSeenAt: now.toISOString(),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
    })
    .run();
  db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now.toISOString() }).where(eq(users.id, u.id)).run();
  return { ok: true, value: { token, user: u } };
}

export function userForSession(db: DB, token: string | undefined, now = new Date()): UserRow | null {
  if (!token) return null;
  const hash = sha256Hex(token);
  const s = db.select().from(userSessions).where(eq(userSessions.tokenHash, hash)).get();
  if (!s) return null;
  const expired = new Date(s.expiresAt) < now || now.getTime() - new Date(s.lastSeenAt).getTime() > SESSION_IDLE_MS;
  if (expired) {
    db.delete(userSessions).where(eq(userSessions.tokenHash, hash)).run();
    return null;
  }
  const u = db.select().from(users).where(and(eq(users.id, s.userId), eq(users.status, "active"))).get();
  if (!u) return null;
  if (now.getTime() - new Date(s.lastSeenAt).getTime() > 60_000) {
    db.update(userSessions).set({ lastSeenAt: now.toISOString() }).where(eq(userSessions.tokenHash, hash)).run();
  }
  return u;
}

export function logout(db: DB, token: string | undefined): void {
  if (token) db.delete(userSessions).where(eq(userSessions.tokenHash, sha256Hex(token))).run();
}

export function revokeSessions(db: DB, userId: string, exceptToken?: string): void {
  const keep = exceptToken ? sha256Hex(exceptToken) : null;
  const rows = db.select().from(userSessions).where(eq(userSessions.userId, userId)).all();
  for (const r of rows) if (r.tokenHash !== keep) db.delete(userSessions).where(eq(userSessions.tokenHash, r.tokenHash)).run();
}

export async function changePassword(db: DB, userId: string, current: string, next: string, sessionToken?: string): Promise<Result<true>> {
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (!u || !(await verifyPassword(current, u.passwordHash))) return { ok: false, error: "Your current password isn't right." };
  const problem = passwordProblem(next);
  if (problem) return { ok: false, error: problem };
  db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId)).run();
  revokeSessions(db, userId, sessionToken); // sign out other devices
  return { ok: true, value: true };
}

export function listUsers(db: DB): UserRow[] {
  return db.select().from(users).all().sort((a, b) => a.name.localeCompare(b.name));
}

export function getUser(db: DB, id: string): UserRow | null {
  return db.select().from(users).where(eq(users.id, id)).get() ?? null;
}

export function setUserRole(db: DB, id: string, role: Role): void {
  db.update(users).set({ role }).where(eq(users.id, id)).run();
}

export function setUserDisabled(db: DB, id: string, disabled: boolean): void {
  db.update(users).set({ status: disabled ? "disabled" : "active" }).where(eq(users.id, id)).run();
  if (disabled) db.delete(userSessions).where(eq(userSessions.userId, id)).run();
}

export function countActiveAdmins(db: DB): number {
  return db.select().from(users).where(and(eq(users.role, "admin"), eq(users.status, "active"))).all().length;
}

export function purgeExpiredSessions(db: DB, now = new Date()): void {
  const rows = db.select().from(userSessions).where(gt(userSessions.expiresAt, "")).all();
  for (const r of rows) if (new Date(r.expiresAt) < now) db.delete(userSessions).where(eq(userSessions.tokenHash, r.tokenHash)).run();
}

/**
 * First-run convenience for hosts where you can't run a script (for example the Docker image):
 * when there are no users yet and BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD are set, the first
 * sign-in attempt creates that administrator. Remove both variables afterwards.
 */
export async function bootstrapFromEnv(db: DB, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const email = env.BOOTSTRAP_ADMIN_EMAIL;
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return false;
  if (db.select().from(users).limit(1).get()) return false;
  const res = await bootstrapAdmin(db, email, env.BOOTSTRAP_ADMIN_NAME || "Administrator", password);
  return res.ok;
}
