import type { PriceObservation } from "@/lib/calc/priceHistory";
import type { ProductInput } from "@/lib/domain/product";
import type { ParsedQuery } from "./identifiers";

export interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  /** What this provider can supply. */
  capabilities: string[];
  description: string;
  /** How to enable it, when it isn't configured. */
  setup?: string;
  cost: string;
}

export interface LookupResult {
  providerId: string;
  providerName: string;
  /** Fields found. Each also gets an entry in `fields.prov` with its kind, source, and timestamp. */
  fields: Partial<ProductInput>;
  priceObservations?: PriceObservation[];
  messages: string[];
}

export interface DataProvider {
  status(): ProviderStatus;
  /** Returns null when this provider has nothing for the query. It never invents values. */
  lookup(q: ParsedQuery, ctx: { price?: number | null; fulfillment?: "FBA" | "FBM" }): Promise<LookupResult | null>;
}
