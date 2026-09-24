import Link from "next/link";
import type { ReactNode } from "react";
import { DATA_KIND_LABEL, type DataKind } from "@/lib/data/provenance";
import { fmtDateTime } from "@/lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
  className = "",
  id,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-lg border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Scroll container so wide tables never force the page to scroll sideways. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4">{children}</div>;
}

const KIND_STYLE: Record<DataKind, string> = {
  VERIFIED: "bg-good-bg text-good",
  USER_PROVIDED: "bg-info-bg text-info",
  THIRD_PARTY: "bg-violet-bg text-violet",
  ESTIMATED: "bg-warn-bg text-warn",
  ASSUMPTION: "bg-surface-2 text-muted",
  UNKNOWN: "bg-bad-bg text-bad",
};

export function KindBadge({ kind }: { kind: DataKind }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${KIND_STYLE[kind]}`}>
      {DATA_KIND_LABEL[kind]}
    </span>
  );
}

export type Tone = "good" | "bad" | "warn" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  good: "bg-good-bg text-good",
  bad: "bg-bad-bg text-bad",
  warn: "bg-warn-bg text-warn",
  info: "bg-info-bg text-info",
  neutral: "bg-surface-2 text-muted",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[tone]}`}>{children}</span>;
}

export function riskTone(level: string): Tone {
  return level === "LOW" ? "good" : level === "MEDIUM" ? "warn" : level === "HIGH" ? "bad" : "neutral";
}

export function statusTone(status: string): Tone {
  return status === "PASS" ? "good" : status === "FAIL" ? "bad" : status === "NEEDS DATA" || status === "UNKNOWN" ? "warn" : "neutral";
}

export function confidenceTone(level: string): Tone {
  return level.startsWith("HIGH") ? "good" : level.startsWith("MODERATE") ? "info" : level.startsWith("LOW") ? "warn" : "bad";
}

export function Notice({ tone = "info", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <div className={`rounded-md px-3 py-2 text-sm ${TONE[tone]}`} role="note">
      {title && <strong className="mr-1">{title}</strong>}
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Timestamp({ iso }: { iso?: string | null }) {
  return <span className="text-xs text-muted">{fmtDateTime(iso)}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-xl text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  name,
  hint,
  children,
  className = "",
}: {
  label: string;
  name?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`} htmlFor={name}>
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function NumberInput({
  name,
  defaultValue,
  step = "any",
  placeholder,
  min,
}: {
  name: string;
  defaultValue?: number | null;
  step?: string;
  placeholder?: string;
  min?: number;
}) {
  return (
    <input
      id={name}
      name={name}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      defaultValue={defaultValue ?? ""}
      placeholder={placeholder ?? "Unknown"}
      className="input num"
    />
  );
}

export function TextInput({
  name,
  defaultValue,
  placeholder,
  type = "text",
  required,
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return <input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} className="input" required={required} />;
}

/** Yes / No / Unknown select for flags that may not be known yet. */
export function TriSelect({ name, value }: { name: string; value: boolean | null }) {
  return (
    <select id={name} name={name} defaultValue={value === null ? "" : value ? "yes" : "no"} className="input">
      <option value="">Unknown</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link href={href} className={`btn ${variant === "secondary" ? "btn-secondary" : ""}`}>
      {children}
    </Link>
  );
}

export function Disclaimer() {
  return (
    <p className="text-xs text-muted">
      Estimates only, not a guarantee of sales, profit, or Buy Box share. Check Amazon&apos;s current fees, policies, and
      restrictions before you buy. The final purchasing decision is yours.
    </p>
  );
}
