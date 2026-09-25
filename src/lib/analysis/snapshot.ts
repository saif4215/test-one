import type { DB } from "@/lib/db/client";
import { addResearchLog, getProduct, getSettings, type ProductRecord } from "@/lib/repo/products";
import { summarize, type DealAnalysis } from "./analyzeProduct";
import { effectiveFeeTable } from "./feeTable";
import { analyzeRecord } from "./load";

export interface SnapshotSummary extends ReturnType<typeof summarize> {
  purchasePrice: number | null;
  salePrice: number | null;
  referralFee: number | null;
  fulfillmentFee: number | null;
  sellerCount: number | null;
  salesRank: number | null;
  assumptions: string[];
  confidenceReason: string;
}

export function snapshotSummary(rec: ProductRecord, a: DealAnalysis): SnapshotSummary {
  return {
    ...summarize(a),
    purchasePrice: rec.data.purchasePrice,
    salePrice: rec.data.salePrice,
    referralFee: a.unit?.referralFee ?? null,
    fulfillmentFee: a.unit?.fulfillmentFee ?? null,
    sellerCount: rec.data.sellerCount,
    salesRank: rec.data.salesRank,
    assumptions: a.assumptions,
    confidenceReason: a.confidence.reason,
  };
}

/** Saves a research-log entry (§67) with the data sources, inputs, and results at this moment. */
export function logSnapshot(db: DB, productId: number, status: string, notes?: string | null, analysis?: DealAnalysis): void {
  const rec = getProduct(db, productId);
  if (!rec) return;
  const a = analysis ?? analyzeRecord(db, rec);
  const sources = new Set<string>();
  for (const p of Object.values(rec.data.prov)) if (p.source) sources.add(`${p.source} (${p.kind})`);
  if (a.fees.referral.kind === "ESTIMATED")
    sources.add(`Reference fee table ${effectiveFeeTable(getSettings(db)).effectiveDate} (ESTIMATED)`);
  addResearchLog(db, {
    productId,
    productName: rec.data.name,
    status,
    dataSources: [...sources],
    snapshot: rec.data,
    summary: snapshotSummary(rec, a),
    notes: notes ?? null,
  });
}
