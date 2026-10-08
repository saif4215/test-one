import Link from "next/link";
import type { ReactNode } from "react";
import { Notice, Pill, type Tone } from "@/components/ui";
import { LEGAL_NOTICE } from "@/lib/agreements/template";
import { STATUS_LABEL, type AgreementStatus } from "@/lib/agreements/status";

const TONE: Record<AgreementStatus, Tone> = {
  draft: "neutral",
  awaiting_review: "warn",
  sent_for_signature: "info",
  viewed: "info",
  partially_signed: "warn",
  fully_signed: "good",
  declined: "bad",
  expired: "bad",
  cancelled: "neutral",
};

export function StatusPill({ status }: { status: string }) {
  const s = status as AgreementStatus;
  return <Pill tone={TONE[s] ?? "neutral"}>{STATUS_LABEL[s] ?? status}</Pill>;
}

export function LegalNotice() {
  return (
    <Notice tone="warn" title="Not legal advice.">
      {LEGAL_NOTICE}
    </Notice>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? "UTC" : undefined });
}

export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })} ET`;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-block text-sm text-muted hover:underline">
      ← {children}
    </Link>
  );
}

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return "***";
  return `${u.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
}
