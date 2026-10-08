/** Money is entered and stored as decimal strings ("12500.00") and computed in integer cents. */

export function parseCents(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return s.startsWith("-") ? -cents : cents;
}

export function centsToString(c: number): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Formats a decimal string as USD, or returns null when it isn't a valid amount. */
export function formatMoney(v: string | null | undefined): string | null {
  const c = parseCents(v);
  return c === null ? null : usd.format(c / 100);
}

export function formatCents(c: number): string {
  return usd.format(c / 100);
}

export function sumCents(values: Array<string | null | undefined>): number {
  return values.reduce<number>((t, v) => t + (parseCents(v) ?? 0), 0);
}

/** Total price minus deposit, or null when either is missing or the deposit exceeds the price. */
export function remainingBalance(total: string | null | undefined, deposit: string | null | undefined): number | null {
  const t = parseCents(total);
  if (t === null) return null;
  const d = deposit === undefined || deposit === null || String(deposit).trim() === "" ? 0 : parseCents(deposit);
  if (d === null || d > t || d < 0) return null;
  return t - d;
}
