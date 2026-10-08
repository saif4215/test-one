/** Pieces shared by the full and the quick agreement builders. */
import type { AgreementData, Party } from "./schema";
import { tbc } from "./template";

export type Block =
  | { t: "title"; text: string; sub?: string }
  | { t: "banner"; text: string; tone: "warn" | "info" }
  | { t: "h1"; text: string; anchor?: string }
  | { t: "h2"; text: string }
  | { t: "p"; text: string; num?: string }
  | { t: "list"; items: string[] }
  | { t: "kv"; rows: Array<[string, string]> }
  | { t: "table"; head: string[]; rows: string[][]; align?: Array<"l" | "r">; widths?: number[] }
  | { t: "sig"; party: "buyer" | "seller"; printedName: string; entity: string; rep: string; title: string }
  | { t: "witness" }
  | { t: "notary" }
  | { t: "pagebreak" };

export interface AttachmentInfo {
  id: string;
  fileName: string;
  schedule: string | null;
  contentType: string;
  sha256: string;
  mergeable: boolean;
}

export interface BuildInput {
  agreementId: string;
  versionNo: number;
  data: AgreementData;
  snapshot: Record<string, string>;
  attachments: AttachmentInfo[];
  /** True until every required signature is verified; drives the DRAFT marking. */
  draft: boolean;
}

export interface BuiltDocument {
  title: string;
  agreementId: string;
  versionNo: number;
  draft: boolean;
  blocks: Block[];
  /** Attachment index, in exhibit order. */
  exhibits: Array<AttachmentInfo & { label: string }>;
}


export function fmtDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export const dash = (s: string | undefined | null) => (s && s.trim() ? s.trim() : "—");

export function describeParty(p: Party, role: string): string {
  const name = p.entityName || p.legalName;
  if (!name) return tbc(`${role} legal name`);
  let out = name;
  if (p.entityName && p.entityType) out += `, a ${p.entityType}`;
  if (p.address) out += `, with an address at ${p.address.replace(/\s*\n\s*/g, ", ")}`;
  if (p.entityName && (p.repName || p.legalName)) {
    out += `, acting through ${p.repName || p.legalName}${p.repTitle ? `, ${p.repTitle}` : ""}`;
  }
  return out;
}

export const noticeAddress = (p: Party) => [p.address.replace(/\s*\n\s*/g, ", "), p.email].filter(Boolean).join("; ") || "";


export function exhibitLabel(i: number) {
  return `Exhibit ${i + 1}`;
}

/** Every unresolved placeholder in the rendered document, for the readiness check. */
export function findPlaceholders(doc: BuiltDocument): string[] {
  const found = new Set<string>();
  const scan = (s: string) => {
    for (const m of s.matchAll(/\[TO BE COMPLETED: ([^\]]+)\]/g)) found.add(m[1]);
  };
  for (const b of doc.blocks) {
    if (b.t === "p" || b.t === "banner" || b.t === "title" || b.t === "h1" || b.t === "h2") scan(b.text);
    else if (b.t === "list") b.items.forEach(scan);
    else if (b.t === "kv") b.rows.forEach(([a, c]) => (scan(a), scan(c)));
    else if (b.t === "table") b.rows.forEach((r) => r.forEach(scan));
  }
  return [...found];
}
