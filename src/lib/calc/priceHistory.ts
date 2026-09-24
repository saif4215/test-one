/**
 * Price history analysis (§13, §57).
 * History describes the past; it doesn't predict future prices.
 */

export interface PriceObservation {
  /** ISO date or timestamp. */
  at: string;
  price: number;
  sellerCount?: number | null;
}

export interface PriceHistoryAnalysis {
  observations: number;
  current: number | null;
  currentAt: string | null;
  avg30: number | null;
  avg60: number | null;
  avg90: number | null;
  lowest: number | null;
  highest: number | null;
  /** Coefficient of variation (standard deviation ÷ mean) over the last 90 days, in %. */
  volatilityPct: number | null;
  volatilityLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  sellerCountChange: { from: number; to: number } | null;
  warnings: string[];
}

const DAY = 86_400_000;

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function analyzePriceHistory(
  obs: PriceObservation[],
  asOf: Date = new Date(),
  opts: { aboveAverageWarnPct?: number } = {},
): PriceHistoryAnalysis {
  const warnPct = opts.aboveAverageWarnPct ?? 15;
  const sorted = obs
    .filter((o) => Number.isFinite(o.price) && !Number.isNaN(Date.parse(o.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const within = (days: number) =>
    sorted.filter((o) => asOf.getTime() - Date.parse(o.at) <= days * DAY && Date.parse(o.at) <= asOf.getTime());
  const w30 = within(30).map((o) => o.price);
  const w60 = within(60).map((o) => o.price);
  const w90 = within(90).map((o) => o.price);
  const last = sorted.at(-1) ?? null;
  const all = sorted.map((o) => o.price);
  const warnings: string[] = [];

  const avg90 = mean(w90);
  let volatilityPct: number | null = null;
  if (w90.length >= 3 && avg90) {
    const variance = w90.reduce((a, p) => a + (p - avg90) ** 2, 0) / w90.length;
    volatilityPct = (Math.sqrt(variance) / avg90) * 100;
  }
  const volatilityLevel =
    volatilityPct === null ? "UNKNOWN" : volatilityPct < 5 ? "LOW" : volatilityPct < 15 ? "MEDIUM" : "HIGH";

  if (last && avg90 && last.price > avg90 * (1 + warnPct / 100)) {
    warnings.push(
      `Potential price-risk warning: current price ($${last.price.toFixed(2)}) is substantially above the 90-day average ($${avg90.toFixed(2)}).`,
    );
  }
  if (sorted.length < 3) warnings.push("Too few price observations for a reliable history.");

  const withSellers = sorted.filter((o) => typeof o.sellerCount === "number") as (PriceObservation & {
    sellerCount: number;
  })[];
  let sellerCountChange: PriceHistoryAnalysis["sellerCountChange"] = null;
  if (withSellers.length >= 2) {
    const from = withSellers[0].sellerCount;
    const to = withSellers.at(-1)!.sellerCount;
    sellerCountChange = { from, to };
    if (to >= from + 3 || (from > 0 && to / from >= 1.5)) {
      warnings.push(
        `Seller count rose from ${from} to ${to}. More sellers can push the price down (price compression).`,
      );
    }
  }

  return {
    observations: sorted.length,
    current: last?.price ?? null,
    currentAt: last?.at ?? null,
    avg30: mean(w30),
    avg60: mean(w60),
    avg90,
    lowest: all.length ? Math.min(...all) : null,
    highest: all.length ? Math.max(...all) : null,
    volatilityPct,
    volatilityLevel,
    sellerCountChange,
    warnings,
  };
}
