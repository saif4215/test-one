import { analyzeAll } from "@/lib/analysis/load";
import { inventorySummary, profitSummary } from "@/lib/calc/metrics";
import type { DB } from "@/lib/db/client";
import { listInventory, listSales, listSuppliers, listTransactions } from "@/lib/repo/operations";
import type { PlanFacts } from "./businessPlan";

export function planFacts(db: DB): PlanFacts {
  const products = analyzeAll(db);
  const items = listInventory(db);
  const inv = inventorySummary(items);
  const p = profitSummary(listSales(db), items, listTransactions(db));
  return {
    productsResearched: products.length,
    productsPassing: products.filter((x) => x.analysis.filter.status === "PASS").length,
    suppliers: listSuppliers(db).length,
    inventoryValue: inv.costValue,
    unitsOnHand: inv.unitsOnHand,
    netRevenue: p.netRevenue,
    netProfit: p.netProfit,
  };
}
