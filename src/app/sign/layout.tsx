import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review and sign — Maruf Cafe agreement",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <span className="block text-base font-bold tracking-tight">Maruf Cafe</span>
            <span className="block text-xs text-muted">Secure document signing</span>
          </div>
          <span className="text-xs text-muted">🔒 Private link — do not forward</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
