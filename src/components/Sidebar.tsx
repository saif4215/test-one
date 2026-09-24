"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-5">
      {NAV.map((g) => (
        <div key={g.label}>
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</div>
          <ul>
            {g.items.map((i) => {
              const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-1.5 text-sm ${
                      active ? "bg-accent text-accent-fg font-semibold" : "hover:bg-surface-2"
                    }`}
                  >
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-border bg-surface px-3 py-5 lg:block">
      <Link href="/" className="mb-6 block px-3">
        <span className="block text-base font-bold tracking-tight">Amazon Reselling AI</span>
        <span className="block text-xs text-muted">Research · Verify · Track</span>
      </Link>
      <NavLinks />
    </aside>
  );
}

export function MobileNav() {
  return (
    <details className="no-print group border-b border-border bg-surface lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
        <span className="font-bold">Amazon Reselling AI</span>
        <span className="rounded-md border border-border px-2 py-1 text-sm">Menu</span>
      </summary>
      <div className="max-h-[70vh] overflow-y-auto px-2 pb-4">
        <Link href="/" className="mb-3 block rounded-md px-3 py-1.5 text-sm hover:bg-surface-2">
          Home
        </Link>
        <NavLinks
          onNavigate={() => {
            document.querySelector<HTMLDetailsElement>("details[open]")?.removeAttribute("open");
          }}
        />
      </div>
    </details>
  );
}
