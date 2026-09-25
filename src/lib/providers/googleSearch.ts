/**
 * Optional Google price-lookup provider, using Google's official Custom
 * Search JSON API (never scraping google.com).
 *
 *   GOOGLE_CSE_KEY  API key from Google Cloud
 *   GOOGLE_CSE_ID   Programmable Search Engine ID ("cx")
 *
 * Results are candidate retailer listings, labeled Third-party with a
 * timestamp. They are NEVER written into the purchase price automatically,
 * because a search result isn't a verified match for the product; you
 * confirm the listing yourself.
 *
 * Availability: Google has restricted the Custom Search JSON API for new
 * customers and announced a retirement date. Check that it's available for
 * your account. If a call fails, this provider reports the error and the
 * analysis carries on without it.
 */
import type { ParsedQuery } from "./identifiers";
import type { DataProvider, PriceCandidate } from "./types";

const ENDPOINT = "https://customsearch.googleapis.com/customsearch/v1";

interface CseItem {
  title?: string;
  link?: string;
  displayLink?: string;
  pagemap?: {
    offer?: { price?: string; pricecurrency?: string }[];
    product?: { name?: string; price?: string }[];
    metatags?: Record<string, string>[];
  };
}

export function parsePrice(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Turns a Custom Search response into price candidates. Exported for tests. */
export function parseCseItems(items: CseItem[], checkedAt: string): PriceCandidate[] {
  return items
    .filter((i) => i.link)
    .map((i) => {
      const meta = i.pagemap?.metatags?.[0] ?? {};
      const offer = i.pagemap?.offer?.[0];
      const price =
        parsePrice(offer?.price) ??
        parsePrice(i.pagemap?.product?.[0]?.price) ??
        parsePrice(meta["product:price:amount"]) ??
        parsePrice(meta["og:price:amount"]);
      const currency = offer?.pricecurrency ?? meta["product:price:currency"] ?? meta["og:price:currency"] ?? (price !== null ? "USD?" : null);
      return {
        title: i.title ?? i.link!,
        url: i.link!,
        source: i.displayLink ?? new URL(i.link!).hostname,
        price,
        currency,
        checkedAt,
      };
    });
}

export function googleSearchProvider(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): DataProvider {
  const key = env.GOOGLE_CSE_KEY;
  const cx = env.GOOGLE_CSE_ID;
  return {
    status: () => ({
      id: "google-search",
      name: "Google price lookup (Custom Search API)",
      configured: !!key && !!cx,
      capabilities: ["Candidate retailer listings and listed prices for a UPC or product name (Third-party, not auto-filled)"],
      description:
        "Google's official Custom Search JSON API. No scraping. Google has restricted this API for new customers and announced a retirement date, so check it's available for your account.",
      setup: "Create an API key and a Programmable Search Engine in Google Cloud, then set GOOGLE_CSE_KEY and GOOGLE_CSE_ID in .env.local.",
      cost: "About 100 free queries/day (Google's quota; verify current terms)",
    }),
    async lookup(q: ParsedQuery) {
      if (!key || !cx) return null;
      const term = q.type === "upc" ? q.upc : q.type === "name" ? q.name : null;
      if (!term) return null;
      const checkedAt = new Date().toISOString();
      const url = `${ENDPOINT}?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&num=8&q=${encodeURIComponent(term)}`;
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
        const body = (await res.json().catch(() => ({}))) as { items?: CseItem[]; error?: { message?: string } };
        if (!res.ok) throw new Error(body.error?.message ?? res.statusText);
        const candidates = parseCseItems(body.items ?? [], checkedAt);
        return {
          providerId: "google-search",
          providerName: "Google price lookup",
          fields: {},
          candidates,
          messages: [
            candidates.length
              ? `Google found ${candidates.length} possible retailer listings (Third-party, ${checkedAt}). Confirm it's the exact same product (brand, size, pack count) before using any price.`
              : "Google returned no listings for this search.",
          ],
        };
      } catch (e) {
        return { providerId: "google-search", providerName: "Google price lookup", fields: {}, messages: [`Google price lookup failed: ${(e as Error).message}`] };
      }
    },
  };
}
