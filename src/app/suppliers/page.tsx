import Link from "next/link";
import { connection } from "next/server";
import { SupplierForm } from "@/components/SupplierForm";
import { Card, EmptyState, Notice, PageHeader, TableWrap } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { fmtUSD } from "@/lib/format";
import { listSuppliers, type Supplier } from "@/lib/repo/operations";

const AUTH: Record<string, string> = {
  authorized: "Authorized / brand direct",
  retail: "Retailer",
  unverified: "Unverified",
  unknown: "Unknown",
};

const ROWS: { label: string; get: (s: Supplier) => string; note: string }[] = [
  { label: "Price", get: (s) => s.pricing ?? (s.currentPrice !== null ? fmtUSD(s.currentPrice) : "Unknown"), note: "Lower cost raises margin, but compare landed cost including shipping." },
  { label: "Price change", get: (s) => (s.lastPrice !== null && s.currentPrice !== null ? `${fmtUSD(s.lastPrice)} → ${fmtUSD(s.currentPrice)}` : "Unknown"), note: "Rising costs can erase thin margins." },
  { label: "MOQ", get: (s) => s.moq ?? "Unknown", note: "A high MOQ ties up capital and limits test buys." },
  { label: "Shipping", get: (s) => s.shippingTerms ?? "Unknown", note: "Affects landed cost per unit." },
  { label: "Lead time", get: (s) => (s.leadTimeDays !== null ? `${s.leadTimeDays} days` : "Unknown"), note: "Longer lead times need higher reorder points." },
  { label: "Payment terms", get: (s) => s.paymentTerms ?? "Unknown", note: "Net terms help cash flow; prepaid ties up cash." },
  { label: "Return policy", get: (s) => s.returnPolicy ?? "Unknown", note: "Matters for defective or unsellable units." },
  { label: "Invoices", get: (s) => (s.invoiceAvailable === null ? "Unknown" : s.invoiceAvailable ? "Yes" : "No"), note: "Amazon may ask for invoices to prove authenticity." },
  { label: "Authorization", get: (s) => AUTH[s.authorizationStatus] ?? s.authorizationStatus, note: "Authorized sources lower counterfeit and IP-complaint risk." },
  { label: "Reliability", get: (s) => s.reliabilityNotes ?? "No notes", note: "Your own record of on-time, accurate orders." },
];

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  await connection();
  const sp = await searchParams;
  const suppliers = listSuppliers(getDb());
  return (
    <>
      <PageHeader
        title="Track Suppliers"
        subtitle="Keep only information you've confirmed with the supplier. Anything not recorded shows as Unknown."
      />
      {typeof sp.error === "string" && (
        <div className="mb-4">
          <Notice tone="bad">{sp.error}</Notice>
        </div>
      )}
      {suppliers.length === 0 ? (
        <EmptyState title="No suppliers yet">Add authorized distributors, brands, wholesalers, or the retailers you source from.</EmptyState>
      ) : (
        <Card title="Supplier comparison (tradeoffs, no overall score)">
          <TableWrap>
            <table className="data">
              <thead>
                <tr>
                  <th>Factor</th>
                  {suppliers.map((s) => (
                    <th key={s.id}>
                      <Link className="text-accent hover:underline" href={`/suppliers/${s.id}`}>{s.name}</Link>
                    </th>
                  ))}
                  <th>Why it matters</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label}>
                    <td className="font-medium">{r.label}</td>
                    {suppliers.map((s) => (
                      <td key={s.id} className={r.get(s) === "Unknown" ? "text-muted" : ""}>{r.get(s)}</td>
                    ))}
                    <td className="text-xs text-muted">{r.note}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-medium">Contact</td>
                  {suppliers.map((s) => (
                    <td key={s.id} className="text-xs">
                      {[s.contact, s.location].filter(Boolean).join(" · ") || "—"}
                      {s.website && (
                        <div>
                          <a className="text-accent underline" href={s.website} target="_blank" rel="noopener noreferrer">Website</a>
                        </div>
                      )}
                    </td>
                  ))}
                  <td></td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
      <div className="mt-5">
        <Card title="Add supplier">
          <SupplierForm />
        </Card>
      </div>
    </>
  );
}
