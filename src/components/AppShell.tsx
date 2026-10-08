"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MobileNav, Sidebar } from "./Sidebar";

/**
 * The reselling app's sidebar frame. The purchase-agreement pages (/agreements, /sign)
 * bring their own chrome so buyers and sellers never see unrelated navigation.
 */
export function AppShell({ authEnabled, children }: { authEnabled: boolean; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/agreements" || pathname.startsWith("/agreements/") || pathname.startsWith("/sign/")) return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      <Sidebar authEnabled={authEnabled} />
      <div className="min-w-0 flex-1">
        <MobileNav authEnabled={authEnabled} />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
