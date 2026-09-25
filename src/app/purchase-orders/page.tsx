import Link from "next/link";
import { connection } from "next/server";
import { Card, EmptyState, LinkButton, PageHeader, Pill, TableWrap } from "@/components/ui";
import { poTotals } from "@/lib/calc/ledger";
import { getDb } from "@/lib/db/client";
import { fmtPct, fmtUSD } from "@/lib/format";
import { listPurchaseOrders } from "@/lib/repo/operations";

const PO_STATUS_TONE: Record<string, "neutral" | "info" | "good" | "bad"> = {
  draft: "neutral",
  ordered: "info",
  received: "good",
  cancelled: "bad",
};

export default async function PurchaseOrdersPage() {
  await connection();
  const pos = listPurchaseOrders(getDb());
  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Landed cost per unit, expected revenue, and estimated ROI for every order. Receiving an order adds it to inventory and to cash flow."
        actions={<LinkButton href="/purchase-orders/new">New purchase order</LinkButton>}
      />
      {pos.length === 0 ? (
        <EmptyState title="No purchase orders yet" action={<LinkButton href="/purchase-orders/new">Create one</LinkButton>} />
      ) : (
        <Card>
          <TableWrap>
            <table className="data">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="r">Units</th>
                  <th className="r">Total cost</th>
                  <th className="r">Expected revenue</th>
                  <th className="r">Est. profit</th>
                  <th className="r">Est. ROI</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => {
                  const t = poTotals(po.lines, po.shipping, po.otherCosts);
                  return (
                    <tr key={po.id}>
                      <td>
                        <Link className="font-medium text-accent hover:underline" href={`/purchase-orders/${po.id}`}>{po.poNumber}</Link>
                      </td>
                      <td>{po.supplierName}</td>
                      <td>{po.date}</td>
                      <td><Pill tone={PO_STATUS_TONE[po.status] ?? "neutral"}>{po.status}</Pill></td>
                      <td className="r">{t.totalUnits}</td>
                      <td className="r">{fmtUSD(t.totalCost)}</td>
                      <td className="r">{fmtUSD(t.expectedRevenue)}</td>
                      <td className="r">{fmtUSD(t.estimatedProfit)}</td>
                      <td className="r">{fmtPct(t.expectedRoiPct, 1)}</td>
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
