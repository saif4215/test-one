/**
 * Text reports: the Deal Analysis template (§33) and the AI Deal Report (§71),
 * rendered as Markdown for download or printing.
 */
import type { DealAnalysis } from "@/lib/analysis/analyzeProduct";
import { DATA_KIND_LABEL } from "@/lib/data/provenance";
import { fmtDateTime, fmtNum, fmtPct, fmtRange, fmtUSD } from "@/lib/format";

const U = "Data unavailable — verify before purchasing.";
const or = (v: string | null | undefined) => (v ? v : "Unknown");

function costLine(a: DealAnalysis, key: string): string {
  const l = a.costLines.find((c) => c.key === key);
  if (!l) return fmtUSD(0);
  return l.value === null ? `Unknown (${U})` : `${fmtUSD(l.value)} (${DATA_KIND_LABEL[l.kind]}${l.source ? `: ${l.source}` : ""})`;
}

export function dealAnalysisMarkdown(a: DealAnalysis): string {
  const p = a.product;
  const u = a.unit;
  const qty = p.quantity;
  const v = a.velocity;
  const risk = (cat: string) => a.risks.find((r) => r.category === cat)?.level ?? "UNKNOWN";
  const prep = a.costLines.filter((c) => ["prep", "packaging"].includes(c.key)).reduce((s, c) => s + (c.value ?? 0), 0);
  const other = a.costLines.filter((c) => ["other", "tax", "returns", "ads", "storage", "closing"].includes(c.key)).reduce((s, c) => s + (c.value ?? 0), 0);

  return `# DEAL ANALYSIS

_Generated ${fmtDateTime(a.generatedAt)}. ${a.liveDataNote}_

## Product
Name: ${or(p.name)}
Brand: ${or(p.brand)}
ASIN: ${or(p.asin)}
Category: ${or(p.category)}

## Purchase
Cost: ${p.purchasePrice === null ? `Unknown (${U})` : `${fmtUSD(p.purchasePrice)} per unit`}
Quantity: ${qty === null ? "Unknown" : fmtNum(qty)}
Total investment: ${a.batch ? fmtUSD(a.batch.totalInvestment) : u ? `${fmtUSD(u.upfrontCost)} per unit` : "Unknown"}

## Selling
Expected price: ${p.salePrice === null ? `Unknown (${U})` : fmtUSD(p.salePrice)}
Expected units sold: ${v.sufficient ? `${fmtRange(v.monthly.low, v.monthly.high, 1)} per month (estimate)` : v.message}

## Fees
Referral: ${costLine(a, "referral")}
Fulfillment: ${costLine(a, "fulfillment")}
Shipping: ${costLine(a, "inbound")}
Prep: ${fmtUSD(prep)} (prep + packaging)
Other: ${fmtUSD(other)} (tax, storage, returns allowance, advertising, other)

## Profit
Revenue: ${a.batch ? fmtUSD(a.batch.expectedRevenue) : u ? `${fmtUSD(u.salePrice)} per unit` : "Unknown"}
Total costs: ${u ? `${fmtUSD(u.totalCost)} per unit${qty ? ` (${fmtUSD(u.totalCost * qty)} total)` : ""}` : "Unknown"}
Estimated profit: ${a.batch ? fmtUSD(a.batch.totalProfit) : u ? fmtUSD(u.profit) : "Unknown"}
Profit per unit: ${u ? `${fmtUSD(u.salePrice)} − ${fmtUSD(u.totalCost)} = ${fmtUSD(u.profit)}` : "Unknown"}
ROI: ${u ? `${fmtUSD(u.profit)} ÷ ${fmtUSD(u.upfrontCost)} × 100 = ${fmtPct(u.roiPct)}` : "Unknown"}
Margin: ${u ? `${fmtUSD(u.profit)} ÷ ${fmtUSD(u.salePrice)} × 100 = ${fmtPct(u.marginPct)}` : "Unknown"}
Break-even price: ${fmtUSD(a.breakEvenPrice)}
Maximum buy price: ${fmtUSD(a.maxBuyCost)}
${a.unknownCosts.length ? `\n> Profit excludes unknown costs: ${a.unknownCosts.join(", ")}. Actual profit will be lower.\n` : ""}
## Market
Competition: ${p.sellerCount === null ? "Unknown" : `${p.sellerCount} sellers${p.amazonOnListing ? ", Amazon on listing" : ""}`}
Price stability: ${a.priceHistory.volatilityLevel === "UNKNOWN" ? "Unknown (not enough price history)" : a.priceHistory.volatilityLevel}
Demand: ${p.salesRank !== null ? `Sales rank #${fmtNum(p.salesRank)} (an indicator, not unit sales)` : "Unknown"}${v.sufficient ? `; estimated ${fmtRange(v.monthly.low, v.monthly.high, 1)} units/month for you` : ""}
Seasonality: ${p.seasonal === null ? "Unknown" : p.seasonal ? "Seasonal" : "Not seasonal"}

## Risk
Restrictions: ${risk("Restriction")}
Authenticity: ${risk("Counterfeit/authenticity")}
Returns: ${risk("Returns")}
Price drops: ${risk("Price")}
Other: ${a.risks
    .filter((r) => !["Restriction", "Counterfeit/authenticity", "Returns", "Price"].includes(r.category) && r.level !== "LOW")
    .map((r) => `${r.category} ${r.level}`)
    .join(", ") || "None flagged"}
Overall: ${a.overallRisk}

## Data confidence
${a.confidence.level}: ${a.confidence.reason}

## Assumptions
${a.assumptions.map((x) => `- ${x}`).join("\n")}

## Missing Information
${a.missing.length ? a.missing.map((x) => `- ${x}: ${U}`).join("\n") : "- None of the key data is missing."}

## Next Steps
${a.verify.map((x) => `- [ ] ${x}`).join("\n")}
${a.testBuy ? `- [ ] If everything checks out, consider a test buy of ${a.testBuy.quantity} units (${fmtUSD(a.testBuy.investment)}).` : ""}

---
Estimates only. Profit, sales, and Buy Box share are not guaranteed. The final purchasing decision is yours.
`;
}

export function dealReportMarkdown(a: DealAnalysis): string {
  const p = a.product;
  const u = a.unit;
  const v = a.velocity;
  const dp = (label: string) => a.dataPoints.find((d) => d.label === label);
  const stamp = (label: string) => {
    const d = dp(label);
    return d?.checkedAt ? `${fmtDateTime(d.checkedAt)}${d.stale ? " (Data may be stale.)" : ""}` : "No timestamp";
  };
  const riskLevel = (cat: string) => a.risks.find((r) => r.category === cat)?.level ?? "UNKNOWN";

  return `# AI DEAL REPORT — ${or(p.name)}

## PRODUCT
Name: ${or(p.name)}
Brand: ${or(p.brand)}
ASIN: ${or(p.asin)}
UPC: ${or(p.upc)}
Category: ${or(p.category)}

## SOURCE
Supplier: ${or(p.sourceName)}
Purchase Price: ${fmtUSD(p.purchasePrice)}
Source: ${p.prov.purchasePrice ? `${DATA_KIND_LABEL[p.prov.purchasePrice.kind]}${p.prov.purchasePrice.source ? ` (${p.prov.purchasePrice.source})` : ""}` : "Unknown"}
Source URL: ${or(p.sourceUrl)}
Data Timestamp: ${stamp("Purchase price")}

## AMAZON
Selling Price: ${fmtUSD(p.salePrice)}, checked ${stamp("Selling price")}
Seller Count: ${p.sellerCount ?? "Unknown"}
Sales Indicators: ${p.salesRank !== null ? `Sales rank #${fmtNum(p.salesRank)}` : "Unknown"}${p.listingMonthlySalesLow !== null ? `; listing est. ${fmtRange(p.listingMonthlySalesLow, p.listingMonthlySalesHigh ?? p.listingMonthlySalesLow, 0)} units/month (${DATA_KIND_LABEL[p.prov.listingMonthlySalesLow?.kind ?? "USER_PROVIDED"]})` : ""}
Price History: ${a.priceHistory.observations ? `${a.priceHistory.observations} observations; 90-day avg ${fmtUSD(a.priceHistory.avg90)}, low ${fmtUSD(a.priceHistory.lowest)}, high ${fmtUSD(a.priceHistory.highest)}` : "Unknown"}

## FINANCIALS
Estimated Fees: ${u ? fmtUSD(u.amazonFees) : "Unknown"} (${DATA_KIND_LABEL[a.fees.referral.kind]} referral, ${DATA_KIND_LABEL[a.fees.fulfillment.kind]} fulfillment)
Shipping: ${costLine(a, "inbound")}
Prep: ${costLine(a, "prep")}
Total Cost: ${u ? fmtUSD(u.totalCost) : "Unknown"}
Estimated Profit: ${u ? fmtUSD(u.profit) : "Unknown"}
ROI: ${fmtPct(u?.roiPct)}
Margin: ${fmtPct(u?.marginPct)}

## SALES (all figures are estimates)
Estimated Daily Sales: ${v.sufficient ? fmtRange(v.daily.low, v.daily.high, 2) : v.message}
Estimated Weekly Sales: ${v.sufficient ? fmtRange(v.weekly.low, v.weekly.high, 1) : "Unknown"}
Estimated Monthly Sales: ${v.sufficient ? fmtRange(v.monthly.low, v.monthly.high, 1) : "Unknown"}
Estimated Inventory Duration: ${v.sufficient && v.inventoryDurationDays ? fmtRange(v.inventoryDurationDays.low, v.inventoryDurationDays.high, 0, "days") : "Unknown"}

## RISKS
Restrictions: ${riskLevel("Restriction")}
Price Risk: ${riskLevel("Price")}
Competition Risk: ${riskLevel("Competition")}
Supplier Risk: ${riskLevel("Counterfeit/authenticity")}
Product Risk: ${["Fragility", "Expiration", "Dangerous goods", "Meltable", "Returns"].map((c) => `${c} ${riskLevel(c)}`).join(", ")}

## DATA QUALITY
Confidence: ${a.confidence.level}
Reason: ${a.confidence.reason}

## VERIFY BEFORE BUYING
${[...a.missing.map((m) => `${m}: ${U}`), ...a.verify].map((x) => `- [ ] ${x}`).join("\n")}

---
_Generated ${fmtDateTime(a.generatedAt)}. ${a.liveDataNote} Estimates only; nothing here is guaranteed._
`;
}
