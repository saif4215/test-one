import { describe, expect, it } from "vitest";
import { productInputSchema } from "@/lib/domain/product";
import { productFromForm } from "./forms";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("productFromForm", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("labels typed values as user-provided with a timestamp", () => {
    const p = productFromForm(fd({ name: "Widget", purchasePrice: "$12.50", salePrice: "29.99", sourceName: "Target", fragile: "no" }), now);
    expect(p.purchasePrice).toBe(12.5);
    expect(p.prov.purchasePrice).toMatchObject({ kind: "USER_PROVIDED", source: "Target", checkedAt: now.toISOString() });
    expect(p.fragile).toBe(false);
    expect(p.hazmat).toBeNull();
  });

  it("keeps a provider's provenance when the value is unchanged, and relabels changed values", () => {
    const original = productInputSchema.parse({
      salesRank: 1234,
      sellerCount: 5,
      prov: {
        salesRank: { kind: "VERIFIED", source: "Amazon SP-API", checkedAt: "2026-09-24T11:00:00Z" },
        sellerCount: { kind: "VERIFIED", source: "Amazon SP-API", checkedAt: "2026-09-24T11:00:00Z" },
      },
    });
    const p = productFromForm(
      fd({ __original: JSON.stringify(original), salesRank: "1234", sellerCount: "7", marketDataKind: "THIRD_PARTY", marketDataSource: "Keepa (viewed)" }),
      now,
    );
    expect(p.prov.salesRank.kind).toBe("VERIFIED");
    expect(p.prov.sellerCount).toMatchObject({ kind: "THIRD_PARTY", source: "Keepa (viewed)" });
  });

  it("drops provenance for cleared values", () => {
    const original = productInputSchema.parse({ salePrice: 20, prov: { salePrice: { kind: "USER_PROVIDED" } } });
    const p = productFromForm(fd({ __original: JSON.stringify(original), salePrice: "" }), now);
    expect(p.salePrice).toBeNull();
    expect(p.prov.salePrice).toBeUndefined();
  });
});
