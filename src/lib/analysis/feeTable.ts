import { US_FEE_TABLE, type FeeTable } from "@/data/feeTables.us";
import type { Settings } from "@/lib/domain/settings";

/** The reference fee table with any overrides you've set in Settings applied. */
export function effectiveFeeTable(settings: Settings): FeeTable {
  const referral = { ...US_FEE_TABLE.referral };
  for (const [cat, pct] of Object.entries(settings.referralPctOverrides)) {
    const base = referral[cat] ?? referral["Everything Else"];
    referral[cat] = { ...base, mode: "whole", tiers: [{ upTo: null, pct }] };
  }
  const s = settings.storageRateOverrides;
  return {
    ...US_FEE_TABLE,
    effectiveDate: settings.feeTableVerifiedAt ?? US_FEE_TABLE.effectiveDate,
    referral,
    storage: {
      standard: {
        janSep: s.standardJanSep ?? US_FEE_TABLE.storage.standard.janSep,
        octDec: s.standardOctDec ?? US_FEE_TABLE.storage.standard.octDec,
      },
      oversize: {
        janSep: s.oversizeJanSep ?? US_FEE_TABLE.storage.oversize.janSep,
        octDec: s.oversizeOctDec ?? US_FEE_TABLE.storage.oversize.octDec,
      },
    },
  };
}
