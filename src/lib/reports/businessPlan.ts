/**
 * Business plan generator (§42). Built from your settings and records.
 * Anything the app doesn't know becomes a "[Fill in: …]" prompt, never an invented figure.
 */
import { allocateCapital } from "@/lib/calc/capital";
import { RESTRICTION_CHECKLIST } from "@/lib/calc/risk";
import type { Settings } from "@/lib/domain/settings";
import { fmtUSD } from "@/lib/format";
import { MONTHLY, WEEKLY } from "@/lib/content/workflows";

export interface PlanFacts {
  productsResearched: number;
  productsPassing: number;
  suppliers: number;
  inventoryValue: number;
  unitsOnHand: number;
  netRevenue: number;
  netProfit: number;
}

const fill = (what: string) => `[Fill in: ${what}]`;
const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

export function businessPlanMarkdown(s: Settings, f: PlanFacts, now = new Date()): string {
  const name = s.businessName || fill("business name");
  const budget = s.startingBudget;
  const sourcing = s.sourcing.length
    ? s.sourcing.map((x) => ({ retail: "retail arbitrage", online: "online arbitrage", wholesale: "wholesale" })[x]).join(", ")
    : fill("sourcing methods");
  const fulfillment = { FBA: "FBA", FBM: "FBM", BOTH: "a mix of FBA and FBM, chosen per product" }[s.fulfillment];
  const alloc = budget ? allocateCapital(budget) : null;

  return `# ${name} — Amazon Reselling Business Plan

_Generated ${now.toISOString().slice(0, 10)} from your settings and records. Review and edit every section; figures marked "Fill in" are unknown to the app._

## Executive summary
${name} resells products on Amazon ${s.marketplace} through ${sourcing}, using ${fulfillment}. The goal is products with at least ${fmtUSD(s.targetMinProfit)} profit per unit and ${s.targetRoiPct}% ROI, bought only after the numbers, demand, competition, restrictions, and risks have been checked. Profit and sales aren't guaranteed.

Current status: ${f.productsResearched} products researched (${f.productsPassing} currently pass your filters), ${f.suppliers} suppliers on file, ${f.unitsOnHand} units in inventory valued at ${fmtUSD(f.inventoryValue)}. Recorded net revenue to date is ${fmtUSD(f.netRevenue)}, and estimated net profit is ${fmtUSD(f.netProfit)}.

## Business model
Buy new products below the price they sell for on Amazon, from legitimate sources with proper invoices, then sell them through ${fulfillment}. Revenue is the sale price. Costs are the purchase price, Amazon referral and fulfillment fees, inbound shipping, prep, storage, returns, and operating expenses.

## Target products
- Preferred categories: ${s.preferredCategories.length ? s.preferredCategories.join(", ") : fill("preferred categories")}
- Avoided categories: ${s.avoidCategories.length ? s.avoidCategories.join(", ") : fill("categories to avoid")}
- Minimum profit ${fmtUSD(s.targetMinProfit)}/unit, ROI ${s.targetRoiPct}%, margin ${s.targetMarginPct}%
${s.filters.maxPurchasePrice ? `- Maximum purchase price ${fmtUSD(s.filters.maxPurchasePrice)}\n` : ""}- Avoid: ${[s.filters.excludeRestricted && "restricted or unverified listings", s.filters.excludeFragile && "fragile items", s.filters.excludeExpiring && "items with expiration dates", s.filters.excludeHazmat && "hazmat"].filter(Boolean).join(", ") || "nothing set"}

## Sourcing strategy
Methods: ${sourcing}. Every purchase price is recorded with its source and a timestamp. Supplier items are matched to Amazon listings by UPC, brand, and pack count, never by title alone. Counterfeit, stolen, or undocumented inventory is never bought.

## Budget
Starting capital: ${budget ? fmtUSD(budget) : fill("starting budget")}.
${
  alloc
    ? `| Scenario | Inventory | Shipping & prep | Operating | Reserve |\n|---|---|---|---|---|\n${alloc
        .map((a) => `| ${a.name} | ${fmtUSD(a.amounts.inventory)} | ${fmtUSD(a.amounts.shippingAndPrep)} | ${fmtUSD(a.amounts.operating)} | ${fmtUSD(a.amounts.reserve)} |`)
        .join("\n")}\n\nThese are illustrations based on stated assumptions. The whole budget never goes into inventory.`
    : fill("budget allocation")
}

## Inventory strategy
Start each new product with a small test buy (at most ${s.costDefaults.maxCapitalPctPerProduct}% of capital per product), and only scale after real sales confirm demand. Reorder at: average daily sales × supplier lead time + ${s.costDefaults.safetyDays} days of safety stock. Review items with no sale in ${s.costDefaults.slowMoverDays} days for pricing, weighing storage costs against the profit given up; never liquidate automatically.

## Pricing strategy
Price against the current Buy Box and the recent price history. Warn when the price is more than ${s.costDefaults.aboveAverageWarnPct}% above its 90-day average. Never go below the break-even price without a deliberate decision. ${fill("repricing approach and tools")}

## Fulfillment strategy
${fulfillment}. Compare FBA and FBM for each product on fees, storage, Prime eligibility, returns, and workload.

## Record-keeping system
This app records products (with data sources and timestamps), a research log, suppliers, purchase orders, inventory, sales, and cash-flow transactions. COGS is kept separate from operating expenses. A yearly tax-prep summary can be exported for a qualified tax professional.

## Risk management
Check restrictions, brand gating, authenticity, expiration, hazmat, price volatility, competition, and returns for every product before buying. Keep a cash reserve. Fees and policies change, so re-check them regularly.

## Cash-flow strategy
Track cash separately from profit. Amazon pays out on a delay, and inventory purchases lower cash before they turn into sales. Keep a reserve for returns, fees, and price drops. ${fill("target minimum cash balance")}

## Growth plan
${fill("12-month goals (e.g. products tested per month, revenue target, when to add wholesale accounts)")}

## Supplier strategy
Prefer authorized distributors and brand-direct accounts that provide invoices. For each supplier, track MOQ, pricing, lead time, payment terms, and reliability, and compare their tradeoffs without an arbitrary overall score.

## Weekly workflow
${list(WEEKLY.map((i) => i.label))}

## Monthly workflow
${list(MONTHLY.map((i) => i.label))}

## Key metrics
- Revenue, COGS, gross profit, operating expenses, net profit
- ROI, profit margin, average profit per unit
- Inventory value, units on hand, inventory turnover, slow movers
- Cash available vs. cash invested

## Compliance checklist
${list([...RESTRICTION_CHECKLIST, "Never use fake invoices, fake reviews, review manipulation, or deceptive listings", "Use only legitimate data sources; no scraping against a site's terms", "Consult a qualified tax professional about tax obligations"])}
`;
}
