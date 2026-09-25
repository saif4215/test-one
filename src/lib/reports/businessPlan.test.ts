import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/domain/settings";
import { businessPlanMarkdown } from "./businessPlan";

const facts = { productsResearched: 3, productsPassing: 1, suppliers: 2, inventoryValue: 250, unitsOnHand: 20, netRevenue: 400, netProfit: 60 };

describe("business plan", () => {
  it("has every section and asks for unknowns instead of inventing them", () => {
    const md = businessPlanMarkdown(DEFAULT_SETTINGS, facts, new Date("2026-09-25T00:00:00Z"));
    for (const h of [
      "Executive summary", "Business model", "Target products", "Sourcing strategy", "Budget", "Inventory strategy",
      "Pricing strategy", "Fulfillment strategy", "Record-keeping system", "Risk management", "Cash-flow strategy",
      "Growth plan", "Supplier strategy", "Weekly workflow", "Monthly workflow", "Key metrics", "Compliance checklist",
    ]) expect(md).toContain(`## ${h}`);
    expect(md).toContain("[Fill in: starting budget]");
    expect(md).toContain("[Fill in: business name]");
  });

  it("uses the budget for allocation scenarios when it's set", () => {
    const md = businessPlanMarkdown({ ...DEFAULT_SETTINGS, startingBudget: 1000, businessName: "Acme" }, facts);
    expect(md).toContain("| Conservative | $500.00 |");
    expect(md).toContain("# Acme");
  });
});
