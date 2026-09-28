/**
 * Review analysis (§24) of reviews you paste in. Themes are found by keyword
 * matching, not a sentiment model, so read the example quotes. The tool never
 * writes, edits, or solicits reviews.
 */

export interface Theme {
  id: string;
  label: string;
  kind: "complaint" | "compliment";
  patterns: RegExp[];
  opportunity: string;
}

export const THEMES: Theme[] = [
  { id: "defects", label: "Product defects", kind: "complaint", patterns: [/\bbr(o|e)ke\b/i, /\bbroken\b/i, /\bdefective\b/i, /stopped working/i, /(doesn'?t|does not|didn'?t|did not) work/i, /\bcracked\b/i, /\bfaulty\b/i, /\bmalfunction/i], opportunity: "Many defect complaints mean higher return risk. Consider avoiding this product, or inspect units before sending them in." },
  { id: "packaging", label: "Packaging issues", kind: "complaint", patterns: [/packag(ing|ed)/i, /damaged box/i, /\bleak(ed|ing|s)?\b/i, /arrived (damaged|crushed|open)/i], opportunity: "Budget for extra prep (bubble wrap, poly bags, boxing) and check the outer packaging." },
  { id: "size", label: "Size / fit problems", kind: "complaint", patterns: [/too (small|big|large|short|long|tight|loose)/i, /(smaller|bigger|larger) than/i, /runs? (small|large|big)/i, /\bfit\b/i, /\bsize\b/i], opportunity: "Make sure the exact dimensions and variation match before sourcing. Size confusion drives returns." },
  { id: "quality", label: "Quality concerns", kind: "complaint", patterns: [/\bcheap(ly)?\b/i, /\bflimsy\b/i, /(poor|low|bad) quality/i, /feels? cheap/i, /\bthin\b/i, /fell apart/i], opportunity: "Quality complaints can mean returns and price pressure. Weigh this in your risk assessment." },
  { id: "missing", label: "Missing components", kind: "complaint", patterns: [/\bmissing\b/i, /(didn'?t|did not) come with/i, /not included/i, /\bincomplete\b/i], opportunity: "Check units for completeness, especially for used or open-box sourcing." },
  { id: "instructions", label: "Confusing instructions", kind: "complaint", patterns: [/\binstructions?\b/i, /\bmanual\b/i, /\bconfusing\b/i, /hard to (assemble|set ?up|use)/i, /no directions/i], opportunity: "If you create a listing, cover setup clearly in the bullets. Expect some returns from confused buyers." },
  { id: "shipping", label: "Shipping complaints", kind: "complaint", patterns: [/\bshipping\b/i, /arrived late/i, /\blate\b/i, /never arrived/i, /\bdelivery\b/i], opportunity: "Usually about the carrier or seller, not the product. Give it less weight when choosing products." },
  { id: "compliments", label: "Compliments", kind: "compliment", patterns: [/\blove(d|s)?\b/i, /\bgreat\b/i, /\bexcellent\b/i, /\bperfect(ly)?\b/i, /works (great|well|perfectly)/i, /\bsturdy\b/i, /well made/i, /\brecommend/i, /easy to (use|clean)/i, /good quality/i], opportunity: "Strengths buyers care about. Useful for judging demand and, if you create a listing, which features to describe." },
];

export interface ThemeResult {
  id: string;
  label: string;
  kind: "complaint" | "compliment";
  count: number;
  pct: number;
  examples: string[];
  opportunity: string;
}

export interface ReviewAnalysis {
  reviews: number;
  themes: ThemeResult[];
  topComplaints: ThemeResult[];
  notes: string[];
}

/** Reviews are separated by blank lines, or by lines starting with a star rating (★ or "1 star"). */
export function splitReviews(text: string): string[] {
  const blocks = text
    .split(/\n\s*\n|\n(?=\s*(?:[★☆]{1,5}|\d(?:\.\d)? out of 5|\d stars?)\b)/i)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 3);
  if (blocks.length <= 1) return text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 3);
  return blocks;
}

function snippet(text: string, re: RegExp): string {
  const m = text.match(re);
  if (!m || m.index === undefined) return text.slice(0, 140);
  const start = Math.max(0, m.index - 60);
  const s = text.slice(start, start + 140);
  return `${start > 0 ? "…" : ""}${s}${start + 140 < text.length ? "…" : ""}`;
}

export function analyzeReviews(text: string): ReviewAnalysis {
  const reviews = splitReviews(text);
  const themes: ThemeResult[] = THEMES.map((t) => {
    const hits = reviews.filter((r) => t.patterns.some((p) => p.test(r)));
    return {
      id: t.id,
      label: t.label,
      kind: t.kind,
      count: hits.length,
      pct: reviews.length ? (hits.length / reviews.length) * 100 : 0,
      examples: hits.slice(0, 3).map((r) => snippet(r, t.patterns.find((p) => p.test(r))!)),
      opportunity: t.opportunity,
    };
  });
  const topComplaints = themes.filter((t) => t.kind === "complaint" && t.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
  const notes = [
    "Themes are keyword matches, not a sentiment model: read the example quotes before drawing conclusions.",
    "Reviews you paste are analyzed here only. This tool never writes, edits, or asks for reviews.",
  ];
  if (reviews.length < 10) notes.push(`Only ${reviews.length} review(s): too few to see reliable patterns.`);
  return { reviews: reviews.length, themes, topComplaints, notes };
}
