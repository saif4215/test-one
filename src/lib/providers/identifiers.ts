import { isValidGtin } from "@/lib/calc/matching";

export type ParsedQuery =
  | { type: "asin"; asin: string; raw: string }
  | { type: "upc"; upc: string; valid: boolean; raw: string }
  | { type: "url"; url: string; asin: string | null; host: string; raw: string }
  | { type: "name"; name: string; raw: string }
  | { type: "empty"; raw: string };

const ASIN_RE = /^(B0[0-9A-Z]{8}|\d{9}[\dX])$/i;

/** Pulls an ASIN out of Amazon URLs like /dp/B0..., /gp/product/B0..., /gp/aw/d/B0.... */
export function asinFromUrl(u: URL): string | null {
  if (!/(^|\.)amazon\./i.test(u.hostname)) return null;
  const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Works out what the user typed: an ASIN, UPC/EAN, URL, or product name. */
export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim();
  if (!q) return { type: "empty", raw };
  if (/^https?:\/\//i.test(q)) {
    try {
      const u = new URL(q);
      return { type: "url", url: u.toString(), asin: asinFromUrl(u), host: u.hostname.replace(/^www\./, ""), raw };
    } catch {
      // not a valid URL; fall through and treat it as a name
    }
  }
  if (ASIN_RE.test(q)) return { type: "asin", asin: q.toUpperCase(), raw };
  const digits = q.replace(/[\s-]/g, "");
  if (/^\d{8}$|^\d{12,14}$/.test(digits)) return { type: "upc", upc: digits, valid: isValidGtin(digits), raw };
  return { type: "name", name: q, raw };
}
