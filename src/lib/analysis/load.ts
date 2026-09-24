import type { DB } from "@/lib/db/client";
import { getProduct, getSettings, listProducts, priceHistoryFor, type ProductRecord } from "@/lib/repo/products";
import { analyzeProduct, type DealAnalysis } from "./analyzeProduct";
import { effectiveFeeTable } from "./feeTable";

export function analyzeRecord(db: DB, rec: ProductRecord, now = new Date()): DealAnalysis {
  const settings = getSettings(db);
  return analyzeProduct(rec.data, {
    settings,
    feeTable: effectiveFeeTable(settings),
    priceHistory: priceHistoryFor(db, rec.id),
    checkedAt: rec.updatedAt,
    now,
  });
}

export function loadAnalysis(db: DB, id: number): { rec: ProductRecord; analysis: DealAnalysis } | null {
  const rec = getProduct(db, id);
  if (!rec) return null;
  return { rec, analysis: analyzeRecord(db, rec) };
}

export function analyzeAll(db: DB, opts: Parameters<typeof listProducts>[1] = {}) {
  const settings = getSettings(db);
  const feeTable = effectiveFeeTable(settings);
  const now = new Date();
  return listProducts(db, opts).map((rec) => ({
    rec,
    analysis: analyzeProduct(rec.data, { settings, feeTable, priceHistory: priceHistoryFor(db, rec.id), checkedAt: rec.updatedAt, now }),
  }));
}
