/**
 * Optional Amazon Selling Partner API (SP-API) adapter.
 *
 * The API is free with a Seller Central account and a registered developer
 * application. It's disabled unless these environment variables are set:
 *   SPAPI_CLIENT_ID, SPAPI_CLIENT_SECRET, SPAPI_REFRESH_TOKEN
 *   SPAPI_SELLER_ID  (needed for the listing-restrictions check)
 *   SPAPI_ENDPOINT   (default https://sellingpartnerapi-na.amazon.com)
 *   SPAPI_MARKETPLACE_ID (default ATVPDKIKX0DER = amazon.com)
 *
 * Amazon's API terms apply. Data is used only for your own seller research.
 * Every value returned is labeled VERIFIED with the API name and a timestamp.
 */
import type { ProductInput, ProvEntry } from "@/lib/domain/product";
import type { ParsedQuery } from "./identifiers";
import type { DataProvider, LookupResult } from "./types";

const AMAZON_RETAIL_SELLER_ID = "ATVPDKIKX0DER";
const TIMEOUT_MS = 15_000;

interface Env {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sellerId: string | null;
  endpoint: string;
  marketplaceId: string;
}

function readEnv(): Env | null {
  const { SPAPI_CLIENT_ID, SPAPI_CLIENT_SECRET, SPAPI_REFRESH_TOKEN } = process.env;
  if (!SPAPI_CLIENT_ID || !SPAPI_CLIENT_SECRET || !SPAPI_REFRESH_TOKEN) return null;
  return {
    clientId: SPAPI_CLIENT_ID,
    clientSecret: SPAPI_CLIENT_SECRET,
    refreshToken: SPAPI_REFRESH_TOKEN,
    sellerId: process.env.SPAPI_SELLER_ID || null,
    endpoint: (process.env.SPAPI_ENDPOINT || "https://sellingpartnerapi-na.amazon.com").replace(/\/$/, ""),
    marketplaceId: process.env.SPAPI_MARKETPLACE_ID || "ATVPDKIKX0DER",
  };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      (body as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
      (body as { error_description?: string })?.error_description ??
      res.statusText;
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return body;
}

async function accessToken(env: Env): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const body = (await fetchJson("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
    }),
  })) as { access_token: string; expires_in: number };
  tokenCache = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function api(env: Env, path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await accessToken(env);
  return fetchJson(`${env.endpoint}${path}`, {
    ...init,
    headers: { "x-amz-access-token": token, "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

// ---------- response helpers ----------

type Measure = { unit?: string; value?: number } | undefined;

export function toInches(m: Measure): number | null {
  if (!m || typeof m.value !== "number") return null;
  const u = (m.unit ?? "inches").toLowerCase();
  if (u.startsWith("inch")) return m.value;
  if (u.startsWith("cent")) return m.value / 2.54;
  if (u.startsWith("milli")) return m.value / 25.4;
  if (u.startsWith("meter")) return m.value * 39.3701;
  return null;
}

export function toPounds(m: Measure): number | null {
  if (!m || typeof m.value !== "number") return null;
  const u = (m.unit ?? "pounds").toLowerCase();
  if (u.startsWith("pound")) return m.value;
  if (u.startsWith("ounce")) return m.value / 16;
  if (u.startsWith("kilo")) return m.value * 2.20462;
  if (u.startsWith("gram")) return m.value / 453.592;
  return null;
}

interface CatalogItem {
  asin: string;
  summaries?: {
    marketplaceId: string;
    brand?: string;
    itemName?: string;
    browseClassification?: { displayName?: string };
    websiteDisplayGroupName?: string;
    modelNumber?: string;
    packageQuantity?: number;
    size?: string;
    color?: string;
  }[];
  dimensions?: { marketplaceId: string; package?: { height?: Measure; length?: Measure; width?: Measure; weight?: Measure } }[];
  identifiers?: { marketplaceId: string; identifiers: { identifierType: string; identifier: string }[] }[];
  salesRanks?: {
    marketplaceId: string;
    classificationRanks?: { title: string; rank: number }[];
    displayGroupRanks?: { title: string; rank: number }[];
  }[];
}

/** Turns a Catalog Items response into product fields plus provenance. Exported for tests. */
export function catalogToFields(item: CatalogItem, marketplaceId: string, checkedAt: string) {
  const fields: Partial<ProductInput> = { asin: item.asin };
  const prov: Record<string, ProvEntry> = {};
  const mark = (k: string) => (prov[k] = { kind: "VERIFIED", source: "Amazon SP-API (Catalog Items)", checkedAt });
  const s = item.summaries?.find((x) => x.marketplaceId === marketplaceId) ?? item.summaries?.[0];
  if (s?.itemName) fields.name = s.itemName;
  if (s?.brand) fields.brand = s.brand;
  if (s?.websiteDisplayGroupName || s?.browseClassification?.displayName)
    fields.subcategory = s.browseClassification?.displayName ?? s.websiteDisplayGroupName ?? null;
  const pkg = (item.dimensions?.find((x) => x.marketplaceId === marketplaceId) ?? item.dimensions?.[0])?.package;
  if (pkg) {
    const [l, w, h, wt] = [toInches(pkg.length), toInches(pkg.width), toInches(pkg.height), toPounds(pkg.weight)];
    if (l !== null && w !== null && h !== null) {
      Object.assign(fields, { lengthIn: l, widthIn: w, heightIn: h });
      ["lengthIn", "widthIn", "heightIn"].forEach(mark);
    }
    if (wt !== null) {
      fields.weightLb = wt;
      mark("weightLb");
    }
  }
  const ids = (item.identifiers?.find((x) => x.marketplaceId === marketplaceId) ?? item.identifiers?.[0])?.identifiers ?? [];
  const upc = ids.find((i) => i.identifierType === "UPC" || i.identifierType === "EAN" || i.identifierType === "GTIN");
  if (upc) fields.upc = upc.identifier;
  const ranks = item.salesRanks?.find((x) => x.marketplaceId === marketplaceId) ?? item.salesRanks?.[0];
  const top = ranks?.displayGroupRanks?.[0] ?? ranks?.classificationRanks?.[0];
  if (top) {
    fields.salesRank = top.rank;
    prov.salesRank = { kind: "VERIFIED", source: `Amazon SP-API sales rank (${top.title})`, checkedAt };
  }
  return { fields, prov };
}

interface OffersPayload {
  Summary?: {
    TotalOfferCount?: number;
    NumberOfOffers?: { condition: string; fulfillmentChannel: string; OfferCount: number }[];
    BuyBoxPrices?: { condition: string; ListingPrice?: { Amount: number }; LandedPrice?: { Amount: number } }[];
  };
  Offers?: { SellerId?: string; IsFulfilledByAmazon?: boolean }[];
}

export function offersToFields(p: OffersPayload, checkedAt: string) {
  const fields: Partial<ProductInput> = {};
  const prov: Record<string, ProvEntry> = {};
  const src = { kind: "VERIFIED" as const, source: "Amazon SP-API (Product Pricing offers)", checkedAt };
  const newOffers = p.Summary?.NumberOfOffers?.filter((o) => o.condition?.toLowerCase() === "new") ?? [];
  if (newOffers.length) {
    fields.sellerCount = newOffers.reduce((a, o) => a + o.OfferCount, 0);
    fields.fbaSellerCount = newOffers.filter((o) => o.fulfillmentChannel === "Amazon").reduce((a, o) => a + o.OfferCount, 0);
    prov.sellerCount = src;
    prov.fbaSellerCount = src;
  } else if (typeof p.Summary?.TotalOfferCount === "number") {
    fields.sellerCount = p.Summary.TotalOfferCount;
    prov.sellerCount = src;
  }
  const bb = p.Summary?.BuyBoxPrices?.find((b) => b.condition?.toLowerCase() === "new") ?? p.Summary?.BuyBoxPrices?.[0];
  const price = bb?.LandedPrice?.Amount ?? bb?.ListingPrice?.Amount;
  if (typeof price === "number") {
    fields.salePrice = price;
    prov.salePrice = { ...src, source: "Amazon SP-API Buy Box price", note: "Current Buy Box price; it may change." };
  }
  if (p.Offers) {
    fields.amazonOnListing = p.Offers.some((o) => o.SellerId === AMAZON_RETAIL_SELLER_ID);
    prov.amazonOnListing = { ...src, note: "Based on up to 20 returned offers." };
  }
  return { fields, prov, buyBoxPrice: typeof price === "number" ? price : null };
}

interface FeesPayload {
  FeesEstimateResult?: {
    Status?: string;
    FeesEstimate?: { FeeDetailList?: { FeeType: string; FinalFee?: { Amount: number } }[] };
    Error?: { Message?: string };
  };
}

export function feesToFields(p: FeesPayload, checkedAt: string, price: number) {
  const fields: Partial<ProductInput> = {};
  const prov: Record<string, ProvEntry> = {};
  const list = p.FeesEstimateResult?.FeesEstimate?.FeeDetailList ?? [];
  const get = (t: string) => list.find((f) => f.FeeType === t)?.FinalFee?.Amount;
  const referral = (get("ReferralFee") ?? 0) + (get("VariableClosingFee") ?? 0) + (get("PerItemFee") ?? 0);
  const fba = get("FBAFees");
  const src = { kind: "VERIFIED" as const, source: `Amazon SP-API fee estimate at $${price.toFixed(2)}`, checkedAt };
  if (list.length) {
    fields.referralFeeOverride = referral;
    prov.referralFeeOverride = src;
  }
  if (typeof fba === "number") {
    fields.fulfillmentFeeOverride = fba;
    prov.fulfillmentFeeOverride = src;
  }
  return { fields, prov, error: p.FeesEstimateResult?.Error?.Message ?? null };
}

interface RestrictionsBody {
  restrictions?: { reasons?: { message?: string; reasonCode?: string }[] }[];
}

export function restrictionsToFields(b: RestrictionsBody, checkedAt: string) {
  const reasons = (b.restrictions ?? []).flatMap((r) => r.reasons ?? []);
  return {
    fields: { restricted: reasons.length > 0, restrictionChecked: true } as Partial<ProductInput>,
    prov: { restricted: { kind: "VERIFIED" as const, source: "Amazon SP-API (Listings Restrictions)", checkedAt } },
    messages: reasons.map((r) => `Restriction: ${r.reasonCode ?? ""} ${r.message ?? ""}`.trim()),
  };
}

export function spApiProvider(): DataProvider {
  return {
    status: () => {
      const env = readEnv();
      return {
        id: "spapi",
        name: "Amazon SP-API",
        configured: !!env,
        capabilities: [
          "Catalog details (title, brand, UPC, package dimensions and weight)",
          "Sales rank",
          "Offer count, FBA offers, Buy Box price, whether Amazon is a seller",
          "Official fee estimate for your price",
          env?.sellerId ? "Listing restrictions for your account" : "Listing restrictions (needs SPAPI_SELLER_ID)",
        ],
        description: "Amazon's official Selling Partner API. Data is labeled VERIFIED with a timestamp.",
        setup:
          "Register a developer application in Seller Central, then set SPAPI_CLIENT_ID, SPAPI_CLIENT_SECRET, SPAPI_REFRESH_TOKEN, and SPAPI_SELLER_ID in .env.local.",
        cost: "Free API (requires an Amazon seller account)",
      };
    },

    async lookup(q: ParsedQuery, ctx) {
      const env = readEnv();
      if (!env) return null;
      const checkedAt = new Date().toISOString();
      const result: LookupResult = { providerId: "spapi", providerName: "Amazon SP-API", fields: { prov: {} }, messages: [] };
      const prov = result.fields.prov!;
      const mp = encodeURIComponent(env.marketplaceId);
      const included = "summaries,attributes,dimensions,identifiers,salesRanks";

      let asin = q.type === "asin" ? q.asin : q.type === "url" ? q.asin : null;
      try {
        if (!asin && q.type === "upc") {
          const body = (await api(
            env,
            `/catalog/2022-04-01/items?identifiers=${q.upc}&identifiersType=${q.upc.length === 13 ? "EAN" : "UPC"}&marketplaceIds=${mp}&includedData=${included}`,
          )) as { items?: CatalogItem[] };
          const items = body.items ?? [];
          if (items.length > 1)
            result.messages.push(
              `This UPC maps to ${items.length} listings (${items.map((i) => i.asin).join(", ")}); the first one is used. Check that it's the right variation or pack.`,
            );
          if (items[0]) {
            asin = items[0].asin;
            const c = catalogToFields(items[0], env.marketplaceId, checkedAt);
            Object.assign(result.fields, c.fields);
            Object.assign(prov, c.prov);
          }
        } else if (!asin && q.type === "name") {
          const body = (await api(
            env,
            `/catalog/2022-04-01/items?keywords=${encodeURIComponent(q.name)}&marketplaceIds=${mp}&includedData=summaries&pageSize=5`,
          )) as { items?: CatalogItem[] };
          const cands = (body.items ?? []).map((i) => `${i.asin} — ${i.summaries?.[0]?.itemName ?? "(no title)"}`);
          result.messages.push(
            cands.length
              ? `Possible listings (a name search can't confirm identity; re-run with the correct ASIN): ${cands.join("; ")}`
              : "No catalog results for that name.",
          );
          return result;
        } else if (asin) {
          const item = (await api(env, `/catalog/2022-04-01/items/${asin}?marketplaceIds=${mp}&includedData=${included}`)) as CatalogItem;
          const c = catalogToFields(item, env.marketplaceId, checkedAt);
          Object.assign(result.fields, c.fields);
          Object.assign(prov, c.prov);
        }
      } catch (e) {
        result.messages.push(`Catalog lookup failed: ${(e as Error).message}`);
      }
      if (!asin) return result.messages.length ? result : null;

      try {
        const body = (await api(env, `/products/pricing/v0/items/${asin}/offers?MarketplaceId=${mp}&ItemCondition=New`)) as {
          payload?: OffersPayload;
        };
        const o = offersToFields(body.payload ?? {}, checkedAt);
        Object.assign(result.fields, o.fields);
        Object.assign(prov, o.prov);
      } catch (e) {
        result.messages.push(`Offer lookup failed: ${(e as Error).message}`);
      }

      const price = ctx.price ?? (result.fields.salePrice as number | undefined) ?? null;
      if (price && price > 0) {
        try {
          const body = (await api(env, `/products/fees/v0/items/${asin}/feesEstimate`, {
            method: "POST",
            body: JSON.stringify({
              FeesEstimateRequest: {
                MarketplaceId: env.marketplaceId,
                IsAmazonFulfilled: (ctx.fulfillment ?? "FBA") === "FBA",
                PriceToEstimateFees: {
                  ListingPrice: { CurrencyCode: "USD", Amount: price },
                  Shipping: { CurrencyCode: "USD", Amount: 0 },
                },
                Identifier: `reseller-${asin}-${Date.now()}`,
              },
            }),
          })) as { payload?: FeesPayload };
          const f = feesToFields(body.payload ?? {}, checkedAt, price);
          Object.assign(result.fields, f.fields);
          Object.assign(prov, f.prov);
          if (f.error) result.messages.push(`Fee estimate: ${f.error}`);
        } catch (e) {
          result.messages.push(`Fee estimate failed: ${(e as Error).message}`);
        }
      }

      if (env.sellerId) {
        try {
          const body = (await api(
            env,
            `/listings/2021-08-01/restrictions?asin=${asin}&sellerId=${encodeURIComponent(env.sellerId)}&marketplaceIds=${mp}&conditionType=new_new`,
          )) as RestrictionsBody;
          const r = restrictionsToFields(body, checkedAt);
          Object.assign(result.fields, r.fields);
          Object.assign(prov, r.prov);
          result.messages.push(...r.messages);
        } catch (e) {
          result.messages.push(`Restriction check failed: ${(e as Error).message}`);
        }
      } else {
        result.messages.push("Set SPAPI_SELLER_ID to check listing restrictions for your account.");
      }
      return result;
    },
  };
}
