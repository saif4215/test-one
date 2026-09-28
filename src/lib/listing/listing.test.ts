import { describe, expect, it } from "vitest";
import { findClaims } from "./claims";
import { analyzeKeywords } from "./keywords";
import { analyzeReviews, splitReviews } from "./reviews";
import { titleCase, truncateWords, utf8Bytes } from "./text";
import { generateListing, SEARCH_TERMS_MAX_BYTES, TITLE_MAX, type WriterInput } from "./writer";

const base: WriterInput = {
  brand: "ExampleBrand",
  productName: "silicone spatula set",
  productType: "Kitchen utensil set",
  keyFeatures: ["Heat resistant - holds up to high oven temperatures listed on the package", "One-piece design with no gaps where food can collect", "Dishwasher safe for easy cleanup"],
  size: "Large",
  color: "Gray",
  packCount: 3,
  material: "Food-grade silicone",
  dimensions: "12 x 2.5 x 0.5 in",
  includedItems: ["1 large spatula", "1 spoon spatula", "1 jar scraper"],
  useCases: ["baking", "stirring", "scraping bowls"],
  specs: [{ label: "Material", value: "Silicone" }],
  keywords: ["rubber scraper, baking tools, cooking utensils, spatula for nonstick pans", "baking tools"],
};

describe("claims", () => {
  it("flags medical, guarantee, certification, ranking, and promotional wording", () => {
    expect(findClaims("Cures back pain")[0].reason).toMatch(/Medical/);
    expect(findClaims("100% satisfaction guaranteed")[0].reason).toMatch(/Guarantee/);
    expect(findClaims("FDA approved material")[0].reason).toMatch(/Certification/);
    expect(findClaims("The #1 best spatula")[0].reason).toMatch(/superlative/);
    expect(findClaims("Free shipping!")[0].reason).toMatch(/Promotional/);
    expect(findClaims("Dishwasher safe")).toEqual([]);
  });
});

describe("text helpers", () => {
  it("title-cases, truncates at words, and counts bytes", () => {
    expect(titleCase("silicone spatula set for the kitchen USB 3-pack")).toBe("Silicone Spatula Set for the Kitchen USB 3-pack");
    expect(titleCase("ExampleBrand spatula")).toBe("ExampleBrand Spatula");
    expect(truncateWords("one two three four", 9)).toBe("one two");
    expect(utf8Bytes("é")).toBe(2);
  });
});

describe("listing writer", () => {
  it("builds a title, 5 bullets, a description, and search terms within limits", () => {
    const out = generateListing(base);
    expect(out.title.startsWith("ExampleBrand - Silicone Spatula Set")).toBe(true);
    expect(out.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(out.bullets).toHaveLength(5);
    expect(out.bullets[3]).toMatch(/^WHAT'S INCLUDED: 3 units, 1 large spatula/);
    expect(out.description).toContain("The ExampleBrand silicone spatula set is a kitchen utensil set for baking");
    expect(out.searchTermBytes).toBeLessThanOrEqual(SEARCH_TERMS_MAX_BYTES);
    const terms = out.searchTerms.split(" ");
    expect(new Set(terms).size).toBe(terms.length);
    expect(terms).not.toContain("silicone"); // already in the title
    expect(terms).not.toContain("examplebrand");
    expect(terms).toContain("rubber");
  });

  it("leaves out flagged claims and reports them", () => {
    const out = generateListing({ ...base, keyFeatures: ["Clinically proven to reduce germs", "Best spatula ever", "Dishwasher safe"] });
    expect(out.flagged.map((f) => f.match.toLowerCase())).toEqual(expect.arrayContaining(["clinically proven", "best"]));
    expect(out.bullets.join(" ")).not.toMatch(/clinically|best/i);
  });

  it("uses prompts instead of inventing missing details", () => {
    const out = generateListing({ brand: "", productName: "Widget", keyFeatures: [], includedItems: [], useCases: [], specs: [], keywords: [] });
    expect(out.bullets.join(" ")).toContain("[Add:");
    expect(out.notes.join(" ")).toMatch(/brand/);
  });

  it("caps backend search terms at the byte limit", () => {
    const many = Array.from({ length: 120 }, (_, i) => `keyword${i}`).join(" ");
    const out = generateListing({ ...base, keywords: [many] });
    expect(out.searchTermBytes).toBeLessThanOrEqual(SEARCH_TERMS_MAX_BYTES);
    expect(out.notes.join(" ")).toMatch(/left out/);
  });
});

describe("keyword research", () => {
  it("finds shared phrases, classifies intent, and spots gaps and stuffing", () => {
    const r = analyzeKeywords({
      ownTitle: "ExampleBrand Spatula Spatula Spatula Set",
      competitorTitles: ["Silicone Spatula Set 3 Pack Heat Resistant", "Heat Resistant Silicone Spatula Set for Baking", "Rubber Spatula Set Silicone 3 Pack"],
      searchTerms: ["how to clean silicone spatula"],
      brand: "ExampleBrand",
    });
    expect(r.primary?.phrase).toBe("spatula set");
    expect(r.high.some((p) => p.phrase === "heat resistant")).toBe(true);
    expect(r.informational.map((p) => p.phrase)).toContain("how to clean");
    expect(r.missingFromOwnTitle.some((p) => p.phrase === "silicone spatula")).toBe(true);
    expect(r.stuffing[0]).toMatch(/"spatula" appears 3 times/);
    expect(r.basis).toMatch(/isn't Amazon search-volume data/);
    expect(r.attributes).toContain("silicone");
  });

  it("marks informational phrases", () => {
    const r = analyzeKeywords({ ownTitle: "", competitorTitles: [], searchTerms: ["spatula review guide"] });
    expect(r.informational.map((p) => p.phrase)).toContain("spatula review");
  });
});

describe("review analysis", () => {
  const text = `★★ Broke after two uses. Cheap plastic.

★★★★★ Love it, works great and easy to clean.

★ Arrived damaged, packaging was crushed. Missing the lid.

★★★★ Great quality but runs small.`;
  it("splits reviews and counts themes with example quotes", () => {
    expect(splitReviews(text)).toHaveLength(4);
    const a = analyzeReviews(text);
    const t = Object.fromEntries(a.themes.map((x) => [x.id, x]));
    expect(t.defects.count).toBe(1);
    expect(t.quality.count).toBe(1);
    expect(t.packaging.count).toBe(1);
    expect(t.missing.count).toBe(1);
    expect(t.size.count).toBe(1);
    expect(t.compliments.count).toBe(2);
    expect(t.defects.examples[0]).toMatch(/Broke/);
    expect(a.notes.join(" ")).toMatch(/too few/);
  });
});
