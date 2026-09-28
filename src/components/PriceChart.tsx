"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

export interface PricePoint {
  at: string;
  price: number;
  sellerCount?: number | null;
}

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Tip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PricePoint;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm">
      <div className="font-semibold">{new Date(p.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
      <div className="num">{usd(p.price)}</div>
      {typeof p.sellerCount === "number" && <div className="text-muted">{p.sellerCount} sellers</div>}
    </div>
  );
}

/** One series (Amazon selling price) with the 90-day average as a reference line. */
export function PriceChart({ points, avg90 }: { points: PricePoint[]; avg90: number | null }) {
  if (points.length < 2) return <p className="text-sm text-muted">At least two price observations are needed for a chart.</p>;
  const data = [...points].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div>
      <div className="h-56 w-full" role="img" aria-label={`Amazon selling price over time, ${data.length} observations. A table view follows.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="at" tickFormatter={day} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={(v: number) => `$${v}`} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={56} domain={["auto", "auto"]} />
            <Tooltip content={Tip} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
            {avg90 !== null && (
              <ReferenceLine y={avg90} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: `90-day avg ${usd(avg90)}`, position: "insideTopLeft", fill: "var(--muted)", fontSize: 12 }} />
            )}
            <Line type="monotone" dataKey="price" name="Selling price" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 1 }} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-muted">Table view</summary>
        <div className="overflow-x-auto">
          <table className="data mt-2">
            <thead>
              <tr>
                <th>Observed</th>
                <th className="r">Price</th>
                <th className="r">Sellers</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p, i) => (
                <tr key={i}>
                  <td>{new Date(p.at).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                  <td className="r">{usd(p.price)}</td>
                  <td className="r">{p.sellerCount ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
