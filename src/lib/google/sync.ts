/**
 * Google Sheets sync: writes your records to one tab per area, each with a
 * "synced at" row so it's clear how fresh the data is.
 */
import { analyzeAll } from "@/lib/analysis/load";
import { classify, poTotals, TRANSACTION_LABEL, type TransactionType } from "@/lib/calc/ledger";
import { landed, onHand } from "@/lib/calc/metrics";
import type { DB } from "@/lib/db/client";
import { DATA_KIND_LABEL } from "@/lib/data/provenance";
import { ANALYSIS_COLUMNS, analysisCells } from "@/lib/import/spreadsheet";
import { listInventory, listPurchaseOrders, listSuppliers, listTransactions } from "@/lib/repo/operations";
import { readServiceAccount } from "./auth";
import { parseSheetId, SheetsClient } from "./sheets";

type Row = (string | number | null)[];

export function sheetsConfig(env: NodeJS.ProcessEnv = process.env) {
  const sa = readServiceAccount(env);
  const sheetId = env.GOOGLE_SHEET_ID ? parseSheetId(env.GOOGLE_SHEET_ID) : null;
  return { sa, sheetId, configured: !!sa, syncConfigured: !!sa && !!sheetId };
}

export function buildSyncTabs(db: DB, now = new Date()): Record<string, Row[]> {
  const stamp: Row = [`Synced from Amazon Reselling AI at ${now.toISOString()}. Estimates are labeled; verify before purchasing.`];
  const products = analyzeAll(db);
  const productRows: Row[] = [
    stamp,
    ["ID", "Name", "Brand", "ASIN", "UPC", "Category", "Status", "Source", "Source URL", "Purchase price", "Purchase price source", "Sale price", "Sale price source", "Sale price checked", "Sellers", "Sales rank", ...ANALYSIS_COLUMNS],
    ...products.map(({ rec, analysis }): Row => {
      const p = rec.data;
      const kind = (k: string) => (p.prov[k] ? `${DATA_KIND_LABEL[p.prov[k].kind]}${p.prov[k].source ? `: ${p.prov[k].source}` : ""}` : "");
      return [rec.id, p.name, p.brand, p.asin, p.upc, p.category, rec.status, p.sourceName, p.sourceUrl, p.purchasePrice, kind("purchasePrice"), p.salePrice, kind("salePrice"), p.prov.salePrice?.checkedAt ?? "", p.sellerCount, p.salesRank, ...analysisCells(analysis)];
    }),
  ];
  const inventoryRows: Row[] = [
    stamp,
    ["SKU", "ASIN", "Name", "Brand", "Supplier", "Purchase date", "Unit cost", "Shipping/unit", "Prep/unit", "Landed cost", "Purchased", "Received", "Sent", "Sold", "On hand", "Sale price", "Fees/unit", "Est. profit/unit", "Location", "Expiration", "Lot", "Notes"],
    ...listInventory(db).map((i): Row => [
      i.sku, i.asin, i.name, i.brand, i.supplierName, i.purchaseDate, i.unitCost, i.shippingPerUnit, i.prepPerUnit, landed(i), i.qtyPurchased, i.qtyReceived, i.qtySent, i.qtySold, onHand(i), i.salePrice, i.feesPerUnit,
      i.salePrice !== null && i.feesPerUnit !== null ? Number((i.salePrice - i.feesPerUnit - landed(i)).toFixed(2)) : "Unknown",
      i.storageLocation, i.expirationDate, i.lot, i.notes,
    ]),
  ];
  const poRows: Row[] = [stamp, ["PO", "Supplier", "Date", "Status", "Product", "SKU", "ASIN", "Qty", "Unit cost", "Landed cost/unit", "Expected sale", "Expected fees/unit", "Est. line profit"]];
  for (const po of listPurchaseOrders(db)) {
    const t = poTotals(po.lines, po.shipping, po.otherCosts);
    for (const l of t.lines) poRows.push([po.poNumber, po.supplierName, po.date, po.status, l.product, l.sku ?? "", l.asin ?? "", l.quantity, l.unitCost, Number(l.landedUnitCost.toFixed(2)), l.expectedSalePrice ?? "", l.expectedFeesPerUnit ?? "", l.expectedProfit === null ? "Unknown" : Number(l.expectedProfit.toFixed(2))]);
  }
  const cashRows: Row[] = [
    stamp,
    ["Date", "Type", "Group", "Amount", "Description"],
    ...listTransactions(db).map((t): Row => [t.date, TRANSACTION_LABEL[t.type as TransactionType] ?? t.type, classify(t.type as TransactionType), t.amount, t.description]),
  ];
  const supplierRows: Row[] = [
    stamp,
    ["Name", "Website", "Contact", "Location", "Products", "MOQ", "Pricing", "Shipping terms", "Payment terms", "Lead time (days)", "Return policy", "Invoices", "Authorization", "Reliability notes", "Last order", "Last price", "Current price"],
    ...listSuppliers(db).map((s): Row => [s.name, s.website, s.contact, s.location, s.products, s.moq, s.pricing, s.shippingTerms, s.paymentTerms, s.leadTimeDays, s.returnPolicy, s.invoiceAvailable === null ? "Unknown" : s.invoiceAvailable ? "Yes" : "No", s.authorizationStatus, s.reliabilityNotes, s.lastOrderDate, s.lastPrice, s.currentPrice]),
  ];
  return { Products: productRows, Inventory: inventoryRows, "Purchase Orders": poRows, "Cash Flow": cashRows, Suppliers: supplierRows };
}

export async function syncToGoogleSheets(db: DB, fetchImpl: typeof fetch = fetch): Promise<{ tabs: string[]; rows: number }> {
  const cfg = sheetsConfig();
  if (!cfg.sa) throw new Error("Google service account isn't configured (set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY).");
  if (!cfg.sheetId) throw new Error("Set GOOGLE_SHEET_ID to the spreadsheet ID or URL to sync to.");
  const client = new SheetsClient(cfg.sa, cfg.sheetId, fetchImpl);
  const tabs = buildSyncTabs(db);
  await client.ensureTabs(Object.keys(tabs));
  let rows = 0;
  for (const [title, data] of Object.entries(tabs)) {
    await client.writeTab(title, data);
    rows += data.length - 2;
  }
  return { tabs: Object.keys(tabs), rows };
}
