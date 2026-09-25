import { describe, expect, it } from "vitest";
import { taxSummaryRows } from "./tax";

describe("tax summary", () => {
  it("separates COGS, operating expenses, and cash purchases for one year", () => {
    const rows = taxSummaryRows(
      2026,
      [
        { inventoryId: 1, date: "2026-03-01", qty: 10, salePrice: 20, fees: 60, refundedQty: 0 },
        { inventoryId: 1, date: "2025-12-31", qty: 99, salePrice: 20, fees: 0, refundedQty: 0 },
      ],
      [{ id: 1, name: "A", unitCost: 5, shippingPerUnit: 1, prepPerUnit: 0, qtyPurchased: 20, qtyReceived: 20, qtySold: 10, salePrice: 20, feesPerUnit: 6 }],
      [
        { date: "2026-01-05", type: "inventory_purchase", amount: 120 },
        { date: "2026-02-01", type: "software", amount: 30 },
        { date: "2026-02-10", type: "mileage", amount: 12.5 },
      ],
    );
    const get = (item: string) => rows.find((r) => r[1] === item)?.[2];
    expect(rows[0][1]).toMatch(/not tax advice/);
    expect(get("Gross sales")).toBe("200.00");
    expect(get("Cost of goods sold (landed cost of units sold)")).toBe("60.00");
    expect(get("Inventory purchase")).toBe("120.00");
    expect(get("Operating expenses")).toBe("42.50");
    expect(get("Estimated net profit")).toBe((200 - 60 - 60 - 42.5).toFixed(2));
  });
});
