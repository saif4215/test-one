"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FEE_CATEGORIES } from "@/data/feeTables.us";
import { getDb } from "@/lib/db/client";
import { settingsSchema, type Settings } from "@/lib/domain/settings";
import { fBool, fList, fNum, fStr } from "@/lib/forms";
import { getSettings, saveSettings } from "@/lib/repo/products";

const SOURCING = ["retail", "online", "wholesale"] as const;

export async function saveSettingsAction(formData: FormData) {
  const db = getDb();
  const prev = getSettings(db);
  const num = (k: string, fallback: number) => fNum(formData, k) ?? fallback;

  const referralPctOverrides: Record<string, number> = {};
  for (const cat of FEE_CATEGORIES) {
    const v = fNum(formData, `ref:${cat}`);
    if (v !== null) referralPctOverrides[cat] = v;
  }

  const next: Settings = settingsSchema.parse({
    ...prev,
    onboarded: true,
    businessName: fStr(formData, "businessName") ?? "",
    startingBudget: fNum(formData, "startingBudget"),
    fulfillment: fStr(formData, "fulfillment") ?? prev.fulfillment,
    sourcing: SOURCING.filter((s) => fBool(formData, `sourcing:${s}`)),
    targetMinProfit: num("targetMinProfit", prev.targetMinProfit),
    targetRoiPct: num("targetRoiPct", prev.targetRoiPct),
    targetMarginPct: num("targetMarginPct", prev.targetMarginPct),
    preferredCategories: fList(formData, "preferredCategories"),
    avoidCategories: fList(formData, "avoidCategories"),
    hasSellerAccount: fStr(formData, "hasSellerAccount") ?? prev.hasSellerAccount,
    sellerPlan: fStr(formData, "sellerPlan") ?? prev.sellerPlan,
    hasSuppliers: fBool(formData, "hasSuppliers"),
    wantsProductHelp: fBool(formData, "wantsProductHelp"),
    wantsSpreadsheets: fBool(formData, "wantsSpreadsheets"),
    mode: fStr(formData, "mode") === "advanced" ? "advanced" : "beginner",
    costDefaults: {
      prepPerUnit: num("prepPerUnit", prev.costDefaults.prepPerUnit),
      packagingPerUnit: num("packagingPerUnit", prev.costDefaults.packagingPerUnit),
      inboundPerLb: num("inboundPerLb", prev.costDefaults.inboundPerLb),
      purchaseTaxPct: num("purchaseTaxPct", prev.costDefaults.purchaseTaxPct),
      returnsPct: num("returnsPct", prev.costDefaults.returnsPct),
      advertisingPerUnit: num("advertisingPerUnit", prev.costDefaults.advertisingPerUnit),
      expectedStorageDays: num("expectedStorageDays", prev.costDefaults.expectedStorageDays),
      maxCapitalPctPerProduct: num("maxCapitalPctPerProduct", prev.costDefaults.maxCapitalPctPerProduct),
      staleAfterDays: num("staleAfterDays", prev.costDefaults.staleAfterDays),
      slowMoverDays: num("slowMoverDays", prev.costDefaults.slowMoverDays),
      safetyDays: num("safetyDays", prev.costDefaults.safetyDays),
      aboveAverageWarnPct: num("aboveAverageWarnPct", prev.costDefaults.aboveAverageWarnPct),
    },
    filters: {
      minProfit: fNum(formData, "f_minProfit"),
      minRoiPct: fNum(formData, "f_minRoiPct"),
      minMarginPct: fNum(formData, "f_minMarginPct"),
      maxPurchasePrice: fNum(formData, "f_maxPurchasePrice"),
      maxSellerCount: fNum(formData, "f_maxSellerCount"),
      maxSalesRank: fNum(formData, "f_maxSalesRank"),
      minMonthlySalesLow: fNum(formData, "f_minMonthlySalesLow"),
      maxInventoryDays: fNum(formData, "f_maxInventoryDays"),
      allowedCategories: fList(formData, "f_allowedCategories"),
      excludedCategories: fList(formData, "f_excludedCategories"),
      maxRiskLevel: fStr(formData, "f_maxRiskLevel"),
      maxCapitalPerProduct: fNum(formData, "f_maxCapitalPerProduct"),
      excludeFragile: fBool(formData, "f_excludeFragile"),
      excludeExpiring: fBool(formData, "f_excludeExpiring"),
      excludeRestricted: fBool(formData, "f_excludeRestricted"),
      excludeHazmat: fBool(formData, "f_excludeHazmat"),
    },
    referralPctOverrides,
    storageRateOverrides: {
      standardJanSep: fNum(formData, "st_standardJanSep"),
      standardOctDec: fNum(formData, "st_standardOctDec"),
      oversizeJanSep: fNum(formData, "st_oversizeJanSep"),
      oversizeOctDec: fNum(formData, "st_oversizeOctDec"),
    },
    feeTableVerifiedAt: fStr(formData, "feeTableVerifiedAt"),
  });
  saveSettings(db, next);
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
