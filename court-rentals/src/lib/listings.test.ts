import { describe, expect, it } from "vitest";
import { bookingMailto } from "./booking";
import {
  SPORTS,
  cities,
  filterListings,
  getListing,
  listingPath,
  listings,
  parseFilters,
  relatedListings,
} from "./listings";

describe("listing data", () => {
  it("has unique slugs", () => {
    const slugs = listings.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses URL-safe slugs and known sports", () => {
    const sports = SPORTS.map((s) => s.slug as string);
    for (const l of listings) {
      expect(l.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(sports).toContain(l.sport);
    }
  });

  it("has no empty or placeholder fields", () => {
    for (const l of listings) {
      for (const value of [l.name, l.city, l.area, l.state, l.surface, l.blurb, l.description]) {
        expect(value.trim()).not.toBe("");
        expect(value).not.toMatch(/undefined|null/i);
      }
      expect(l.hourlyRate).toBeGreaterThan(0);
      expect(l.minHours).toBeGreaterThan(0);
      expect(l.maxPlayers).toBeGreaterThan(0);
      expect(l.hours.length).toBeGreaterThan(0);
    }
  });

  it("has at least one listing for every sport", () => {
    for (const sport of SPORTS) {
      expect(listings.some((l) => l.sport === sport.slug)).toBe(true);
    }
  });
});

describe("listingPath", () => {
  it("builds /rentals/<sport>/<slug> and never contains 'undefined'", () => {
    for (const l of listings) {
      const path = listingPath(l);
      expect(path).toBe(`/rentals/${l.sport}/${l.slug}`);
      expect(path).not.toContain("undefined");
    }
  });

  it("round-trips through getListing", () => {
    for (const l of listings) {
      expect(getListing(l.sport, l.slug)).toBe(l);
    }
  });

  it("does not resolve a slug under the wrong sport", () => {
    const basketball = listings.find((l) => l.sport === "basketball")!;
    expect(getListing("tennis", basketball.slug)).toBeUndefined();
    expect(getListing("undefined", basketball.slug)).toBeUndefined();
  });
});

describe("parseFilters", () => {
  it("returns defaults for an empty query", () => {
    expect(parseFilters({})).toEqual({
      sport: undefined,
      city: undefined,
      q: undefined,
      maxRate: undefined,
      setting: undefined,
      sort: "featured",
    });
  });

  it("accepts valid values", () => {
    const f = parseFilters({
      sport: "tennis",
      city: cities[0],
      q: "  clay ",
      maxRate: "60",
      setting: "outdoor",
      sort: "price-asc",
    });
    expect(f).toEqual({
      sport: "tennis",
      city: cities[0],
      q: "clay",
      maxRate: 60,
      setting: "outdoor",
      sort: "price-asc",
    });
  });

  it("drops unknown or malformed values instead of failing", () => {
    const f = parseFilters({
      sport: "undefined",
      city: "Atlantis",
      maxRate: "-5",
      setting: "underwater",
      sort: "random",
    });
    expect(f.sport).toBeUndefined();
    expect(f.city).toBeUndefined();
    expect(f.maxRate).toBeUndefined();
    expect(f.setting).toBeUndefined();
    expect(f.sort).toBe("featured");
  });

  it("uses the first value when a parameter is repeated", () => {
    expect(parseFilters({ sport: ["pickleball", "tennis"] }).sport).toBe("pickleball");
  });
});

describe("filterListings", () => {
  const all = () => [...listings];

  it("filters by sport", () => {
    const result = filterListings(all(), parseFilters({ sport: "pickleball" }));
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((l) => l.sport === "pickleball")).toBe(true);
  });

  it("filters by city, price ceiling and indoor/outdoor", () => {
    const result = filterListings(
      all(),
      parseFilters({ city: "Staten Island", maxRate: "50", setting: "outdoor" }),
    );
    expect(result.length).toBeGreaterThan(0);
    for (const l of result) {
      expect(l.city).toBe("Staten Island");
      expect(l.hourlyRate).toBeLessThanOrEqual(50);
      expect(l.indoor).toBe(false);
    }
  });

  it("searches text case-insensitively", () => {
    const result = filterListings(all(), parseFilters({ q: "CLAY" }));
    expect(result.map((l) => l.slug)).toContain("maple-hollow-clay-court");
  });

  it("sorts by price", () => {
    const asc = filterListings(all(), parseFilters({ sort: "price-asc" })).map((l) => l.hourlyRate);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = filterListings(all(), parseFilters({ sort: "price-desc" })).map((l) => l.hourlyRate);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it("puts featured listings first by default", () => {
    const result = filterListings(all(), parseFilters({}));
    const firstNonFeatured = result.findIndex((l) => !l.featured);
    expect(result.slice(firstNonFeatured).some((l) => l.featured)).toBe(false);
  });

  it("returns nothing when no listing matches", () => {
    expect(filterListings(all(), parseFilters({ q: "zzzz-no-such-court" }))).toEqual([]);
  });
});

describe("relatedListings", () => {
  it("excludes the listing itself and respects the limit", () => {
    const base = listings[0];
    const related = relatedListings(base, 3);
    expect(related).toHaveLength(3);
    expect(related.map((l) => l.slug)).not.toContain(base.slug);
  });
});

describe("bookingMailto", () => {
  it("encodes the subject and body so they round-trip", () => {
    const listing = listings[0];
    const href = bookingMailto(listing);
    expect(href.startsWith("mailto:")).toBe(true);

    const query = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(query.get("subject")).toBe(`Booking request: ${listing.name}`);
    expect(query.get("body")).toContain(listing.name);
    expect(href).not.toContain("undefined");
    expect(href).not.toContain(" ");
  });
});
