import Link from "next/link";
import { STEPS, type StepKey } from "@/lib/agreements/steps";

export function StepNav({ agreementId, current, issueCounts }: { agreementId: string; current: StepKey | "clauses"; issueCounts: Partial<Record<StepKey, number>> }) {
  return (
    <nav aria-label="Agreement steps" className="mb-5">
      <ol className="steps">
        {STEPS.map((s) => {
          const n = issueCounts[s.key] ?? 0;
          const href = s.key === "preview" ? `/agreements/${agreementId}/preview` : `/agreements/${agreementId}/edit/${s.key}`;
          return (
            <li key={s.key}>
              <Link href={href} aria-current={current === s.key ? "step" : undefined}>
                <span className={`dot ${n ? "warn" : "ok"}`} aria-hidden="true">{n ? "!" : "✓"}</span>
                <span>{s.n}. {s.label}</span>
                <span className="sr-only">{n ? `, ${n} item${n === 1 ? "" : "s"} need attention` : ", complete"}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
