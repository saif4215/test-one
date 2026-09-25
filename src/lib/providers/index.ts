import type { DB } from "@/lib/db/client";
import { productInputSchema, type ProductInput } from "@/lib/domain/product";
import type { PriceObservation } from "@/lib/calc/priceHistory";
import { LIVE_DATA_UNAVAILABLE } from "@/lib/data/provenance";
import { parseQuery, type ParsedQuery } from "./identifiers";
import { localProvider } from "./local";
import { sheetsConfig } from "@/lib/google/sync";
import { googleSearchProvider } from "./googleSearch";
import { spApiProvider } from "./spapi";
import type { DataProvider, PriceCandidate, ProviderStatus } from "./types";

export function providers(db: DB): DataProvider[] {
  return [localProvider(db), spApiProvider(), googleSearchProvider()];
}

export function providerStatuses(db: DB): ProviderStatus[] {
  const list = providers(db).map((p) => p.status());
  const sheets = sheetsConfig();
  list.push(
    {
      id: "google-sheets",
      name: "Google Sheets sync",
      configured: sheets.configured,
      capabilities: ["Export products, inventory, POs, cash flow, and suppliers to your Sheet", "Import buy lists from a Sheet"],
      description: "Uses the free Google Sheets API with your own Google Cloud service account. Only sheets you share with it are accessible.",
      setup:
        "Create a service account in Google Cloud, enable the Sheets API, set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID, and share the Sheet with the service account email.",
      cost: "Free (Google Sheets API quotas apply)",
    },
    {
      id: "manual",
      name: "Manual entry",
      configured: true,
      capabilities: ["Anything you type in, labeled User-provided with a timestamp"],
      description: "Enter prices, fees, and sales estimates you've checked yourself.",
      cost: "Free",
    },
    {
      id: "csv",
      name: "CSV / Excel upload",
      configured: true,
      capabilities: ["Buy lists", "Supplier catalogs", "ASIN/UPC lists", "Exports from tools you already use"],
      description: "Upload spreadsheets on the Scan Spreadsheet page.",
      cost: "Free",
    },
  );
  return list;
}

export interface GatherResult {
  query: ParsedQuery;
  product: ProductInput;
  priceHistory: PriceObservation[];
  sourcesUsed: string[];
  messages: string[];
  liveDataUsed: boolean;
  candidates: PriceCandidate[];
}

/**
 * Asks each configured provider about the query and merges what they return.
 * Order: saved research first, then live APIs (live data wins where it exists).
 * Nothing is fabricated: anything no provider supplies stays empty and shows as Unknown.
 */
export async function gatherProduct(
  db: DB,
  raw: string,
  ctx: { price?: number | null; fulfillment?: "FBA" | "FBM" } = {},
): Promise<GatherResult> {
  const query = parseQuery(raw);
  let product: ProductInput = productInputSchema.parse({});
  const messages: string[] = [];
  const sourcesUsed: string[] = [];
  let priceHistory: PriceObservation[] = [];
  let liveDataUsed = false;
  const candidates: PriceCandidate[] = [];

  if (query.type === "asin") product.asin = query.asin;
  if (query.type === "upc") {
    product.upc = query.upc;
    if (!query.valid) messages.push(`"${query.upc}" fails the UPC/EAN check digit. Check the number.`);
  }
  if (query.type === "name") product.name = query.name;
  if (query.type === "url") {
    if (query.asin) product.asin = query.asin;
    else {
      product.sourceUrl = query.url;
      product.sourceName = query.host;
      product.sourceType = "online";
      messages.push(
        `Recorded ${query.host} as the source. This app doesn't scrape retailer websites (it respects their terms); enter the purchase price you see on the page.`,
      );
    }
  }

  for (const p of providers(db)) {
    const st = p.status();
    if (!st.configured) continue;
    try {
      const r = await p.lookup(query, ctx);
      if (!r) continue;
      const { prov, ...fields } = r.fields;
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== ""));
      product = productInputSchema.parse({ ...product, ...clean, prov: { ...product.prov, ...(prov ?? {}) } });
      if (r.priceObservations?.length) priceHistory = r.priceObservations;
      if (r.candidates?.length) candidates.push(...r.candidates);
      messages.push(...r.messages);
      sourcesUsed.push(r.providerName);
      // Search candidates aren't product data, so they don't count as live data for the analysis.
      if (p.status().id !== "local" && Object.keys(clean).length > 0) liveDataUsed = true;
    } catch (e) {
      messages.push(`${st.name}: ${(e as Error).message}`);
    }
  }
  if (!liveDataUsed) messages.push(LIVE_DATA_UNAVAILABLE);
  return { query, product, priceHistory, sourcesUsed, messages, liveDataUsed, candidates };
}
