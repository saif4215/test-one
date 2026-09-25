/**
 * Bulk scanning (§34, §60): parse CSV/XLSX or pasted ASIN/UPC/URL lists,
 * map columns to product fields, analyze each row, and export the ORIGINAL
 * columns with analysis columns appended. Original data is never removed.
 */
import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { FeeTable } from "@/data/feeTables.us";
import { analyzeProduct, type DealAnalysis } from "@/lib/analysis/analyzeProduct";
import type { DataKind } from "@/lib/data/provenance";
import { productInputSchema, type ProductInput, type ProvEntry } from "@/lib/domain/product";
import type { Settings } from "@/lib/domain/settings";
import { parseNumber } from "@/lib/format";
import { parseQuery } from "@/lib/providers/identifiers";

export const MAX_ROWS = 5000;

export interface Sheet {
  headers: string[];
  rows: string[][];
}

export type MappableField =
  | "name"
  | "brand"
  | "asin"
  | "upc"
  | "category"
  | "sourceName"
  | "sourceUrl"
  | "purchasePrice"
  | "salePrice"
  | "quantity"
  | "weightLb"
  | "lengthIn"
  | "widthIn"
  | "heightIn"
  | "referralFeeOverride"
  | "fulfillmentFeeOverride"
  | "prepPerUnit"
  | "inboundPerUnit"
  | "sellerCount"
  | "fbaSellerCount"
  | "salesRank"
  | "listingMonthlySalesLow"
  | "listingMonthlySalesHigh"
  | "condition"
  | "notes";

/** Common header spellings for each field. Headers are compared lowercase with non-alphanumerics removed. */
export const FIELD_ALIASES: Record<MappableField, string[]> = {
  name: ["name", "title", "product", "productname", "producttitle", "item", "itemname", "description"],
  brand: ["brand", "manufacturer", "brandname"],
  asin: ["asin", "amazonasin"],
  upc: ["upc", "ean", "gtin", "barcode", "upcean", "upccode"],
  category: ["category", "amazoncategory", "rootcategory"],
  sourceName: ["source", "supplier", "store", "vendor", "retailer"],
  sourceUrl: ["url", "sourceurl", "link", "producturl", "supplierurl"],
  purchasePrice: ["cost", "buycost", "buyprice", "purchaseprice", "unitcost", "wholesale", "wholesaleprice", "costperunit", "price", "casecostperunit"],
  salePrice: ["sellprice", "saleprice", "sellingprice", "amazonprice", "buybox", "buyboxprice", "expectedprice", "listprice", "amazonsaleprice"],
  quantity: ["qty", "quantity", "units", "moq", "casepack"],
  weightLb: ["weight", "weightlb", "weightlbs", "itemweight", "packageweight", "weightpounds"],
  lengthIn: ["length", "lengthin", "packagelength"],
  widthIn: ["width", "widthin", "packagewidth"],
  heightIn: ["height", "heightin", "packageheight"],
  referralFeeOverride: ["referralfee", "referral"],
  fulfillmentFeeOverride: ["fbafee", "fulfillmentfee", "pickpackfee"],
  prepPerUnit: ["prep", "prepcost", "prepfee"],
  inboundPerUnit: ["inbound", "inboundshipping", "shippingtoamazon", "inboundcost"],
  sellerCount: ["sellers", "sellercount", "offers", "offercount", "numberofsellers"],
  fbaSellerCount: ["fbasellers", "fbaoffers", "fbasellercount"],
  salesRank: ["rank", "salesrank", "bsr", "bestsellersrank"],
  listingMonthlySalesLow: ["monthlysales", "estmonthlysales", "estimatedmonthlysales", "salespermonth", "monthlysaleslow"],
  listingMonthlySalesHigh: ["monthlysaleshigh"],
  condition: ["condition"],
  notes: ["notes", "note", "comments"],
};

export const MAPPABLE_FIELDS = Object.keys(FIELD_ALIASES) as MappableField[];

export type Mapping = Partial<Record<MappableField, number>>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function detectMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<number>();
  const normalized = headers.map(norm);
  // Exact alias matches first, in alias priority order.
  for (const field of MAPPABLE_FIELDS) {
    for (const alias of FIELD_ALIASES[field]) {
      const idx = normalized.findIndex((h, i) => h === alias && !used.has(i));
      if (idx >= 0) {
        mapping[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return mapping;
}

/** A plain list of identifiers (one per line), e.g. ASINs, UPCs, or URLs. */
export function parseIdentifierList(text: string): Sheet {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return { headers: ["Input"], rows: lines.map((l) => [l]) };
}

export function parseCsv(text: string): Sheet {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const [headers = [], ...rows] = res.data;
  return { headers: headers.map((h) => String(h).trim()), rows: rows.map((r) => r.map((c) => String(c ?? ""))) };
}

export async function parseXlsx(buf: ArrayBuffer): Promise<Sheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const all: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(row.getCell(c).text ?? "");
    all.push(cells);
  });
  const [headers = [], ...rows] = all;
  return { headers: headers.map((h) => h.trim()), rows };
}

export async function parseUpload(filename: string, data: ArrayBuffer): Promise<Sheet> {
  if (/\.xlsx$/i.test(filename)) return parseXlsx(data);
  if (/\.xls$/i.test(filename)) throw new Error("Legacy .xls isn't supported. Save the file as .xlsx or .csv.");
  const text = new TextDecoder().decode(data);
  const sheet = parseCsv(text);
  // A single-column file without a recognizable header row is treated as an identifier list.
  if (sheet.headers.length === 1 && parseQuery(sheet.headers[0]).type !== "name") return parseIdentifierList(text);
  return sheet;
}

export interface ImportOptions {
  filename: string;
  /** Where the sales/competition numbers came from. */
  marketDataKind: DataKind;
  /** ISO timestamp the data was pulled or checked. */
  asOf: string;
  defaultCategory: string | null;
  fulfillment: "FBA" | "FBM";
}

const MARKET = new Set<MappableField>(["sellerCount", "fbaSellerCount", "salesRank", "listingMonthlySalesLow", "listingMonthlySalesHigh"]);
const NUMERIC = new Set<MappableField>([
  "purchasePrice",
  "salePrice",
  "quantity",
  "weightLb",
  "lengthIn",
  "widthIn",
  "heightIn",
  "referralFeeOverride",
  "fulfillmentFeeOverride",
  "prepPerUnit",
  "inboundPerUnit",
  "sellerCount",
  "fbaSellerCount",
  "salesRank",
  "listingMonthlySalesLow",
  "listingMonthlySalesHigh",
]);

export function rowToProduct(row: string[], headers: string[], mapping: Mapping, opts: ImportOptions): ProductInput {
  const out: Record<string, unknown> = { fulfillment: opts.fulfillment };
  const prov: Record<string, ProvEntry> = {};
  const src = `Spreadsheet: ${opts.filename}`;
  for (const [field, idx] of Object.entries(mapping) as [MappableField, number][]) {
    const raw = (row[idx] ?? "").trim();
    if (!raw) continue;
    if (NUMERIC.has(field)) {
      const n = parseNumber(raw);
      if (n === null) continue;
      out[field] = n;
      prov[field] = {
        kind: MARKET.has(field) ? opts.marketDataKind : "USER_PROVIDED",
        source: `${src} (column "${headers[idx]}")`,
        checkedAt: opts.asOf,
      };
    } else {
      out[field] = raw;
    }
  }
  // Identifier-only lists: work out what each line is.
  if (mapping.asin === undefined && mapping.upc === undefined && mapping.name === undefined && row.length === 1) {
    const q = parseQuery(row[0]);
    if (q.type === "asin") out.asin = q.asin;
    else if (q.type === "upc") out.upc = q.upc;
    else if (q.type === "url") {
      if (q.asin) out.asin = q.asin;
      else {
        out.sourceUrl = q.url;
        out.sourceName = q.host;
      }
    } else if (q.type === "name") out.name = q.name;
  }
  if (typeof out.asin === "string") out.asin = out.asin.toUpperCase();
  if (!out.category && opts.defaultCategory) out.category = opts.defaultCategory;
  if (!out.name) out.name = (out.asin as string) ?? (out.upc as string) ?? "";
  // A single monthly-sales column is used as both the low and high estimate.
  if (out.listingMonthlySalesLow !== undefined && out.listingMonthlySalesHigh === undefined) {
    out.listingMonthlySalesHigh = out.listingMonthlySalesLow;
    prov.listingMonthlySalesHigh = prov.listingMonthlySalesLow;
  }
  out.prov = prov;
  return productInputSchema.parse(out);
}

export const ANALYSIS_COLUMNS = [
  "Est. Revenue (est.)",
  "Est. Amazon Fees (est.)",
  "Est. Shipping (est.)",
  "Est. Prep (est.)",
  "Est. Total Cost (est.)",
  "Est. Profit (est.)",
  "ROI % (est.)",
  "Margin % (est.)",
  "Break-even Price",
  "Max Buy Price",
  "Competition",
  "Sales Indicators",
  "Est. Your Monthly Sales (est.)",
  "Risk",
  "Risk Factors",
  "Data Confidence",
  "Filter Status",
  "Filter Reasons",
  "Source",
  "Missing Information",
  "Notes",
] as const;

const money = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "Unknown" : n.toFixed(2));
const pct = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "Unknown" : n.toFixed(1));

export function analysisCells(a: DealAnalysis): string[] {
  const p = a.product;
  const u = a.unit;
  const line = (k: string) => a.costLines.find((c) => c.key === k)?.value ?? null;
  const qty = p.quantity && p.quantity > 0 ? p.quantity : 1;
  return [
    u ? money(u.salePrice * qty) : "Unknown",
    money(u?.amazonFees),
    money(line("inbound")),
    money((line("prep") ?? 0) + (line("packaging") ?? 0)),
    money(u?.totalCost),
    money(u?.profit),
    pct(u?.roiPct),
    pct(u?.marginPct),
    money(a.breakEvenPrice),
    money(a.maxBuyCost),
    p.sellerCount === null ? "Unknown" : `${p.sellerCount} sellers${p.amazonOnListing ? ", Amazon on listing" : ""}`,
    [p.salesRank !== null ? `Rank #${p.salesRank}` : null, p.listingMonthlySalesLow !== null ? `Listing ~${p.listingMonthlySalesLow}${p.listingMonthlySalesHigh !== p.listingMonthlySalesLow ? `–${p.listingMonthlySalesHigh}` : ""}/mo` : null]
      .filter(Boolean)
      .join("; ") || "Unknown",
    a.velocity.sufficient ? `${a.velocity.monthly.low.toFixed(1)}–${a.velocity.monthly.high.toFixed(1)}` : "Insufficient data",
    a.overallRisk,
    a.risks
      .filter((r) => r.level === "HIGH" || r.level === "MEDIUM")
      .map((r) => `${r.category} (${r.level})`)
      .join("; ") || "None flagged from available data",
    a.confidence.level,
    a.filter.status,
    a.filter.results.filter((r) => r.status !== "PASS").map((r) => `${r.criterion}: ${r.reason}`).join("; "),
    p.sourceName ?? p.sourceUrl ?? "Unknown",
    a.missing.join("; "),
    [a.unknownCosts.length ? `Profit excludes unknown costs: ${a.unknownCosts.join(", ")}` : "", "Estimates only: verify before purchasing"].filter(Boolean).join(". "),
  ];
}

export interface AnalyzedSheet {
  headers: string[];
  rows: string[][];
  analyses: DealAnalysis[];
}

export function analyzeSheet(
  sheet: Sheet,
  mapping: Mapping,
  opts: ImportOptions,
  ctx: { settings: Settings; feeTable: FeeTable; now?: Date },
): AnalyzedSheet {
  const analyses: DealAnalysis[] = [];
  const rows: string[][] = [];
  const width = sheet.headers.length;
  for (const row of sheet.rows.slice(0, MAX_ROWS)) {
    const product = rowToProduct(row, sheet.headers, mapping, opts);
    const a = analyzeProduct(product, { settings: ctx.settings, feeTable: ctx.feeTable, now: ctx.now, checkedAt: opts.asOf });
    analyses.push(a);
    const padded = [...row, ...Array(Math.max(0, width - row.length)).fill("")].slice(0, Math.max(width, row.length));
    rows.push([...padded, ...analysisCells(a)]);
  }
  return { headers: [...sheet.headers, ...ANALYSIS_COLUMNS], rows, analyses };
}

export function toCsv(headers: string[], rows: string[][]): string {
  return Papa.unparse({ fields: headers, data: rows });
}

export async function toXlsx(headers: string[], rows: string[][], originalColumnCount: number): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Analyzed");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell, col) => {
    if (col > originalColumnCount) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E0" } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const notes = wb.addWorksheet("About");
  notes.addRow(["Columns marked (est.) are estimates calculated by Amazon Reselling AI."]);
  notes.addRow(["Amazon fees come from a reference table unless your file supplied them. Verify against Seller Central."]);
  notes.addRow(["Original columns are unchanged. Unknown means the data wasn't available."]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
