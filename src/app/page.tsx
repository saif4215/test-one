import Link from "next/link";
import { connection } from "next/server";
import { NAV } from "@/components/nav";
import { Card, LinkButton, Notice } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { listAlerts } from "@/lib/repo/operations";
import { getSettings, listProducts } from "@/lib/repo/products";

export default async function Home() {
  await connection();
  const db = getDb();
  const s = getSettings(db);
  const productCount = listProducts(db).length;
  const unread = listAlerts(db, { unreadOnly: true }).length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">AMAZON RESELLING AI</h1>
        <p className="mt-1 max-w-3xl text-muted">
          A research assistant that helps you discover, verify, calculate, compare, track, and monitor legitimate Amazon reselling
          opportunities, and shows the evidence behind every number. The purchasing decision is always yours.
        </p>
      </div>

      {!s.onboarded && (
        <div className="mb-6">
          <Card title="Amazon Reselling System ready: let's set it up">
            <p className="text-sm">
              Answer a few questions (budget, marketplace, FBA/FBM, sourcing methods, profit and ROI targets, categories to sell and
              avoid, seller account, suppliers) so every analysis uses your numbers.
            </p>
            <div className="mt-3">
              <LinkButton href="/settings">Start setup</LinkButton>
            </div>
          </Card>
        </div>
      )}

      <Card className="mb-6">
        <form action="/analyze" className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="home-q" className="sr-only">ASIN, UPC, URL, or product name</label>
          <input id="home-q" name="q" className="input flex-1" placeholder="Analyze an ASIN, UPC, URL, or product name" />
          <button className="btn" type="submit">Analyze</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span>{productCount} products researched</span>
          <Link href="/alerts" className={unread ? "font-semibold text-accent" : ""}>{unread} unread alerts</Link>
          <span>
            Targets: ${s.targetMinProfit} profit · {s.targetRoiPct}% ROI
          </span>
        </div>
      </Card>

      <div className="space-y-6">
        {NAV.map((g) => (
          <section key={g.label}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
                >
                  <div className="font-semibold">{i.label}</div>
                  <div className="mt-1 text-sm text-muted">{i.description}</div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8">
        <Notice tone="neutral">
          This app never recommends counterfeit or stolen goods, fake invoices or reviews, review manipulation, or deceptive listings.
          Fees, restrictions, and policies change: always check them against Amazon&apos;s current rules.
        </Notice>
      </div>
    </>
  );
}
