/**
 * Optional password protection. When APP_PASSWORD is set, every page needs
 * a session cookie. The cookie value is an HMAC of a fixed label keyed by
 * the password, so changing the password logs everyone out. The password
 * itself is never stored in the cookie.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "rai_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function appPassword(env: NodeJS.ProcessEnv = process.env): string | null {
  const p = env.APP_PASSWORD;
  return p && p.length > 0 ? p : null;
}

export function sessionToken(password: string): string {
  return createHmac("sha256", password).update("amazon-reselling-ai/session/v1").digest("hex");
}

/** Constant-time string comparison (hashing first so the lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function isValidSession(cookieValue: string | undefined, password: string | null): boolean {
  if (!password) return true;
  if (!cookieValue) return false;
  return safeEqual(cookieValue, sessionToken(password));
}

/** Only allow redirects to paths on this site (no "//host" or absolute URLs). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
