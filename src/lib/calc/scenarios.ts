/**
 * Scenario analysis (§45) and sensitivity analysis (§46). No scenario is guaranteed.
 */
import { unitEconomics, type CostModel, type UnitEconomics } from "./profit";

export interface Scenario {
  name: "Low price" | "Expected" | "High price";
  price: number;
  economics: UnitEconomics;
  assumption: string;
}

export function priceScenarios(
  m: CostModel,
  expected: number,
  opts: { low?: number | null; high?: number | null; highSupport?: string } = {},
): Scenario[] {
  const low = opts.low && opts.low > 0 ? opts.low : expected * 0.9;
  const out: Scenario[] = [
    {
      name: "Low price",
      price: low,
      economics: unitEconomics(m, low),
      assumption: opts.low
        ? "Uses the lowest price you entered (or the lowest price in history)."
        : "Assumes the price falls 10% below the expected price.",
    },
    { name: "Expected", price: expected, economics: unitEconomics(m, expected), assumption: "Current expected selling price." },
  ];
  if (opts.high && opts.high > expected) {
    out.push({
      name: "High price",
      price: opts.high,
      economics: unitEconomics(m, opts.high),
      assumption: opts.highSupport ?? "Based on the historical high price you entered.",
    });
  }
  return out;
}

export interface SensitivityRow {
  change: string;
  price: number;
  profit: number;
  roiPct: number | null;
  marginPct: number | null;
  profitDelta: number;
  /** Profit over 30 days at your estimated sales rate (null when sales are unknown). */
  monthlyProfit: number | null;
}

export function sensitivity(m: CostModel, price: number, ownMonthlyUnits: number | null): SensitivityRow[] {
  const base = unitEconomics(m, price);
  const row = (change: string, mm: CostModel, p: number, units = ownMonthlyUnits): SensitivityRow => {
    const u = unitEconomics(mm, p);
    return {
      change,
      price: p,
      profit: u.profit,
      roiPct: u.roiPct,
      marginPct: u.marginPct,
      profitDelta: u.profit - base.profit,
      monthlyProfit: units === null ? null : u.profit * units,
    };
  };
  const feesUp: CostModel = {
    ...m,
    referral: (p) => m.referral(p) * 1.1,
    fulfillment: m.fulfillment * 1.1,
    storage: m.storage * 1.1,
  };
  return [
    row("Base case", m, price),
    row("Selling price −10%", m, price * 0.9),
    row("Selling price −5%", m, price * 0.95),
    row("Selling price +5%", m, price * 1.05),
    row("Selling price +10%", m, price * 1.1),
    row("Amazon fees +10%", feesUp, price),
    row("Shipping +25%", { ...m, inboundShipping: m.inboundShipping * 1.25 }, price),
    row("Purchase price +10%", { ...m, purchasePrice: m.purchasePrice * 1.1 }, price),
    row("Sales volume −25%", m, price, ownMonthlyUnits === null ? null : ownMonthlyUnits * 0.75),
    row("Sales volume +25%", m, price, ownMonthlyUnits === null ? null : ownMonthlyUnits * 1.25),
  ];
}
