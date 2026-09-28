/**
 * Listing copy generator (§22). Builds an original title, bullets,
 * description, and backend search terms from product details you provide.
 * It adds no facts of its own: anything missing becomes an "[Add: …]" prompt,
 * and risky claims are flagged and left out.
 */
import { findClaims, hasClaim, type FlaggedClaim } from "./claims";
import { STOP_WORDS, titleCase, tokenize, truncateWords, utf8Bytes } from "./text";

export const TITLE_MAX = 200;
export const SEARCH_TERMS_MAX_BYTES = 249;

export interface WriterInput {
  brand: string;
  productName: string;
  /** e.g. "Silicone Spatula Set" or "Jigsaw Puzzle". */
  productType?: string;
  keyFeatures: string[];
  size?: string;
  color?: string;
  packCount?: number | null;
  material?: string;
  dimensions?: string;
  includedItems: string[];
  useCases: string[];
  specs: { label: string; value: string }[];
  /** Search words and synonyms you've researched. */
  keywords: string[];
}

export interface WriterOutput {
  title: string;
  bullets: string[];
  description: string;
  searchTerms: string;
  searchTermBytes: number;
  specs: { label: string; value: string }[];
  keyFeatures: string[];
  flagged: FlaggedClaim[];
  notes: string[];
}

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
const sentence = (s: string) => {
  const t = clean(s).replace(/[.!]+$/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) + "." : "";
};

export function generateListing(input: WriterInput): WriterOutput {
  const flagged: FlaggedClaim[] = [];
  const notes: string[] = [];
  const keep = (xs: string[]) =>
    xs.map(clean).filter((x) => {
      if (!x) return false;
      const f = findClaims(x);
      if (f.length) {
        flagged.push(...f);
        return false;
      }
      return true;
    });

  const brand = clean(input.brand);
  const name = clean(input.productName);
  for (const v of [brand, name, input.productType, input.size, input.color, input.material]) if (v) flagged.push(...findClaims(v));
  const features = keep(input.keyFeatures);
  const included = keep(input.includedItems);
  const uses = keep(input.useCases);
  const specs = input.specs.map((s) => ({ label: clean(s.label), value: clean(s.value) })).filter((s) => s.label && s.value && !hasClaim(s.value));
  const pack = input.packCount && input.packCount > 1 ? `${input.packCount}-Pack` : "";

  // Title: Brand + product + top feature + size/color/pack
  const topFeature = features.find((f) => f.split(" ").length <= 6);
  const titleParts = [brand, name, topFeature, [clean(input.size), clean(input.color), pack].filter(Boolean).join(", ")].filter(Boolean);
  let title = titleCase(titleParts.join(" - "));
  title = truncateWords(title, TITLE_MAX);
  if (!brand) notes.push("Add the brand name; titles normally start with it.");
  if (!name) notes.push("Add the product name.");

  // Five bullets from what you provided; any gaps become prompts.
  const bullets: string[] = [];
  for (const f of features.slice(0, 3)) {
    const [head, ...rest] = f.split(/[:–—-]\s+/);
    bullets.push(rest.length ? `${head.trim().toUpperCase()}: ${sentence(rest.join(" "))}` : `${f.split(" ").slice(0, 2).join(" ").toUpperCase()}: ${sentence(f)}`);
  }
  const whatsIncluded = [pack && `${input.packCount} units`, ...included].filter(Boolean);
  bullets.push(whatsIncluded.length ? `WHAT'S INCLUDED: ${sentence(whatsIncluded.join(", "))}` : "WHAT'S INCLUDED: [Add: exactly what comes in the package]");
  const specLine = [input.material && `Material: ${clean(input.material)}`, input.dimensions && `Dimensions: ${clean(input.dimensions)}`, input.size && `Size: ${clean(input.size)}`, input.color && `Color: ${clean(input.color)}`]
    .filter(Boolean)
    .join("; ");
  bullets.push(specLine ? `SPECIFICATIONS: ${specLine}.` : "SPECIFICATIONS: [Add: material, dimensions, size, color]");
  if (bullets.length < 5) bullets.push(uses.length ? `USES: ${sentence(`Suitable for ${uses.join(", ")}`)}` : "USES: [Add: what the product is used for]");
  while (bullets.length < 5) bullets.push(`[Add: another verified feature of the ${name || "product"}]`);
  const finalBullets = bullets.slice(0, 5);
  if (features.length < 3) notes.push("Add at least 3 key features for stronger bullets.");

  // Description
  const paras: string[] = [];
  paras.push(sentence(`The ${[brand, name].filter(Boolean).join(" ") || "[Add: product name]"}${input.productType ? ` is a ${clean(input.productType).toLowerCase()}` : ""}${uses.length ? ` for ${uses.join(", ")}` : ""}`));
  if (features.length) paras.push(features.map(sentence).join(" "));
  if (whatsIncluded.length) paras.push(sentence(`The package includes ${whatsIncluded.join(", ")}`));
  if (specLine) paras.push(`${specLine}.`);
  const description = paras.filter(Boolean).join("\n\n");

  // Backend search terms: your keywords, without words already in the title, without your own brand, no repeats.
  const titleWords = new Set(tokenize(title));
  const brandWords = new Set(tokenize(brand));
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const k of input.keywords) {
    if (hasClaim(k)) {
      flagged.push(...findClaims(k));
      continue;
    }
    for (const w of tokenize(k)) {
      if (STOP_WORDS.has(w) || titleWords.has(w) || brandWords.has(w) || seen.has(w)) continue;
      seen.add(w);
      terms.push(w);
    }
  }
  let searchTerms = "";
  for (const t of terms) {
    const next = searchTerms ? `${searchTerms} ${t}` : t;
    if (utf8Bytes(next) > SEARCH_TERMS_MAX_BYTES) {
      notes.push("Some search terms were left out to stay under Amazon's backend search-term limit.");
      break;
    }
    searchTerms = next;
  }
  notes.push("Review every line against the actual product and packaging before using it. Only include claims you can prove.");

  return {
    title,
    bullets: finalBullets,
    description,
    searchTerms,
    searchTermBytes: utf8Bytes(searchTerms),
    specs,
    keyFeatures: features,
    flagged,
    notes,
  };
}
