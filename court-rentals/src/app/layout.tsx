import type { Metadata } from "next";
import Link from "next/link";
import { listYourSpaceMailto } from "../lib/booking";
import { site } from "../lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${site.name} — ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>

        {site.demoData ? (
          <p className="bg-accent px-4 py-1.5 text-center text-xs font-medium text-white">
            Demo site — the listings below are sample data, not real venues.
          </p>
        ) : null}

        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="text-lg font-bold tracking-tight text-brand">
              {site.name}
            </Link>
            <nav aria-label="Main" className="flex items-center gap-5 text-sm font-medium">
              <Link href="/rentals" className="hover:text-brand">
                Browse courts
              </Link>
              <a
                href={listYourSpaceMailto()}
                className="rounded-lg border border-line px-3 py-1.5 hover:border-brand hover:text-brand"
              >
                List your space
              </a>
            </nav>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-muted sm:px-6">
            <p className="font-medium text-ink">{site.name}</p>
            <p>{site.description}</p>
            <p>© {new Date().getFullYear()} {site.name}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
