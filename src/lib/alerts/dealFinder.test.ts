import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { productInputSchema } from "@/lib/domain/product";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { createInventoryItem, createSupplier, listAlerts, recordSale } from "@/lib/repo/operations";
import { createProduct, getProduct, saveSettings, updateProduct } from "@/lib/repo/products";
import { runDealFinder } from "./dealFinder";

const good = productInputSchema.parse({
  name: "Widget",
  category: "Home & Kitchen",
  purchasePrice: 8,
  salePrice: 24.99,
  weightLb: 0.6,
  lengthIn: 12,
  widthIn: 4,
  heightIn: 2,
  restricted: false,
  restrictionChecked: true,
  prov: { salePrice: { kind: "USER_PROVIDED", source: "Listing", checkedAt: "2026-09-24T10:00:00Z" } },
});

describe("runDealFinder", () => {
  it("alerts once when a product first meets the criteria, then on meaningful changes only", () => {
    const db = openDatabase(":memory:");
    saveSettings(db, { ...DEFAULT_SETTINGS, filters: { ...DEFAULT_SETTINGS.filters, excludeRestricted: true } });
    const id = createProduct(db, good);
    const now = new Date("2026-09-24T12:00:00Z");
    const r1 = runDealFinder(db, now);
    expect(r1.alertsCreated).toBe(1);
    const [a] = listAlerts(db);
    expect(a.type).toBe("criteria_met");
    expect(a.dataTimestamp).toBe("2026-09-24T10:00:00Z");
    expect(a.dataSource).toContain("User-provided");
    expect(a.message).toMatch(/not a guarantee/);

    expect(runDealFinder(db, now).alertsCreated).toBe(0); // nothing changed

    const rec = getProduct(db, id)!;
    updateProduct(db, id, { ...rec.data, purchasePrice: 5 });
    const r3 = runDealFinder(db, now);
    const types = listAlerts(db).map((x) => x.type);
    expect(r3.alertsCreated).toBe(2);
    expect(types).toContain("purchase_price_drop");
    expect(types).toContain("profit_increase");
  });

  it("raises a reorder alert from recent sales", () => {
    const db = openDatabase(":memory:");
    const inv = createInventoryItem(db, { sku: "S", name: "Fast seller", unitCost: 5, qtyPurchased: 30, qtyReceived: 30 });
    // 20 sold in 30 days → 0.67/day; safety stock 5, reorder point 15; 10 left → reorder
    recordSale(db, { inventoryId: inv, date: "2026-09-20", qty: 20, salePrice: 20, fees: 0 });
    const r = runDealFinder(db, new Date("2026-09-24T12:00:00Z"));
    expect(r.alertsCreated).toBe(1);
    expect(listAlerts(db)[0].type).toBe("reorder_point");
    expect(runDealFinder(db, new Date("2026-09-24T13:00:00Z")).alertsCreated).toBe(0); // no duplicate while unread
  });

  it("raises a low-inventory alert (instead of reorder) when stock is at or below safety stock", () => {
    const db = openDatabase(":memory:");
    const inv = createInventoryItem(db, { sku: "S", name: "Nearly gone", unitCost: 5, qtyPurchased: 30, qtyReceived: 30 });
    recordSale(db, { inventoryId: inv, date: "2026-09-20", qty: 27, salePrice: 20, fees: 0 });
    runDealFinder(db, new Date("2026-09-24T12:00:00Z"));
    const types = listAlerts(db).map((a) => a.type);
    expect(types).toEqual(["low_inventory"]);
  });

  it("alerts on supplier price changes of 5% or more, once", () => {
    const db = openDatabase(":memory:");
    createSupplier(db, { name: "Up Co", lastPrice: 10, currentPrice: 11 });
    createSupplier(db, { name: "Flat Co", lastPrice: 10, currentPrice: 10.2 });
    const r = runDealFinder(db, new Date("2026-09-24T12:00:00Z"));
    expect(r.alertsCreated).toBe(1);
    const [a] = listAlerts(db);
    expect(a.type).toBe("supplier_price_change");
    expect(a.title).toBe("Up Co: price up 10.0%");
    expect(runDealFinder(db, new Date("2026-09-24T13:00:00Z")).alertsCreated).toBe(0);
  });
});
