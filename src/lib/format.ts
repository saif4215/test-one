export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "Unknown";
  return usd.format(n);
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "Unknown";
  return `${n.toFixed(digits)}%`;
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "Unknown";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtRange(low: number | null, high: number | null, digits = 1, unit = ""): string {
  if (low === null || high === null) return "Unknown";
  const s = low === high ? fmtNum(low, digits) : `${fmtNum(low, digits)}–${fmtNum(high, digits)}`;
  return unit ? `${s} ${unit}` : s;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "No timestamp";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No timestamp";
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** Parses user input like "$1,234.50" or "12%" into a number, or null. */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[$,%\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
