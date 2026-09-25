import Link from "next/link";
import { connection } from "next/server";
import { Card, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { fmtDateTime, fmtNum, fmtUSD } from "@/lib/format";
import { listResearchLog } from "@/lib/repo/products";

interface Summary {
  profit: number | null;
  roiPct: number | null;
  confidence: string;
  risk: string;
  filterStatus: string;
  purchasePrice?: number | null;
  salePrice?: number | null;
  referralFee?: number | null;
  fulfillmentFee?: number | null;
  sellerCount?: number | null;
  salesRank?: number | null;
  ownMonthlySales?: string | null;
  assumptions?: string[];
}

export default async function ResearchLogPage({ searchParams }: PageProps<"/research-log">) {
  await connection();
  const sp = await searchParams;
  const pid = typeof sp.product === "string" ? Number(sp.product) : undefined;
  const entries = listResearchLog(getDb(), Number.isInteger(pid) ? pid : undefined).slice(0, 500);

  return (
    <>
      <PageHeader
        title="Research Log"
        subtitle="A snapshot of each analysis: when it happened, which data sources and fees it used, the sales indicators, the assumptions, and the result. Use it to compare a product over time."
      />
      {pid && (
        <p className="mb-4 text-sm">
          Showing one product. <Link className="text-accent underline" href="/research-log">Show all</Link>
        </p>
      )}
      {entries.length === 0 ? (
        <EmptyState title="No research logged yet">Analyzing or updating a product saves a snapshot here automatically.</EmptyState>
      ) : (
        <Card>
          <TableWrap>
            <table className="data">
              <thead>
                <tr>
                  <th>Researched</th>
                  <th>Product</th>
                  <th>Status</th>
                  <th className="r">Buy</th>
                  <th className="r">Sell</th>
                  <th className="r">Fees</th>
                  <th className="r">Profit</th>
                  <th className="r">ROI</th>
                  <th>Sales indicators</th>
                  <th>Confidence</th>
                  <th>Sources and assumptions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const s = e.summary as Summary;
                  const sources = e.dataSources as string[];
                  return (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                      <td className="min-w-40">
                        {e.productId ? (
                          <Link className="text-accent hover:underline" href={`/research-log?product=${e.productId}`}>{e.productName}</Link>
                        ) : (
                          e.productName
                        )}
                        {e.notes && <div className="text-xs text-muted">{e.notes}</div>}
                      </td>
                      <td>{e.status}</td>
                      <td className="r">{fmtUSD(s.purchasePrice)}</td>
                      <td className="r">{fmtUSD(s.salePrice)}</td>
                      <td className="r">{s.referralFee != null || s.fulfillmentFee != null ? fmtUSD((s.referralFee ?? 0) + (s.fulfillmentFee ?? 0)) : "Unknown"}</td>
                      <td className="r">{fmtUSD(s.profit)}</td>
                      <td className="r">{s.roiPct == null ? "Unknown" : `${fmtNum(s.roiPct, 1)}%`}</td>
                      <td className="text-xs">
                        {[s.salesRank != null ? `Rank #${fmtNum(s.salesRank)}` : null, s.sellerCount != null ? `${s.sellerCount} sellers` : null, s.ownMonthlySales ? `${s.ownMonthlySales}/mo est.` : null]
                          .filter(Boolean)
                          .join(" · ") || "Unknown"}
                      </td>
                      <td className="text-xs">{s.confidence}</td>
                      <td className="max-w-sm text-xs text-muted">
                        <details>
                          <summary className="cursor-pointer">{sources.length} sources</summary>
                          <ul className="mt-1 list-disc pl-4">
                            {sources.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                          {s.assumptions?.length ? (
                            <ul className="mt-1 list-disc pl-4">
                              {s.assumptions.map((x) => (
                                <li key={x}>{x}</li>
                              ))}
                            </ul>
                          ) : null}
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}
