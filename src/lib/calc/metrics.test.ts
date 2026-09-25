import { describe, expect, it } from "vitest";
import { cashBalance, inventorySummary, monthlySeries, profitSummary, type InvRow } from "./metrics";

const items: InvRow[] = [
  { id: 1, name: "A", unitCost: 10, shippingPerUnit: 1, prepPerUnit: 0.5, qtyPurchased: 20, qtyReceived: 20, qtySold: 5, salePrice: 30, feesPerUnit: 9 },
  { id: 2, name: "B", unitCost: 5, shippingPerUnit: 0, prepPerUnit: 0, qtyPurchased: 10, qtyReceived: 10, qtySold: 0, salePrice: null, feesPerUnit: null },
];

describe("metrics", () => {
  it("values inventory at landed cost and flags items without a price", () => {
    const s = inventorySummary(items);
    expect(s.unitsOnHand).toBe(25);
    expect(s.costValue).toBeCloseTo(15 * 11.5 + 10 * 5);
    expect(s.retailValue).toBe(15 * 30);
    expect(s.estimatedProfit).toBeCloseTo(15 * (30 - 9 - 11.5));
    expect(s.itemsMissingPrice).toBe(1);
    expect(s.capitalInvested).toBeCloseTo(20 * 11.5 + 10 * 5);
  });

  it("measures profit from sales (COGS), separately from cash", () => {
    const sales = [{ inventoryId: 1, date: "2026-09-10", qty: 5, salePrice: 30, fees: 45, refundedQty: 1 }];
    const txs = [
      { date: "2026-09-01", type: "inventory_purchase", amount: 230 },
      { date: "2026-09-05", type: "software", amount: 20 },
    ];
    const p = profitSummary(sales, items, txs);
    expect(p.grossRevenue).toBe(150);
    expect(p.refunds).toBe(30);
    expect(p.cogs).toBeCloseTo(57.5);
    expect(p.grossProfit).toBeCloseTo(120 - 45 - 57.5);
    expect(p.operatingExpenses).toBe(20); // the inventory purchase is not an expense
    expect(p.netProfit).toBeCloseTo(17.5 - 20);
    expect(cashBalance([...txs, { date: "2026-09-20", type: "amazon_payout", amount: 75 }], 1000)).toBe(1000 - 230 - 20 + 75);
  });

  it("builds a monthly series", () => {
    const s = monthlySeries([{ inventoryId: 1, date: "2026-08-15", qty: 2, salePrice: 30, fees: 18, refundedQty: 0 }], items, [], 3, new Date("2026-09-24T00:00:00Z"));
    expect(s.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(s[1].revenue).toBe(60);
    expect(s[1].units).toBe(2);
  });
});
