/**
 * Data provenance (§66, §68, §73).
 *
 * Every data point the app shows carries a label saying where it came from, so
 * verified facts are never confused with estimates, assumptions, or unknowns.
 */

export const DATA_KINDS = [
  "VERIFIED",
  "USER_PROVIDED",
  "THIRD_PARTY",
  "ESTIMATED",
  "ASSUMPTION",
  "UNKNOWN",
] as const;

export type DataKind = (typeof DATA_KINDS)[number];

export const DATA_KIND_LABEL: Record<DataKind, string> = {
  VERIFIED: "Verified",
  USER_PROVIDED: "User-provided",
  THIRD_PARTY: "Third-party",
  ESTIMATED: "Estimate",
  ASSUMPTION: "Assumption",
  UNKNOWN: "Unknown",
};

export interface Sourced<T> {
  value: T | null;
  kind: DataKind;
  /** Human-readable source, e.g. "Amazon SP-API", "Target.com", "CSV: buylist.csv". */
  source?: string;
  url?: string;
  /** ISO timestamp of when the value was observed or entered. */
  checkedAt?: string;
  note?: string;
}

export const UNAVAILABLE_MESSAGE = "Data unavailable — verify before purchasing.";
export const LIVE_DATA_UNAVAILABLE =
  "Live data unavailable — analysis based on the information provided.";
export const STALE_MESSAGE = "Data may be stale.";

/** Default age after which a price observation is flagged as possibly stale. */
export const DEFAULT_STALE_AFTER_DAYS = 7;

export function unknown<T>(note?: string): Sourced<T> {
  return { value: null, kind: "UNKNOWN", note };
}

export function sourced<T>(
  value: T | null | undefined,
  kind: DataKind,
  extra: Omit<Sourced<T>, "value" | "kind"> = {},
): Sourced<T> {
  if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) {
    return { value: null, kind: "UNKNOWN", ...extra };
  }
  return { value, kind, ...extra };
}

export function userProvided<T>(
  value: T | null | undefined,
  source = "Entered by user",
  checkedAt: string = new Date().toISOString(),
): Sourced<T> {
  return sourced(value, "USER_PROVIDED", { source, checkedAt });
}

export function isKnown<T>(s: Sourced<T> | undefined): s is Sourced<T> & { value: T } {
  return !!s && s.value !== null && s.kind !== "UNKNOWN";
}

/** True for data backed by an actual observation (not an estimate or assumption). */
export function isObserved(s: Sourced<unknown> | undefined): boolean {
  return !!s && isKnown(s) && (s.kind === "VERIFIED" || s.kind === "USER_PROVIDED" || s.kind === "THIRD_PARTY");
}

export function ageInDays(checkedAt: string | undefined, now: Date = new Date()): number | null {
  if (!checkedAt) return null;
  const t = Date.parse(checkedAt);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 86_400_000;
}

export function isStale(
  s: Sourced<unknown> | undefined,
  now: Date = new Date(),
  maxAgeDays = DEFAULT_STALE_AFTER_DAYS,
): boolean {
  if (!s || !isKnown(s)) return false;
  const age = ageInDays(s.checkedAt, now);
  // A value with no timestamp can't be shown to be fresh.
  if (age === null) return s.kind !== "ASSUMPTION";
  return age > maxAgeDays;
}
