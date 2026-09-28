/**
 * Keyword research (§23) from text you provide: your title, competitor
 * titles, and search terms you've seen. It counts how often phrases appear
 * across those texts. It is NOT search-volume data.
 */
import { STOP_WORDS, tokenize } from "./text";

export type Intent = "high" | "informational" | "low";

export interface KeywordPhrase {
  phrase: string;
  words: number;
  /** Number of provided texts containing the phrase. */
  docCount: number;
  intent: Intent;
  inOwnTitle: boolean;
}

export interface KeywordResult {
  primary: KeywordPhrase | null;
  secondary: KeywordPhrase[];
  longTail: KeywordPhrase[];
  high: KeywordPhrase[];
  informational: KeywordPhrase[];
  low: KeywordPhrase[];
  attributes: string[];
  missingFromOwnTitle: KeywordPhrase[];
  stuffing: string[];
  textsAnalyzed: number;
  basis: string;
}

const INFO = /\b(how|what|why|when|vs|versus|review|reviews|guide|ideas|tutorial|diy|meaning|difference)\b/;
const SPEC = /^(\d+(oz|ml|l|lb|lbs|g|kg|in|inch|cm|mm|ft|pc|pcs|pack|ct|count|piece|pieces)?|oz|ml|pack|pcs|pc|count|set|kit|piece|pieces|inch|large|small|medium|xl)$/;
const ATTRIBUTE =
  /^(black|white|red|blue|green|gray|grey|pink|yellow|orange|purple|brown|clear|silver|gold|silicone|stainless|steel|wood|wooden|bamboo|plastic|glass|cotton|leather|metal|ceramic|rubber|small|medium|large|xl|mini|portable|waterproof|wireless|rechargeable)$/;

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    const g = tokens.slice(i, i + n);
    if (STOP_WORDS.has(g[0]) || STOP_WORDS.has(g[n - 1])) continue;
    if (n === 1 && (g[0].length < 3 && !/\d/.test(g[0]))) continue;
    out.push(g.join(" "));
  }
  return out;
}

export function analyzeKeywords(input: { ownTitle: string; competitorTitles: string[]; searchTerms: string[]; brand?: string }): KeywordResult {
  const texts = [input.ownTitle, ...input.competitorTitles, ...input.searchTerms].map((t) => t.trim()).filter(Boolean);
  const brandWords = new Set(tokenize(input.brand ?? ""));
  const own = new Set<string>();
  const ownTokens = tokenize(input.ownTitle);
  for (const n of [1, 2, 3]) for (const g of ngrams(ownTokens, n)) own.add(g);

  const df = new Map<string, number>();
  for (const t of texts) {
    const toks = tokenize(t);
    const seen = new Set<string>();
    for (const n of [1, 2, 3]) for (const g of ngrams(toks, n)) seen.add(g);
    for (const g of seen) df.set(g, (df.get(g) ?? 0) + 1);
  }

  const phrases: KeywordPhrase[] = [...df.entries()]
    .filter(([p]) => !p.split(" ").every((w) => brandWords.has(w)))
    .map(([phrase, docCount]) => {
      const words = phrase.split(" ");
      const intent: Intent = INFO.test(phrase)
        ? "informational"
        : docCount >= 2 || words.some((w) => SPEC.test(w))
          ? "high"
          : "low";
      return { phrase, words: words.length, docCount, intent, inOwnTitle: own.has(phrase) };
    })
    .sort((a, b) => b.docCount - a.docCount || b.words - a.words || a.phrase.localeCompare(b.phrase));

  const high = phrases.filter((p) => p.intent === "high");
  const multi = high.filter((p) => p.words >= 2);
  const primary = multi[0] ?? high[0] ?? null;
  const secondary = multi.filter((p) => p !== primary).slice(0, 8);
  const longTail = high.filter((p) => p.words === 3 && p !== primary && !secondary.includes(p)).slice(0, 10);
  const attributes = [...new Set(texts.flatMap(tokenize).filter((w) => ATTRIBUTE.test(w) || /^\d+(oz|ml|pc|pcs|ct|in|inch|pack)$/.test(w)))];

  const stuffing: string[] = [];
  const counts = new Map<string, number>();
  for (const w of ownTokens) if (!STOP_WORDS.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const [w, c] of counts) if (c >= 3) stuffing.push(`"${w}" appears ${c} times in your title. Repeating words doesn't help and reads as keyword stuffing.`);
  if (input.ownTitle.length > 200) stuffing.push(`Your title is ${input.ownTitle.length} characters; keep it under 200.`);

  return {
    primary,
    secondary,
    longTail,
    high: high.slice(0, 30),
    informational: phrases.filter((p) => p.intent === "informational").slice(0, 20),
    low: phrases.filter((p) => p.intent === "low" && p.words === 1).slice(0, 30),
    attributes,
    missingFromOwnTitle: multi.filter((p) => !p.inOwnTitle && p.docCount >= 2).slice(0, 10),
    stuffing,
    textsAnalyzed: texts.length,
    basis: `Based only on the ${texts.length} text(s) you provided. Counts are how many of those texts contain each phrase; this isn't Amazon search-volume data.`,
  };
}
