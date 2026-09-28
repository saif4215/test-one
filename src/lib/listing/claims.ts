/**
 * Claims the listing tools won't write (§22). Each match is flagged for you
 * to remove, or to back up with documentation before you use it anywhere.
 */

export interface FlaggedClaim {
  text: string;
  match: string;
  reason: string;
}

const RULES: { re: RegExp; reason: string }[] = [
  {
    re: /\b(cures?|treats?|heals?|prevents? (?:disease|illness|infection)|relieves? pain|pain relief|anti[- ]?inflammatory|clinically (?:proven|tested)|medical[- ]grade|detox(?:ifies)?|boosts? immunity|kills \d+(?:\.\d+)?%)\b/i,
    reason: "Medical or health claim: needs evidence and may be prohibited on Amazon.",
  },
  {
    re: /\b(guaranteed?|guarantees|100% satisfaction|risk[- ]free|money[- ]back|results in \d+ days?)\b/i,
    reason: "Guarantee or promised result: don't promise outcomes.",
  },
  {
    re: /\b(fda[- ]approved|fda[- ]registered|certified|approved by|ul[- ]listed|ce[- ]marked|organic|non[- ]?toxic|eco[- ]friendly|hypoallergenic|dermatologist[- ]tested|bpa[- ]free)\b/i,
    reason: "Certification or safety claim: include it only if you have documentation proving it.",
  },
  {
    re: /(#\s?1\b|\bnumber one\b|\bbest[- ]?sell(?:er|ing)\b|\baward[- ]winning\b|\btop[- ]rated\b|\bbest\b)/i,
    reason: "Ranking, award, or superlative claim: unsupported superlatives aren't allowed.",
  },
  {
    re: /\b(customers (?:say|love)|rated \d(?:\.\d)? stars?|\d+(?:,\d{3})* (?:happy|satisfied) customers|testimonial)\b/i,
    reason: "Testimonial or review claim: don't put reviews or ratings in listing copy.",
  },
  {
    re: /(free shipping|\bsale\b|\bdiscount\b|\$\d|\blimited time\b|!{1,})/i,
    reason: "Promotional wording or pricing isn't allowed in titles or bullets.",
  },
];

export function findClaims(text: string): FlaggedClaim[] {
  const out: FlaggedClaim[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) out.push({ text, match: m[0], reason: r.reason });
  }
  return out;
}

export function hasClaim(text: string): boolean {
  return findClaims(text).length > 0;
}
