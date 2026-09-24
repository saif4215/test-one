import type { DB } from "@/lib/db/client";
import { findProductByIdentifier, priceHistoryFor } from "@/lib/repo/products";
import type { DataProvider, LookupResult } from "./types";

/**
 * Reuses data you've already saved for the same ASIN/UPC, keeping the
 * original provenance and timestamps so old data shows as possibly stale.
 */
export function localProvider(db: DB): DataProvider {
  return {
    status: () => ({
      id: "local",
      name: "Your saved research",
      configured: true,
      capabilities: ["Previously entered product data", "Recorded price history"],
      description: "Products and price observations you've saved in this app.",
      cost: "Free",
    }),
    async lookup(q) {
      const asin = q.type === "asin" ? q.asin : q.type === "url" ? q.asin : null;
      const upc = q.type === "upc" ? q.upc : null;
      if (!asin && !upc) return null;
      const rec = findProductByIdentifier(db, { asin, upc });
      if (!rec) return null;
      const result: LookupResult = {
        providerId: "local",
        providerName: "Your saved research",
        fields: { ...rec.data },
        priceObservations: priceHistoryFor(db, rec.id),
        messages: [`Loaded saved product #${rec.id} (last updated ${rec.updatedAt.slice(0, 10)}). Check whether its prices are still current.`],
      };
      return result;
    },
  };
}
