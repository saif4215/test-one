import { NextResponse, type NextRequest } from "next/server";
import { appPassword, isValidSession, SESSION_COOKIE } from "@/lib/auth/session";

/** Requires a login when APP_PASSWORD is set; does nothing otherwise. */
export function proxy(request: NextRequest) {
  const password = appPassword();
  if (!password) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  // The login page, and the cron endpoint (which checks its own secret), stay reachable.
  if (pathname === "/login" || pathname === "/api/deal-finder") return NextResponse.next();
  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value, password)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
