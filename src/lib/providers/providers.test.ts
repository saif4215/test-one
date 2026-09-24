import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { productInputSchema } from "@/lib/domain/product";
import { createProduct } from "@/lib/repo/products";
import { parseQuery } from "./identifiers";
import { gatherProduct } from "./index";
import { catalogToFields, feesToFields, offersToFields, restrictionsToFields, spApiProvider } from "./spapi";

describe("parseQuery", () => {
  it("recognizes ASINs, UPCs, Amazon URLs, retailer URLs, and names", () => {
    expect(parseQuery("B0ABCDEF12")).toMatchObject({ type: "asin", asin: "B0ABCDEF12" });
    expect(parseQuery("036000291452")).toMatchObject({ type: "upc", valid: true });
    expect(parseQuery("https://www.amazon.com/Some-Thing/dp/B0ABCDEF12/ref=x")).toMatchObject({ type: "url", asin: "B0ABCDEF12" });
    expect(parseQuery("https://www.target.com/p/thing/-/A-123")).toMatchObject({ type: "url", asin: null, host: "target.com" });
    expect(parseQuery("Lego Classic 11001")).toMatchObject({ type: "name" });
  });
});

describe("gatherProduct", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("says live data is unavailable when no API is configured, and never scrapes retailer URLs", async () => {
    delete process.env.SPAPI_CLIENT_ID;
    const db = openDatabase(":memory:");
    const r = await gatherProduct(db, "https://www.walmart.com/ip/12345");
    expect(r.liveDataUsed).toBe(false);
    expect(r.messages.join(" ")).toMatch(/Live data unavailable/);
    expect(r.messages.join(" ")).toMatch(/doesn't scrape/);
    expect(r.product.sourceUrl).toContain("walmart.com");
    expect(r.product.purchasePrice).toBeNull();
  });

  it("reuses saved research for a known ASIN", async () => {
    delete process.env.SPAPI_CLIENT_ID;
    const db = openDatabase(":memory:");
    createProduct(db, productInputSchema.parse({ name: "Saved", asin: "B0ABCDEF12", salePrice: 20 }));
    const r = await gatherProduct(db, "B0ABCDEF12");
    expect(r.product.name).toBe("Saved");
    expect(r.sourcesUsed).toEqual(["Your saved research"]);
  });

  it("reports SP-API as unconfigured without credentials", () => {
    delete process.env.SPAPI_CLIENT_ID;
    expect(spApiProvider().status().configured).toBe(false);
  });
});

describe("SP-API response parsing", () => {
  const at = "2026-09-24T12:00:00Z";
  it("parses catalog items with unit conversion", () => {
    const { fields, prov } = catalogToFields(
      {
        asin: "B0ABCDEF12",
        summaries: [{ marketplaceId: "ATVPDKIKX0DER", brand: "Acme", itemName: "Acme Widget" }],
        dimensions: [
          {
            marketplaceId: "ATVPDKIKX0DER",
            package: {
              length: { unit: "centimeters", value: 25.4 },
              width: { unit: "inches", value: 4 },
              height: { unit: "inches", value: 2 },
              weight: { unit: "ounces", value: 8 },
            },
          },
        ],
        identifiers: [{ marketplaceId: "ATVPDKIKX0DER", identifiers: [{ identifierType: "UPC", identifier: "036000291452" }] }],
        salesRanks: [{ marketplaceId: "ATVPDKIKX0DER", displayGroupRanks: [{ title: "Home & Kitchen", rank: 12345 }] }],
      },
      "ATVPDKIKX0DER",
      at,
    );
    expect(fields).toMatchObject({ name: "Acme Widget", brand: "Acme", upc: "036000291452", salesRank: 12345, weightLb: 0.5 });
    expect(fields.lengthIn).toBeCloseTo(10);
    expect(prov.weightLb.kind).toBe("VERIFIED");
  });
  it("parses offers, fees, and restrictions", () => {
    const o = offersToFields(
      {
        Summary: {
          NumberOfOffers: [
            { condition: "new", fulfillmentChannel: "Amazon", OfferCount: 3 },
            { condition: "new", fulfillmentChannel: "Merchant", OfferCount: 2 },
          ],
          BuyBoxPrices: [{ condition: "New", LandedPrice: { Amount: 24.99 } }],
        },
        Offers: [{ SellerId: "X" }, { SellerId: "ATVPDKIKX0DER" }],
      },
      at,
    );
    expect(o.fields).toMatchObject({ sellerCount: 5, fbaSellerCount: 3, salePrice: 24.99, amazonOnListing: true });
    const f = feesToFields(
      {
        FeesEstimateResult: {
          FeesEstimate: {
            FeeDetailList: [
              { FeeType: "ReferralFee", FinalFee: { Amount: 3.75 } },
              { FeeType: "FBAFees", FinalFee: { Amount: 4.15 } },
            ],
          },
        },
      },
      at,
      24.99,
    );
    expect(f.fields).toMatchObject({ referralFeeOverride: 3.75, fulfillmentFeeOverride: 4.15 });
    const r = restrictionsToFields({ restrictions: [{ reasons: [{ reasonCode: "APPROVAL_REQUIRED", message: "Apply to sell" }] }] }, at);
    expect(r.fields).toMatchObject({ restricted: true, restrictionChecked: true });
    expect(restrictionsToFields({ restrictions: [] }, at).fields.restricted).toBe(false);
  });
});
