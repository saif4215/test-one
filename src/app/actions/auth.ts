"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { appPassword, safeEqual, safeNextPath, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth/session";
import { fStr } from "@/lib/forms";

async function isHttps() {
  const h = await headers();
  return h.get("x-forwarded-proto") === "https";
}

export async function loginAction(formData: FormData) {
  const password = appPassword();
  const next = safeNextPath(fStr(formData, "next"));
  if (!password) redirect(next);
  const attempt = String(formData.get("password") ?? "");
  if (!safeEqual(attempt, password)) {
    // Slow down repeated guesses.
    await new Promise((r) => setTimeout(r, 800));
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(SESSION_COOKIE, sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(next);
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
