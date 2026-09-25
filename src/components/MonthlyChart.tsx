"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { MonthPoint } from "@/lib/calc/metrics";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

const SERIES = [
  { key: "revenue", name: "Net revenue", color: "var(--series-1)" },
  { key: "profit", name: "Net profit", color: "var(--series-2)" },
] as const;

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm">
      <div className="mb-1 font-semibold">{monthLabel(String(label))} {String(label).slice(0, 4)}</div>
      {SERIES.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="text-muted">{s.name}</span>
            <span className="num ml-auto pl-4 font-medium">{typeof v === "number" ? usd2(v) : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

type LabelProps = { x?: number | string; y?: number | string; index?: number };

/** Direct label at the end of a line (plain render function, not a component). */
function renderEndLabel(props: LabelProps, name: string, last: number) {
  if (props.index !== last || props.x === undefined || props.y === undefined) return null;
  return (
    <text x={Number(props.x) + 6} y={Number(props.y)} dy={4} fontSize={12} fill="var(--muted)">
      {name}
    </text>
  );
}

export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  const last = data.length - 1;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-sm" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-4" style={{ background: s.color }} />
            <span className="text-muted">{s.name}</span>
          </span>
        ))}
      </div>
      <div className="h-64 w-full" role="img" aria-label="Monthly net revenue and net profit, last 12 months. A table view follows.">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 84, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <YAxis tickFormatter={usd} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                label={(props: LabelProps) => renderEndLabel(props, s.name, last)}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-muted">Table view</summary>
        <div className="overflow-x-auto">
          <table className="data mt-2">
            <thead>
              <tr>
                <th>Month</th>
                <th className="r">Net revenue</th>
                <th className="r">Net profit</th>
                <th className="r">Units sold</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month}>
                  <td>{d.month}</td>
                  <td className="r">{usd2(d.revenue)}</td>
                  <td className="r">{usd2(d.profit)}</td>
                  <td className="r">{d.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
