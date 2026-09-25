/**
 * Loads FICTIONAL demo data so you can explore the app: `npm run seed:demo`.
 *
 * Every record is named "SAMPLE" and none of it is real market data: the
 * prices, sales, and restriction answers are made up. It refuses to run
 * against a database that already has products unless you pass --force.
 * Point DATABASE_PATH at a separate file to keep demo data away from your real records.
 */
import fs from "node:fs";
import path from "node:path";
import { runDealFinder } from "@/lib/alerts/dealFinder";
import { getDb } from "@/lib/db/client";
import { productInputSchema } from "@/lib/domain/product";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { detectMapping, parseCsv, rowToProduct } from "@/lib/import/spreadsheet";
import { createImport } from "@/lib/repo/imports";
import { addTransaction, createPurchaseOrder, createSupplier, listInventory, receivePurchaseOrder, recordSale } from "@/lib/repo/operations";
import { addPriceObservation, createProduct, getProduct, listProducts, saveSettings, setProductStatus, setProductWatch, updateProduct } from "@/lib/repo/products";

const db = getDb();
if (listProducts(db).length && !process.argv.includes("--force")) {
  console.error("This database already has products. Use a separate DATABASE_PATH, or pass --force.");
  process.exit(1);
}

const day = (n: number) => new Date(Date.now() - n * 86_400_000);
const iso = (n: number) => day(n).toISOString();
const date = (n: number) => iso(n).slice(0, 10);

saveSettings(db, {
  ...DEFAULT_SETTINGS,
  onboarded: true,
  businessName: "SAMPLE Reselling Co",
  startingBudget: 1000,
  sourcing: ["retail", "online", "wholesale"],
  targetMinProfit: 5,
  targetRoiPct: 30,
  targetMarginPct: 15,
  hasSellerAccount: "yes",
  sellerPlan: "professional",
});

// Import the sample buy list exactly as a user would.
const csvPath = path.join(process.cwd(), "samples", "products.csv");
const sheet = parseCsv(fs.readFileSync(csvPath, "utf8"));
const mapping = detectMapping(sheet.headers);
const options = { filename: "products.csv", marketDataKind: "THIRD_PARTY" as const, asOf: iso(1), defaultCategory: null, fulfillment: "FBA" as const };
const batch = createImport(db, { filename: "products.csv", sheet, mapping, options });
const ids = sheet.rows.map((r) => createProduct(db, rowToProduct(r, sheet.headers, mapping, options), { importBatch: batch }));

// Pretend the user checked a couple of products in Seller Central (fictional answers).
for (const id of ids.slice(0, 2)) {
  const rec = getProduct(db, id)!;
  updateProduct(db, id, productInputSchema.parse({ ...rec.data, restricted: false, restrictionChecked: true, brandGated: false, hazmat: false, expiring: false, fragile: false, amazonOnListing: false }));
}

// Fictional price history for the first product, then watch it.
const prices = [22.99, 23.49, 24.99, 24.49, 23.99, 24.99, 25.49, 24.99, 24.99];
prices.forEach((p, i) => addPriceObservation(db, { productId: ids[0], price: p, at: iso(85 - i * 10), sellerCount: 3 + Math.floor(i / 3), source: "SAMPLE observation" }));
setProductWatch(db, ids[0], true);
setProductStatus(db, ids[0], "watch");

// Operations: a supplier, a received PO, sales, and cash-flow entries (all fictional).
const supplierId = createSupplier(db, {
  name: "SAMPLE Example Wholesale Co",
  website: "https://example.com",
  contact: "orders@example.com",
  location: "Example City",
  products: "Kitchen tools",
  moq: "1 case (24 units)",
  pricing: "Case pricing",
  shippingTerms: "Flat $40 per order",
  paymentTerms: "Prepaid",
  leadTimeDays: 10,
  returnPolicy: "Defective units only",
  invoiceAvailable: true,
  authorizationStatus: "authorized",
  reliabilityNotes: "Fictional supplier for the demo",
});
addTransaction(db, { date: date(100), type: "capital_contribution", amount: 1000, description: "SAMPLE starting capital" });
const po = createPurchaseOrder(db, {
  supplierId,
  supplierName: "SAMPLE Example Wholesale Co",
  date: date(95),
  shipping: 40,
  otherCosts: 0,
  lines: [
    { product: "SAMPLE Silicone Spatula Set", asin: "B0SAMPLE01", quantity: 24, unitCost: 8, expectedSalePrice: 24.99, expectedFeesPerUnit: 8.5 },
    { product: "SAMPLE Puzzle 500pc", asin: "B0SAMPLE02", quantity: 12, unitCost: 6.5, expectedSalePrice: 19.99, expectedFeesPerUnit: 7.9 },
  ],
});
receivePurchaseOrder(db, po);
const [spatula, puzzle] = listInventory(db).sort((a, b) => a.id - b.id);
const salePlan: [number, number, number][] = [
  [spatula.id, 80, 3], [spatula.id, 70, 2], [spatula.id, 55, 4], [spatula.id, 40, 3], [spatula.id, 25, 4], [spatula.id, 10, 3], [spatula.id, 3, 2],
  [puzzle.id, 75, 1], [puzzle.id, 60, 1],
];
for (const [inv, ago, qty] of salePlan) {
  const price = inv === spatula.id ? 24.99 : 19.99;
  const fees = (inv === spatula.id ? 8.5 : 7.9) * qty;
  recordSale(db, { inventoryId: inv, date: date(ago), qty, salePrice: price, fees, notes: "SAMPLE sale" });
}
addTransaction(db, { date: date(60), type: "amazon_payout", amount: 180, description: "SAMPLE payout" });
addTransaction(db, { date: date(30), type: "amazon_payout", amount: 170, description: "SAMPLE payout" });
addTransaction(db, { date: date(5), type: "amazon_payout", amount: 110, description: "SAMPLE payout" });
addTransaction(db, { date: date(90), type: "software", amount: 39.99, description: "SAMPLE seller plan" });
addTransaction(db, { date: date(60), type: "software", amount: 39.99, description: "SAMPLE seller plan" });
addTransaction(db, { date: date(30), type: "software", amount: 39.99, description: "SAMPLE seller plan" });
addTransaction(db, { date: date(20), type: "supplies", amount: 24.5, description: "SAMPLE poly bags and labels" });

const r = runDealFinder(db);
console.log(`Demo data loaded (all fictional, marked SAMPLE): ${ids.length} products, 1 supplier, 1 received PO, ${salePlan.length} sales. ${r.messages.join(" ")}`);
