import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { productInputSchema } from "@/lib/domain/product";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import {
  addPriceObservation,
  createProduct,
  findProductByIdentifier,
  getProduct,
  getSettings,
  priceHistoryFor,
  saveSettings,
  updateProduct,
} from "./products";
import {
  createInventoryItem,
  createPurchaseOrder,
  deleteSale,
  getInventoryItem,
  listInventory,
  listTransactions,
  receivePurchaseOrder,
  recordSale,
  toggleChecklistItem,
} from "./operations";

describe("repositories (in-memory SQLite)", () => {
  it("round-trips settings with defaults", () => {
    const db = openDatabase(":memory:");
    expect(getSettings(db).targetRoiPct).toBe(DEFAULT_SETTINGS.targetRoiPct);
    saveSettings(db, { ...DEFAULT_SETTINGS, startingBudget: 2500, onboarded: true });
    expect(getSettings(db).startingBudget).toBe(2500);
    expect(getSettings(db).onboarded).toBe(true);
  });

  it("stores products, finds them by identifier, and keeps provenance", () => {
    const db = openDatabase(":memory:");
    const id = createProduct(
      db,
      productInputSchema.parse({
        name: "Widget",
        asin: "b0test1234",
        upc: "0-36000-29145-2",
        purchasePrice: 5,
        prov: { purchasePrice: { kind: "USER_PROVIDED", source: "Target clearance", checkedAt: "2026-09-24T10:00:00Z" } },
      }),
    );
    const rec = findProductByIdentifier(db, { asin: "B0TEST1234" })!;
    expect(rec.id).toBe(id);
    expect(findProductByIdentifier(db, { upc: "036000291452" })!.id).toBe(id);
    expect(rec.data.prov.purchasePrice.source).toBe("Target clearance");
    updateProduct(db, id, { ...rec.data, salePrice: 19.99 });
    expect(getProduct(db, id)!.data.salePrice).toBe(19.99);
    addPriceObservation(db, { productId: id, price: 19.99, at: "2026-09-01T00:00:00Z", sellerCount: 3 });
    addPriceObservation(db, { productId: id, price: 18.5, at: "2026-08-01T00:00:00Z" });
    expect(priceHistoryFor(db, id).map((o) => o.price)).toEqual([18.5, 19.99]);
  });

  it("records sales against inventory and can undo them", () => {
    const db = openDatabase(":memory:");
    const inv = createInventoryItem(db, { sku: "SKU1", name: "Widget", unitCost: 5, qtyPurchased: 10, qtyReceived: 10 });
    const sale = recordSale(db, { inventoryId: inv, date: "2026-09-20", qty: 3, salePrice: 20, fees: 18 });
    expect(getInventoryItem(db, inv)!.qtySold).toBe(3);
    expect(getInventoryItem(db, inv)!.lastSaleAt).toBe("2026-09-20");
    deleteSale(db, sale);
    expect(getInventoryItem(db, inv)!.qtySold).toBe(0);
  });

  it("receiving a PO creates inventory at landed cost and cash-flow entries", () => {
    const db = openDatabase(":memory:");
    const po = createPurchaseOrder(db, {
      supplierName: "Acme Wholesale",
      date: "2026-09-10",
      shipping: 40,
      otherCosts: 0,
      lines: [
        { product: "A", quantity: 10, unitCost: 10 },
        { product: "B", quantity: 10, unitCost: 30 },
      ],
    });
    receivePurchaseOrder(db, po);
    receivePurchaseOrder(db, po); // idempotent
    const inv = listInventory(db);
    expect(inv).toHaveLength(2);
    const a = inv.find((i) => i.name === "A")!;
    expect(a.shippingPerUnit).toBeCloseTo(1);
    const tx = listTransactions(db);
    expect(tx.map((t) => t.type).sort()).toEqual(["inbound_shipping", "inventory_purchase"]);
    expect(tx.find((t) => t.type === "inventory_purchase")!.amount).toBe(400);
  });

  it("toggles checklist items", () => {
    const db = openDatabase(":memory:");
    expect(toggleChecklistItem(db, "daily", "2026-09-24", "Check sales")).toEqual(["Check sales"]);
    expect(toggleChecklistItem(db, "daily", "2026-09-24", "Check sales")).toEqual([]);
  });
});
