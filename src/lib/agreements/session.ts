/** Server-only glue between Next's cookies/headers and the agreements user/session code. */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import type { Actor } from "./permissions";
import { canAdminister } from "./permissions";
import { logout, SESSION_COOKIE_NAME, userForSession, type UserRow } from "./users";

export async function clientContext(): Promise<{ ip: string | null; userAgent: string | null; https: boolean }> {
  const h = await headers();
  // Behind a trusted proxy (Render, nginx) the first X-Forwarded-For hop is the client.
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent"), https: h.get("x-forwarded-proto") === "https" || process.env.NODE_ENV === "production" };
}

export async function currentUser(): Promise<UserRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return userForSession(getDb(), token);
}

export async function requireUser(): Promise<UserRow> {
  const u = await currentUser();
  if (!u) redirect("/agreements/login");
  return u;
}

export async function requireAdmin(): Promise<UserRow> {
  const u = await requireUser();
  if (!canAdminister(u.role as Actor["role"])) redirect("/agreements");
  return u;
}

export const actorFor = (u: UserRow): Actor => ({ id: u.id, role: u.role as Actor["role"] });

export async function setSessionCookie(token: string) {
  const ctx = await clientContext();
  (await cookies()).set(SESSION_COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: ctx.https, path: "/", maxAge: 60 * 60 * 12 });
}

export async function endSession() {
  const jar = await cookies();
  logout(getDb(), jar.get(SESSION_COOKIE_NAME)?.value);
  jar.delete(SESSION_COOKIE_NAME);
}

export const SIGNER_COOKIE = "mc_sign";

export async function setSignerCookie(value: string) {
  const ctx = await clientContext();
  (await cookies()).set(SIGNER_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: ctx.https, path: "/sign", maxAge: 60 * 30 });
}
export async function getSignerCookie() {
  return (await cookies()).get(SIGNER_COOKIE)?.value;
}
