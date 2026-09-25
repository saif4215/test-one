import { notFound } from "next/navigation";
import { connection } from "next/server";
import { deletePoAction, setPoStatusAction } from "@/app/actions/operations";
import { Card, Disclaimer, PageHeader, Pill, Stat, TableWrap } from "@/components/ui";
import { poTotals } from "@/lib/calc/ledger";
import { getDb } from "@/lib/db/client";
import { fmtPct, fmtUSD } from "@/lib/format";
import { getPurchaseOrder } from "@/lib/repo/operations";

const TONE: Record<string, "neutral" | "info" | "good" | "bad"> = { draft: "neutral", ordered: "info", received: "good", cancelled: "bad" };

export default async function PurchaseOrderPage({ params }: PageProps<"/purchase-orders/[id]">) {
  await connection();
  const { id: idParam } = await params;
  const id = Number(idParam);
  const po = Number.isInteger(id) ? getPurchaseOrder(getDb(), id) : null;
  if (!po) notFound();
  const t = poTotals(po.lines, po.shipping, po.otherCosts);

  return (
    <>
      <PageHeader
        title={po.poNumber}
        subtitle={`${po.supplierName} · ${po.date}`}
        actions={
          <>
            {po.status === "draft" && (
              <form action={setPoStatusAction.bind(null, id, "ordered")}>
                <button className="btn" type="submit">Mark ordered</button>
              </form>
            )}
            {(po.status === "draft" || po.status === "ordered") && (
              <>
                <form action={setPoStatusAction.bind(null, id, "received")}>
                  <button className="btn btn-secondary" type="submit">Receive into inventory</button>
                </form>
                <form action={setPoStatusAction.bind(null, id, "cancelled")}>
                  <button className="btn btn-danger" type="submit">Cancel</button>
                </form>
              </>
            )}
          </>
        }
      />
      <div className="mb-4">
        <Pill tone={TONE[po.status] ?? "neutral"}>{po.status}</Pill>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total cost" value={fmtUSD(t.totalCost)} hint={`${fmtUSD(t.subtotal)} + ${fmtUSD(t.shipping)} shipping + ${fmtUSD(t.otherCosts)} other`} />
        <Stat label="Expected revenue" value={fmtUSD(t.expectedRevenue)} hint="Estimate" />
        <Stat label="Estimated profit" value={fmtUSD(t.estimatedProfit)} hint="Estimate" />
        <Stat label="Expected ROI" value={fmtPct(t.expectedRoiPct, 1)} hint="Estimated profit ÷ total cost" />
      </div>
      <div className="mt-5">
        <Card title="Lines">
          <TableWrap>
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU / ASIN</th>
                  <th className="r">Qty</th>
                  <th className="r">Unit cost</th>
                  <th className="r">Subtotal</th>
                  <th className="r">Landed cost / unit</th>
                  <th className="r">Exp. sale</th>
                  <th className="r">Exp. fees / unit</th>
                  <th className="r">Est. profit</th>
                </tr>
              </thead>
              <tbody>
                {t.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.product}</td>
                    <td className="text-muted">{[l.sku, l.asin].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="r">{l.quantity}</td>
                    <td className="r">{fmtUSD(l.unitCost)}</td>
                    <td className="r">{fmtUSD(l.lineSubtotal)}</td>
                    <td className="r">{fmtUSD(l.landedUnitCost)}</td>
                    <td className="r">{fmtUSD(l.expectedSalePrice)}</td>
                    <td className="r">{fmtUSD(l.expectedFeesPerUnit)}</td>
                    <td className="r">{fmtUSD(l.expectedProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {po.notes && <p className="mt-3 text-sm">Notes: {po.notes}</p>}
        </Card>
      </div>
      <div className="no-print mt-6 flex flex-wrap items-center justify-between gap-3">
        <Disclaimer />
        <form action={deletePoAction.bind(null, id)}>
          <button className="btn btn-danger" type="submit">Delete PO</button>
        </form>
      </div>
    </>
  );
}
