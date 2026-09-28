import Link from "next/link";
import { connection } from "next/server";
import { deleteAlertAction, markAlertReadAction, markAllReadAction, runDealFinderAction } from "@/app/actions/alerts";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { fmtDateTime } from "@/lib/format";
import { listAlerts } from "@/lib/repo/operations";

const TYPE_LABEL: Record<string, string> = {
  criteria_met: "Meets criteria",
  criteria_lost: "No longer meets criteria",
  profit_increase: "Profit increase",
  profit_decrease: "Profit decrease",
  purchase_price_drop: "Purchase price drop",
  sale_price_increase: "Selling price increase",
  seller_count_change: "Seller count change",
  price_above_average: "Price above average",
  stale_data: "Stale data",
  low_inventory: "Low inventory",
  supplier_price_change: "Supplier price change",
  reorder_point: "Reorder point",
};

export default async function AlertsPage() {
  await connection();
  const alerts = listAlerts(getDb());
  const unread = alerts.filter((a) => !a.read).length;
  return (
    <>
      <PageHeader
        title="Deal Alerts"
        subtitle="The Deal Finder re-checks your saved products against your criteria and their last snapshot, and alerts you to meaningful changes. Every alert shows its data source and data timestamp. Alerts are estimates unless the data is Verified."
        actions={
          <>
            <form action={runDealFinderAction}>
              <button className="btn" type="submit">Run Deal Finder now</button>
            </form>
            {unread > 0 && (
              <form action={markAllReadAction}>
                <button className="btn btn-secondary" type="submit">Mark all read</button>
              </form>
            )}
          </>
        }
      />
      <p className="mb-4 text-sm text-muted">
        To run it daily, schedule <code>npm run deal-finder</code> (or keep <code>npm run deal-finder -- --schedule</code> running). See the README. The
        Deal Finder only uses data you&apos;ve recorded or that a connected source provides; it never scrapes websites.
      </p>
      {alerts.length === 0 ? (
        <EmptyState title="No alerts yet">Run the Deal Finder after you&apos;ve analyzed or imported some products.</EmptyState>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <Card key={a.id} className={a.read ? "opacity-70" : ""}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    {!a.read && <Pill tone="info">New</Pill>}
                    <Pill>{TYPE_LABEL[a.type] ?? a.type}</Pill>
                    <span className="font-semibold">
                      {a.productId ? (
                        <Link className="text-accent hover:underline" href={`/products/${a.productId}`}>{a.title}</Link>
                      ) : (
                        a.title
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{a.message}</p>
                  <p className="mt-1 text-xs text-muted">
                    Data source: {a.dataSource} · Data timestamp: {fmtDateTime(a.dataTimestamp)} · Alert created: {fmtDateTime(a.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={markAlertReadAction.bind(null, a.id, !a.read)}>
                    <button className="btn btn-secondary btn-sm" type="submit">{a.read ? "Mark unread" : "Mark read"}</button>
                  </form>
                  <form action={deleteAlertAction.bind(null, a.id)}>
                    <button className="btn btn-danger btn-sm" type="submit" aria-label="Delete alert">Delete</button>
                  </form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
