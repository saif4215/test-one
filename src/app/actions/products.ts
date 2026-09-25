"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { analyzeProduct, summarize } from "@/lib/analysis/analyzeProduct";
import { effectiveFeeTable } from "@/lib/analysis/feeTable";
import { getDb } from "@/lib/db/client";
import { fNum, fStr, productFromForm } from "@/lib/forms";
import {
  addPriceObservation,
  addResearchLog,
  createProduct,
  deletePriceObservation,
  deleteProduct,
  getProduct,
  getSettings,
  priceHistoryFor,
  PRODUCT_STATUSES,
  setProductStatus,
  setProductWatch,
  updateProduct,
  type ProductStatus,
} from "@/lib/repo/products";

function logSnapshot(productId: number, status: string, notes?: string | null) {
  const db = getDb();
  const rec = getProduct(db, productId);
  if (!rec) return;
  const settings = getSettings(db);
  const a = analyzeProduct(rec.data, {
    settings,
    feeTable: effectiveFeeTable(settings),
    priceHistory: priceHistoryFor(db, productId),
    checkedAt: rec.updatedAt,
  });
  const sources = new Set<string>();
  for (const p of Object.values(rec.data.prov)) if (p.source) sources.add(`${p.source} (${p.kind})`);
  if (a.fees.referral.kind === "ESTIMATED") sources.add(`Reference fee table ${effectiveFeeTable(settings).effectiveDate} (ESTIMATED)`);
  addResearchLog(db, {
    productId,
    productName: rec.data.name,
    status,
    dataSources: [...sources],
    snapshot: rec.data,
    summary: {
      ...summarize(a),
      purchasePrice: rec.data.purchasePrice,
      salePrice: rec.data.salePrice,
      referralFee: a.unit?.referralFee ?? null,
      fulfillmentFee: a.unit?.fulfillmentFee ?? null,
      sellerCount: rec.data.sellerCount,
      salesRank: rec.data.salesRank,
      assumptions: a.assumptions,
      confidenceReason: a.confidence.reason,
    },
    notes: notes ?? null,
  });
}

export async function saveProductAction(formData: FormData) {
  const db = getDb();
  const input = productFromForm(formData);
  const idRaw = fStr(formData, "id");
  let id: number;
  if (idRaw) {
    id = Number(idRaw);
    updateProduct(db, id, input);
  } else {
    id = createProduct(db, input);
  }
  // Seed price history with the observed selling price so the Price Monitor has a starting point.
  if (input.salePrice !== null && formData.get("recordPrice") === "on") {
    addPriceObservation(db, {
      productId: id,
      price: input.salePrice,
      sellerCount: input.sellerCount,
      salesRank: input.salesRank,
      at: input.prov.salePrice?.checkedAt,
      source: input.prov.salePrice?.source ?? "Entered by user",
    });
  }
  logSnapshot(id, idRaw ? "updated" : "analyzed");
  revalidatePath("/products");
  redirect(`/products/${id}`);
}

export async function setStatusAction(id: number, formData: FormData) {
  const status = fStr(formData, "status") as ProductStatus | null;
  if (!status || !PRODUCT_STATUSES.some((s) => s.value === status)) return;
  const db = getDb();
  setProductStatus(db, id, status);
  if (status === "watch") setProductWatch(db, id, true);
  logSnapshot(id, status, fStr(formData, "notes"));
  revalidatePath(`/products/${id}`);
  revalidatePath("/products");
}

export async function toggleWatchAction(id: number, watch: boolean) {
  setProductWatch(getDb(), id, watch);
  revalidatePath(`/products/${id}`);
  revalidatePath("/products");
  revalidatePath("/price-monitor");
}

export async function addPriceObservationAction(id: number, formData: FormData) {
  const price = fNum(formData, "price");
  if (price === null || price <= 0) return;
  const at = fStr(formData, "at");
  addPriceObservation(getDb(), {
    productId: id,
    price,
    side: fStr(formData, "side") === "source" ? "source" : "amazon",
    sellerCount: fNum(formData, "sellerCount"),
    salesRank: fNum(formData, "salesRank"),
    at: at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : undefined,
    source: fStr(formData, "source") ?? "Entered by user",
  });
  revalidatePath(`/products/${id}`);
  revalidatePath("/price-monitor");
}

export async function deletePriceObservationAction(productId: number, obsId: number) {
  deletePriceObservation(getDb(), obsId);
  revalidatePath(`/products/${productId}`);
  revalidatePath("/price-monitor");
}

export async function deleteProductAction(id: number) {
  deleteProduct(getDb(), id);
  revalidatePath("/products");
  redirect("/products");
}

export async function logResearchAction(id: number, formData: FormData) {
  logSnapshot(id, fStr(formData, "status") ?? "note", fStr(formData, "notes"));
  revalidatePath(`/products/${id}`);
  revalidatePath("/research-log");
}

export async function saveMatchVerdictAction(id: number, formData: FormData) {
  const verdict = fStr(formData, "verdict");
  if (verdict !== "MATCH" && verdict !== "POSSIBLE MATCH" && verdict !== "DO NOT MATCH") return;
  const db = getDb();
  const rec = getProduct(db, id);
  if (!rec) return;
  updateProduct(db, id, { ...rec.data, identityVerdict: verdict });
  logSnapshot(id, "identity checked", `Product matching verdict: ${verdict}`);
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
}
