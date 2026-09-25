import { createVerify, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { productInputSchema } from "@/lib/domain/product";
import { parseCseItems, googleSearchProvider } from "@/lib/providers/googleSearch";
import { parseQuery } from "@/lib/providers/identifiers";
import { createProduct } from "@/lib/repo/products";
import { clearTokenCache, getAccessToken, readServiceAccount, SHEETS_SCOPE, signJwt, TOKEN_URL } from "./auth";
import { parseSheetId, SheetsClient, tabRange } from "./sheets";
import { buildSyncTabs } from "./sync";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const sa = { email: "bot@example.iam.gserviceaccount.com", privateKey };

type Call = { url: string; init?: RequestInit };
function mockFetch(responses: ((c: Call) => unknown)[]) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    const body = (responses[calls.length - 1] ?? responses[responses.length - 1])(call);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fn, calls };
}

describe("Google auth", () => {
  beforeEach(() => clearTokenCache());

  it("reads the service account from env, unescaping \\n in the key", () => {
    const got = readServiceAccount({ GOOGLE_SERVICE_ACCOUNT_EMAIL: "a@b", GOOGLE_PRIVATE_KEY: "line1\\nline2" } as unknown as NodeJS.ProcessEnv);
    expect(got).toEqual({ email: "a@b", privateKey: "line1\nline2" });
    expect(readServiceAccount({} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("signs a verifiable RS256 JWT with the right claims", () => {
    const jwt = signJwt(sa, SHEETS_SCOPE, 1_700_000_000_000);
    const [h, c, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({
      iss: sa.email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("exchanges the JWT for an access token and caches it", async () => {
    const { fn, calls } = mockFetch([() => ({ access_token: "tok", expires_in: 3600 })]);
    expect(await getAccessToken(sa, SHEETS_SCOPE, fn)).toBe("tok");
    expect(await getAccessToken(sa, SHEETS_SCOPE, fn)).toBe("tok");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(TOKEN_URL);
    const params = new URLSearchParams(String(calls[0].init?.body));
    expect(params.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(params.get("assertion")?.split(".")).toHaveLength(3);
  });
});

describe("Google Sheets client", () => {
  beforeEach(() => clearTokenCache());

  it("parses sheet IDs from URLs", () => {
    expect(parseSheetId("https://docs.google.com/spreadsheets/d/1AbC_dEf-1234567890xyzXYZ/edit#gid=0")).toBe("1AbC_dEf-1234567890xyzXYZ");
    expect(parseSheetId("1AbC_dEf-1234567890xyzXYZ")).toBe("1AbC_dEf-1234567890xyzXYZ");
    expect(parseSheetId("not a sheet")).toBeNull();
    expect(tabRange("Bob's tab")).toBe("'Bob''s tab'");
  });

  it("adds missing tabs, clears, then writes raw values", async () => {
    const { fn, calls } = mockFetch([
      () => ({ access_token: "tok", expires_in: 3600 }),
      () => ({ sheets: [{ properties: { title: "Products" } }] }),
      () => ({}),
      () => ({}),
      () => ({}),
    ]);
    const c = new SheetsClient(sa, "SHEET123", fn);
    await c.ensureTabs(["Products", "Inventory"]);
    await c.writeTab("Inventory", [["SKU", "Qty"], ["A", 2]]);
    const [, titles, add, clear, put] = calls;
    expect(titles.url).toContain("/SHEET123?fields=sheets.properties.title");
    expect(JSON.parse(String(add.init?.body))).toEqual({ requests: [{ addSheet: { properties: { title: "Inventory" } } }] });
    expect(clear.url).toContain(`/values/${encodeURIComponent("'Inventory'")}:clear`);
    expect(put.init?.method).toBe("PUT");
    expect(put.url).toContain("valueInputOption=RAW");
    expect(JSON.parse(String(put.init?.body)).values).toEqual([["SKU", "Qty"], ["A", 2]]);
    expect((put.init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
});

describe("Google price lookup", () => {
  it("parses candidates without inventing prices", () => {
    const c = parseCseItems(
      [
        { title: "Widget at Store", link: "https://store.example/w", displayLink: "store.example", pagemap: { offer: [{ price: "$12.99", pricecurrency: "USD" }] } },
        { title: "Widget review", link: "https://blog.example/w" },
      ],
      "2026-09-25T00:00:00Z",
    );
    expect(c[0]).toMatchObject({ price: 12.99, currency: "USD", source: "store.example" });
    expect(c[1].price).toBeNull();
  });

  it("is off without keys, and never fills the purchase price", async () => {
    expect(googleSearchProvider({} as unknown as NodeJS.ProcessEnv).status().configured).toBe(false);
    const { fn } = mockFetch([() => ({ items: [{ title: "W", link: "https://s.example/w", pagemap: { offer: [{ price: "9.99" }] } }] })]);
    const p = googleSearchProvider({ GOOGLE_CSE_KEY: "k", GOOGLE_CSE_ID: "cx" } as unknown as NodeJS.ProcessEnv, fn);
    const r = await p.lookup(parseQuery("Example Widget 16oz"), {});
    expect(r?.candidates).toHaveLength(1);
    expect(r?.fields).toEqual({});
  });
});

describe("sync tabs", () => {
  it("builds one tab per area with a timestamp row and headers", () => {
    const db = openDatabase(":memory:");
    createProduct(db, productInputSchema.parse({ name: "Widget", purchasePrice: 5, salePrice: 20, category: "Toys & Games" }));
    const tabs = buildSyncTabs(db, new Date("2026-09-25T00:00:00Z"));
    expect(Object.keys(tabs)).toEqual(["Products", "Inventory", "Purchase Orders", "Cash Flow", "Suppliers"]);
    expect(String(tabs.Products[0][0])).toContain("2026-09-25T00:00:00.000Z");
    expect(tabs.Products[1]).toContain("Est. Profit (est.)");
    expect(tabs.Products[2][1]).toBe("Widget");
  });
});
