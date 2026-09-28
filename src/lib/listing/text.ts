export const STOP_WORDS = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was were will with your you our we i my me can per into than then so if not no".split(" "),
);

/** Lowercase word tokens (letters/digits; keeps things like "16oz" and "2-pack" → "2", "pack"). */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);

/** Title Case except short connector words; keeps acronyms (e.g. "USB"), mixed-case brands (e.g. "ExampleBrand"), and words with digits. */
export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      if (/\d/.test(w) || /[A-Z]/.test(w.slice(1)) || (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w) && w.length <= 4)) return w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Cuts at a word boundary so the result is at most `max` characters. */
export function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const i = cut.lastIndexOf(" ");
  return (i > 0 ? cut.slice(0, i) : s.slice(0, max)).replace(/[\s,;:-]+$/, "");
}
