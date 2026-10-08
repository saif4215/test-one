import Link from "next/link";

const STEPS = [
  { key: "details", label: "1. Fill in the details", path: "edit/quick" },
  { key: "check", label: "2. Check the agreement", path: "preview" },
  { key: "send", label: "3. Send to sign", path: "send" },
] as const;

export function QuickNav({ agreementId, current, issueCount }: { agreementId: string; current: "details" | "check" | "send"; issueCount: number }) {
  return (
    <nav aria-label="Quick agreement steps" className="mb-5">
      <ol className="steps">
        {STEPS.map((s) => (
          <li key={s.key}>
            <Link href={`/agreements/${agreementId}/${s.path}`} aria-current={current === s.key ? "step" : undefined}>
              {s.key === "details" && <span className={`dot ${issueCount ? "warn" : "ok"}`} aria-hidden="true">{issueCount ? "!" : "✓"}</span>}
              <span>{s.label}</span>
              {s.key === "details" && <span className="sr-only">{issueCount ? `, ${issueCount} items need attention` : ", complete"}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
