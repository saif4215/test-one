/**
 * Daily Deal Finder and alerts (§36, §64, §65).
 *
 * Re-analyzes your saved and imported products with the data already
 * recorded, compares each one with its last monitoring snapshot, and writes a
 * timestamped alert only for meaningful changes or new matches with your
 * criteria. It fetches nothing it isn't allowed to: live values arrive only
 * through configured providers or your own updates. Every alert names its data
 * source and data timestamp, and alerts are estimates unless the data is Verified.
 */
import { analyzeRecord } from "@/lib/analysis/load";
import { logSnapshot, type SnapshotSummary } from "@/lib/analysis/snapshot";
import { reorderPoint, safetyStock } from "@/lib/calc/inventory";
import { onHand } from "@/lib/calc/metrics";
import type { DB } from "@/lib/db/client";
import { DATA_KIND_LABEL, isStale } from "@/lib/data/provenance";
import { field } from "@/lib/domain/product";
import { fmtUSD } from "@/lib/format";
import { addAlert, listAlerts, listInventory, listSales, listSuppliers } from "@/lib/repo/operations";
import { getSettings, listProducts, listResearchLog } from "@/lib/repo/products";

export const MONITOR_STATUS = "monitor";

export interface DealFinderResult {
  ranAt: string;
  productsChecked: number;
  alertsCreated: number;
  messages: string[];
}

export function runDealFinder(db: DB, now: Date = new Date()): DealFinderResult {
  const settings = getSettings(db);
  const ranAt = now.toISOString();
  let alertsCreated = 0;
  const messages: string[] = [];
  const unread = listAlerts(db, { unreadOnly: true });
  const hasUnread = (type: string, productId: number | null, key?: string) =>
    unread.some((a) => a.type === type && a.productId === productId && (!key || (a.data as { key?: string } | null)?.key === key));

  const products = listProducts(db).filter((p) => p.status !== "rejected" && p.status !== "purchased");
  for (const rec of products) {
    const a = analyzeRecord(db, rec, now);
    const sale = field(rec.data, "salePrice", rec.updatedAt);
    const dataSource = [sale.source, DATA_KIND_LABEL[sale.kind]].filter(Boolean).join(" · ") || "Your saved data";
    const dataTimestamp = sale.checkedAt ?? rec.updatedAt;
    const alert = (type: string, title: string, message: string, data: Record<string, unknown> = {}) => {
      addAlert(db, { type, productId: rec.id, title, message: `${message} Estimate, not a guarantee.`, dataSource, dataTimestamp, data });
      alertsCreated++;
    };

    const prevEntry = listResearchLog(db, rec.id).find((l) => l.status === MONITOR_STATUS);
    const prev = prevEntry?.summary as SnapshotSummary | undefined;
    const name = rec.data.name || `Product #${rec.id}`;

    if (a.filter.status === "PASS" && prev?.filterStatus !== "PASS") {
      alert("criteria_met", `${name} meets your criteria`, `Estimated profit ${fmtUSD(a.unit?.profit)}/unit, ROI ${a.unit?.roiPct?.toFixed(1) ?? "Unknown"}%. Verify restrictions, price, and fees before buying.`);
    } else if (prev?.filterStatus === "PASS" && a.filter.status !== "PASS") {
      alert("criteria_lost", `${name} no longer meets your criteria`, a.filter.results.filter((r) => r.status !== "PASS").map((r) => `${r.criterion}: ${r.reason}`).join("; ") + ".");
    }
    if (prev && a.unit && prev.profit !== null) {
      const d = a.unit.profit - prev.profit;
      if (Math.abs(d) >= Math.max(1, Math.abs(prev.profit) * 0.1)) {
        alert(d > 0 ? "profit_increase" : "profit_decrease", `${name}: estimated profit ${d > 0 ? "up" : "down"} ${fmtUSD(Math.abs(d))}`, `From ${fmtUSD(prev.profit)} to ${fmtUSD(a.unit.profit)} per unit.`);
      }
    }
    if (prev && prev.purchasePrice !== null && rec.data.purchasePrice !== null && rec.data.purchasePrice < prev.purchasePrice) {
      alert("purchase_price_drop", `${name}: purchase price dropped`, `From ${fmtUSD(prev.purchasePrice)} to ${fmtUSD(rec.data.purchasePrice)}.`);
    }
    if (prev && prev.salePrice !== null && rec.data.salePrice !== null && rec.data.salePrice > prev.salePrice) {
      alert("sale_price_increase", `${name}: selling price increased`, `From ${fmtUSD(prev.salePrice)} to ${fmtUSD(rec.data.salePrice)}. Check whether it's likely to last (see price history).`);
    }
    if (prev && prev.sellerCount !== null && rec.data.sellerCount !== null && Math.abs(rec.data.sellerCount - prev.sellerCount) >= 2) {
      alert("seller_count_change", `${name}: seller count ${rec.data.sellerCount > prev.sellerCount ? "rose" : "fell"}`, `From ${prev.sellerCount} to ${rec.data.sellerCount} sellers.`);
    }
    for (const w of a.priceHistory.warnings.filter((x) => x.includes("above the 90-day average"))) {
      if (!hasUnread("price_above_average", rec.id)) alert("price_above_average", `${name}: price well above its average`, w);
    }
    if (rec.watch && isStale(sale, now, settings.costDefaults.staleAfterDays) && !hasUnread("stale_data", rec.id)) {
      alert("stale_data", `${name}: data may be stale`, `The selling price was last checked ${dataTimestamp.slice(0, 10)}. Re-check it before relying on this analysis.`);
    }

    // The baseline for the next comparison.
    logSnapshot(db, rec.id, MONITOR_STATUS, `Deal Finder run ${ranAt}`, a);
  }

  // Reorder and low-inventory alerts (§18) based on your actual sales over the last 30 days.
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const recent = listSales(db, { from: since });
  const suppliers = new Map(listSuppliers(db).map((s) => [s.id, s]));
  for (const item of listInventory(db)) {
    const sold = recent.filter((s) => s.inventoryId === item.id).reduce((x, s) => x + s.qty, 0);
    if (sold === 0) continue;
    const daily = sold / 30;
    const lead = (item.supplierId && suppliers.get(item.supplierId)?.leadTimeDays) || 14;
    const rop = reorderPoint(daily, lead, safetyStock(daily, settings.costDefaults.safetyDays));
    const left = onHand(item);
    const key = `inventory-${item.id}`;
    if (left <= rop && !hasUnread("reorder_point", null, key)) {
      addAlert(db, {
        type: "reorder_point",
        productId: null,
        title: `${item.name}: at or below reorder point`,
        message: `${left} on hand vs. reorder point ${rop} (${daily.toFixed(2)}/day × ${lead}-day lead time + safety stock). Based on your last 30 days of sales; actual demand can differ.`,
        dataSource: "Your recorded sales",
        dataTimestamp: ranAt,
        data: { key, inventoryId: item.id },
      });
      alertsCreated++;
    }
  }

  messages.push(`Checked ${products.length} products; created ${alertsCreated} alerts.`);
  return { ranAt, productsChecked: products.length, alertsCreated, messages };
}
