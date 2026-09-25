import { describe, expect, it } from "vitest";
import { effectiveFeeTable } from "@/lib/analysis/feeTable";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import {
  analyzeSheet,
  ANALYSIS_COLUMNS,
  detectMapping,
  parseCsv,
  parseIdentifierList,
  parseUpload,
  parseXlsx,
  rowToProduct,
  toCsv,
  toXlsx,
  type ImportOptions,
} from "./spreadsheet";

const opts: ImportOptions = {
  filename: "buylist.csv",
  marketDataKind: "THIRD_PARTY",
  asOf: "2026-09-24T12:00:00Z",
  defaultCategory: "Home & Kitchen",
  fulfillment: "FBA",
};
const ctx = { settings: DEFAULT_SETTINGS, feeTable: effectiveFeeTable(DEFAULT_SETTINGS), now: new Date("2026-09-24T13:00:00Z") };

const CSV = `Title,Brand,ASIN,Buy Cost,Amazon Price,Qty,Weight,Length,Width,Height,Sellers,BSR,Monthly Sales,My Notes
Spatula Set,Acme,b0test1234,$8.00,24.99,10,0.6,12,4,2,4,15000,90,clearance aisle
Mystery Box,,,5,,,,,,,,,,no price yet
`;

describe("spreadsheet import", () => {
  it("detects common column names", () => {
    const { headers } = parseCsv(CSV);
    const m = detectMapping(headers);
    expect(headers[m.name!]).toBe("Title");
    expect(headers[m.purchasePrice!]).toBe("Buy Cost");
    expect(headers[m.salePrice!]).toBe("Amazon Price");
    expect(headers[m.salesRank!]).toBe("BSR");
    expect(headers[m.listingMonthlySalesLow!]).toBe("Monthly Sales");
    expect(m.notes).toBeUndefined(); // "My Notes" isn't an exact alias; stays unmapped but preserved
  });

  it("converts rows with provenance and labels market data by the chosen kind", () => {
    const s = parseCsv(CSV);
    const p = rowToProduct(s.rows[0], s.headers, detectMapping(s.headers), opts);
    expect(p).toMatchObject({ name: "Spatula Set", asin: "B0TEST1234", purchasePrice: 8, salePrice: 24.99, category: "Home & Kitchen" });
    expect(p.prov.purchasePrice.kind).toBe("USER_PROVIDED");
    expect(p.prov.salesRank.kind).toBe("THIRD_PARTY");
    expect(p.listingMonthlySalesHigh).toBe(90);
  });

  it("keeps every original column and appends the analysis columns", () => {
    const s = parseCsv(CSV);
    const out = analyzeSheet(s, detectMapping(s.headers), opts, ctx);
    expect(out.headers.slice(0, s.headers.length)).toEqual(s.headers);
    expect(out.headers.slice(s.headers.length)).toEqual([...ANALYSIS_COLUMNS]);
    expect(out.rows[0].slice(0, s.headers.length)).toEqual(s.rows[0]);
    expect(out.rows[0][s.headers.length + 5]).not.toBe("Unknown"); // profit computed
    expect(out.rows[1][s.headers.length + 5]).toBe("Unknown"); // no sale price, so profit is Unknown
    const csv = toCsv(out.headers, out.rows);
    expect(parseCsv(csv).rows[1][13]).toBe("no price yet");
  });

  it("round-trips XLSX", async () => {
    const s = parseCsv(CSV);
    const out = analyzeSheet(s, detectMapping(s.headers), opts, ctx);
    const buf = await toXlsx(out.headers, out.rows, s.headers.length);
    const back = await parseXlsx(buf);
    expect(back.headers).toEqual(out.headers);
    expect(back.rows[0][0]).toBe("Spatula Set");
  });

  it("treats a one-column file of identifiers as a list", async () => {
    const text = "B0ABCDEF12\n036000291452\nhttps://www.amazon.com/dp/B0ZZZZZZZ1\n";
    const sheet = await parseUpload("asins.csv", new TextEncoder().encode(text).buffer as ArrayBuffer);
    expect(sheet.rows).toHaveLength(3);
    const ps = sheet.rows.map((r) => rowToProduct(r, sheet.headers, {}, opts));
    expect(ps[0].asin).toBe("B0ABCDEF12");
    expect(ps[1].upc).toBe("036000291452");
    expect(ps[2].asin).toBe("B0ZZZZZZZ1");
    expect(parseIdentifierList("a\n\nb").rows).toHaveLength(2);
  });
});
