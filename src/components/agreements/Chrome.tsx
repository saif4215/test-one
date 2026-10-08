import Link from "next/link";
import { logoutAction } from "@/app/actions/agreements";
import { ROLE_LABEL, type Role } from "@/lib/agreements/permissions";
import type { UserRow } from "@/lib/agreements/users";

export function Chrome({ user, children }: { user: UserRow | null; children: React.ReactNode }) {
  const links = user
    ? [
        { href: "/agreements", label: "Dashboard" },
        ...(user.role !== "seller" ? [{ href: "/agreements/new", label: "New agreement" }] : []),
        { href: "/agreements/completed", label: "Completed" },
        ...(user.role === "admin" ? [{ href: "/agreements/admin", label: "Admin" }] : []),
        { href: "/agreements/account", label: "Account" },
      ]
    : [];
  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/agreements" className="min-w-0">
            <span className="block text-base font-bold tracking-tight">Maruf Cafe</span>
            <span className="block text-xs text-muted">Business purchase agreements</span>
          </Link>
          {user && (
            <nav aria-label="Agreements" className="order-3 w-full overflow-x-auto sm:order-none sm:w-auto">
              <ul className="flex gap-1 text-sm">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="block whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-surface-2">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {user && (
            <form action={logoutAction} className="flex items-center gap-3 text-sm">
              <span className="hidden text-muted sm:inline">
                {user.name} · {ROLE_LABEL[user.role as Role]}
              </span>
              <button type="submit" className="btn btn-secondary btn-sm">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
      <footer className="no-print mx-auto max-w-6xl px-4 pb-10 text-xs text-muted sm:px-6 lg:px-8">
        This application generates a customizable template and is not a substitute for legal advice.
      </footer>
    </div>
  );
}
