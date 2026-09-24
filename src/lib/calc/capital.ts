/**
 * Test-buy sizing and capital allocation (§16, §37, §63).
 * These scenarios are illustrations based on stated assumptions, not advice
 * to spend the whole budget.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export interface TestBuyInput {
  capitalAvailable: number;
  /** Upfront cost per unit (purchase + prep + inbound). */
  unitInvestment: number;
  risk: RiskLevel;
  /** Low end of YOUR estimated monthly sales, or null if unknown. */
  ownMonthlySalesLow: number | null;
  priceVolatility: RiskLevel;
  /** Months until the product expires, if it expires. */
  monthsToExpiration: number | null;
  /** Max share of available capital to put into one product, in %. */
  maxCapitalPctPerProduct: number;
}

export interface TestBuyResult {
  quantity: number;
  investment: number;
  reasons: string[];
}

export function suggestTestQuantity(i: TestBuyInput): TestBuyResult {
  const reasons: string[] = [];
  if (!(i.unitInvestment > 0)) return { quantity: 0, investment: 0, reasons: ["Unit cost is unknown."] };

  const capitalCap = Math.floor((i.capitalAvailable * i.maxCapitalPctPerProduct) / 100 / i.unitInvestment);
  reasons.push(
    `Capital cap: ${i.maxCapitalPctPerProduct}% of $${i.capitalAvailable.toFixed(2)} ÷ $${i.unitInvestment.toFixed(2)} = ${capitalCap} units.`,
  );

  // The test should cover a few weeks of low-end sales; the higher the risk, the fewer weeks.
  const weeks = i.risk === "LOW" ? 4 : i.risk === "MEDIUM" ? 3 : 2;
  let demandCap: number;
  if (i.ownMonthlySalesLow !== null && i.ownMonthlySalesLow > 0) {
    demandCap = Math.max(1, Math.ceil((i.ownMonthlySalesLow * weeks) / 4.33));
    reasons.push(`Demand cap: about ${weeks} weeks of low-end estimated sales = ${demandCap} units.`);
  } else {
    demandCap = 3;
    reasons.push("No reliable sales estimate, so the test is capped at 3 units.");
  }

  let cap = Math.min(capitalCap, demandCap);
  if (i.priceVolatility === "HIGH") {
    cap = Math.min(cap, Math.max(1, Math.floor(cap / 2)));
    reasons.push("High price volatility: halved the test quantity.");
  }
  if (i.monthsToExpiration !== null && i.ownMonthlySalesLow) {
    // Leave room to sell before expiry (Amazon sets expiration-date requirements for FBA).
    const expCap = Math.floor(i.ownMonthlySalesLow * Math.max(0, i.monthsToExpiration - 3) * 0.5);
    if (expCap < cap) {
      cap = expCap;
      reasons.push(`Expiration limit: about half of the sales expected before the last ~3 months of shelf life = ${expCap} units.`);
    }
  }
  const quantity = Math.max(0, cap);
  if (quantity === 0) reasons.push("No test quantity fits these limits.");
  reasons.push("A small test limits the cost of being wrong about demand, price, or competition. It isn't guaranteed to succeed.");
  return { quantity, investment: quantity * i.unitInvestment, reasons };
}

export interface AllocationScenario {
  name: "Conservative" | "Moderate" | "Higher inventory";
  split: { inventory: number; shippingAndPrep: number; operating: number; reserve: number };
  amounts: { inventory: number; shippingAndPrep: number; operating: number; reserve: number };
  assumption: string;
}

const SCENARIOS: Omit<AllocationScenario, "amounts">[] = [
  {
    name: "Conservative",
    split: { inventory: 50, shippingAndPrep: 10, operating: 10, reserve: 30 },
    assumption: "A large reserve covers returns, price drops, and slow sellers while you learn.",
  },
  {
    name: "Moderate",
    split: { inventory: 60, shippingAndPrep: 12, operating: 8, reserve: 20 },
    assumption: "Some proven products, with a reserve for surprises.",
  },
  {
    name: "Higher inventory",
    split: { inventory: 70, shippingAndPrep: 12, operating: 8, reserve: 10 },
    assumption: "Assumes reliable sales data and fast payouts. A small reserve means more cash-flow risk.",
  },
];

export function allocateCapital(budget: number): AllocationScenario[] {
  return SCENARIOS.map((s) => ({
    ...s,
    amounts: {
      inventory: (budget * s.split.inventory) / 100,
      shippingAndPrep: (budget * s.split.shippingAndPrep) / 100,
      operating: (budget * s.split.operating) / 100,
      reserve: (budget * s.split.reserve) / 100,
    },
  }));
}

/** §63: the theoretical maximum number of units vs. a suggested number that keeps a reserve. */
export function budgetUnits(budget: number, unitCost: number, inventoryAllocationPct: number) {
  if (!(unitCost > 0)) return { maxTheoreticalUnits: 0, suggestedUnits: 0, cashRemaining: budget };
  const maxTheoreticalUnits = Math.floor(budget / unitCost);
  const suggestedUnits = Math.floor((budget * inventoryAllocationPct) / 100 / unitCost);
  return { maxTheoreticalUnits, suggestedUnits, cashRemaining: budget - suggestedUnits * unitCost };
}
