/**
 * Product matching engine (§61, §62).
 *
 * Similar titles never produce a match on their own. A MATCH needs a matching
 * GTIN (UPC/EAN), a matching brand, and no conflicts in size, color, pack
 * count, or model.
 */

export type MatchVerdict = "MATCH" | "POSSIBLE MATCH" | "DO NOT MATCH";

export interface MatchableProduct {
  title?: string | null;
  brand?: string | null;
  /** UPC, EAN, or GTIN in any format. */
  gtin?: string | null;
  model?: string | null;
  mpn?: string | null;
  size?: string | null;
  color?: string | null;
  packCount?: number | null;
  /** Net contents, e.g. "16 oz". */
  quantity?: string | null;
  condition?: string | null;
  dims?: { lengthIn: number; widthIn: number; heightIn: number } | null;
}

export interface MatchEvidence {
  field: string;
  result: "same" | "different" | "missing" | "invalid";
  detail: string;
}

export interface MatchResult {
  verdict: MatchVerdict;
  evidence: MatchEvidence[];
  summary: string;
  toVerify: string[];
}

/** Keeps digits only and left-pads to GTIN-14. Returns null if the length isn't a valid GTIN length. */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  return digits.padStart(14, "0");
}

/** GS1 mod-10 check-digit validation for GTIN-8/12/13/14. */
export function isValidGtin(raw: string | null | undefined): boolean {
  const g = normalizeGtin(raw);
  if (!g) return false;
  const digits = g.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function tokens(s: string | null | undefined): Set<string> {
  return new Set(norm(s).split(" ").filter((t) => t.length > 1));
}

/** Jaccard similarity of title tokens, 0–1. Shown as supporting evidence only. */
export function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function compareText(field: string, a: string | null | undefined, b: string | null | undefined): MatchEvidence {
  if (!norm(a) || !norm(b)) return { field, result: "missing", detail: `${field} missing on ${!norm(a) ? "supplier" : "Amazon"} side` };
  return norm(a) === norm(b)
    ? { field, result: "same", detail: `${field}: "${a}"` }
    : { field, result: "different", detail: `${field}: supplier "${a}" vs Amazon "${b}"` };
}

export function matchProducts(supplier: MatchableProduct, amazon: MatchableProduct): MatchResult {
  const ev: MatchEvidence[] = [];

  // GTIN
  let gtinSame = false;
  const gs = normalizeGtin(supplier.gtin);
  const ga = normalizeGtin(amazon.gtin);
  if (supplier.gtin && !isValidGtin(supplier.gtin)) ev.push({ field: "UPC/EAN", result: "invalid", detail: `Supplier code "${supplier.gtin}" fails the GTIN check digit` });
  if (amazon.gtin && !isValidGtin(amazon.gtin)) ev.push({ field: "UPC/EAN", result: "invalid", detail: `Amazon code "${amazon.gtin}" fails the GTIN check digit` });
  if (gs && ga) {
    gtinSame = gs === ga;
    ev.push(
      gtinSame
        ? { field: "UPC/EAN", result: "same", detail: `GTIN ${gs.replace(/^0+/, "")} matches` }
        : { field: "UPC/EAN", result: "different", detail: `GTIN supplier ${supplier.gtin} vs Amazon ${amazon.gtin}` },
    );
  } else if (!supplier.gtin || !amazon.gtin) {
    ev.push({ field: "UPC/EAN", result: "missing", detail: "UPC/EAN missing on at least one side" });
  }

  const brand = compareText("Brand", supplier.brand, amazon.brand);
  ev.push(brand);
  const model = compareText("Model/MPN", supplier.model ?? supplier.mpn, amazon.model ?? amazon.mpn);
  ev.push(model);
  const size = compareText("Size", supplier.size, amazon.size);
  ev.push(size);
  const color = compareText("Color", supplier.color, amazon.color);
  ev.push(color);
  const qty = compareText("Quantity", supplier.quantity, amazon.quantity);
  ev.push(qty);
  const cond = compareText("Condition", supplier.condition, amazon.condition);
  ev.push(cond);

  let pack: MatchEvidence;
  if (supplier.packCount && amazon.packCount) {
    pack =
      supplier.packCount === amazon.packCount
        ? { field: "Pack count", result: "same", detail: `${supplier.packCount}-pack` }
        : { field: "Pack count", result: "different", detail: `Supplier ${supplier.packCount}-pack vs Amazon ${amazon.packCount}-pack` };
  } else {
    pack = { field: "Pack count", result: "missing", detail: "Pack count missing on at least one side" };
  }
  ev.push(pack);

  if (supplier.dims && amazon.dims) {
    const vs = supplier.dims.lengthIn * supplier.dims.widthIn * supplier.dims.heightIn;
    const va = amazon.dims.lengthIn * amazon.dims.widthIn * amazon.dims.heightIn;
    const diff = Math.abs(vs - va) / Math.max(vs, va);
    ev.push(
      diff <= 0.15
        ? { field: "Dimensions", result: "same", detail: `Package volume within ${(diff * 100).toFixed(0)}%` }
        : { field: "Dimensions", result: "different", detail: `Package volume differs by ${(diff * 100).toFixed(0)}%` },
    );
  }

  const sim = titleSimilarity(supplier.title, amazon.title);
  ev.push({
    field: "Title",
    result: "missing",
    detail: `Title similarity ${(sim * 100).toFixed(0)}% (supporting evidence only; never enough to match on its own)`,
  });

  const conflicts = ev.filter((e) => e.result === "different");
  const toVerify = ev.filter((e) => e.result === "missing" && e.field !== "Title").map((e) => `Verify ${e.field.toLowerCase()}`);
  toVerify.push("Compare the product images and variation (size/color/pack) on the live listing");

  if (conflicts.length) {
    return {
      verdict: "DO NOT MATCH",
      evidence: ev,
      summary: `Conflicting details: ${conflicts.map((c) => c.field).join(", ")}.`,
      toVerify,
    };
  }
  if (gtinSame && brand.result === "same" && pack.result === "same") {
    return {
      verdict: "MATCH",
      evidence: ev,
      summary: "UPC/EAN, brand, and pack count all match, with no conflicting details.",
      toVerify,
    };
  }
  if (gtinSame || (brand.result === "same" && model.result === "same")) {
    return {
      verdict: "POSSIBLE MATCH",
      evidence: ev,
      summary: gtinSame
        ? "UPC/EAN matches, but brand or pack count couldn't be confirmed."
        : "Brand and model match, but there's no matching UPC/EAN.",
      toVerify,
    };
  }
  return {
    verdict: "DO NOT MATCH",
    evidence: ev,
    summary:
      "Not enough identifying evidence (no matching UPC/EAN, or brand plus model). Similar titles alone aren't enough.",
    toVerify,
  };
}
