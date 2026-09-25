import Link from "next/link";
import { connection } from "next/server";
import { toggleChecklistAction } from "@/app/actions/workflows";
import { Card, PageHeader } from "@/components/ui";
import { DAILY, MONTHLY, periodKeys, WEEKLY, type ChecklistItem } from "@/lib/content/workflows";
import { getDb } from "@/lib/db/client";
import { getChecklist } from "@/lib/repo/operations";

function Checklist({ title, period, periodKey, items, done }: { title: string; period: string; periodKey: string; items: ChecklistItem[]; done: string[] }) {
  const count = items.filter((i) => done.includes(i.label)).length;
  return (
    <Card title={`${title} · ${periodKey}`} actions={<span className="text-sm text-muted">{count}/{items.length} done</span>}>
      <ul className="space-y-1">
        {items.map((i) => {
          const checked = done.includes(i.label);
          return (
            <li key={i.label} className="flex items-center gap-2 text-sm">
              <form action={toggleChecklistAction.bind(null, period, periodKey, i.label)}>
                <button
                  type="submit"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={i.label}
                  className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface"}`}
                >
                  {checked ? "✓" : ""}
                </button>
              </form>
              <span className={checked ? "text-muted line-through" : ""}>{i.label}</span>
              {i.href && (
                <Link href={i.href} className="ml-auto text-xs text-accent hover:underline">
                  Open
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default async function WorkflowsPage() {
  await connection();
  const db = getDb();
  const k = periodKeys();
  return (
    <>
      <PageHeader title="Workflows" subtitle="Daily, weekly, and monthly routines. Checkmarks reset automatically each new day, week, and month." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Checklist title="Daily" period="daily" periodKey={k.daily} items={DAILY} done={getChecklist(db, "daily", k.daily)} />
        <Checklist title="Weekly" period="weekly" periodKey={k.weekly} items={WEEKLY} done={getChecklist(db, "weekly", k.weekly)} />
        <Checklist title="Monthly" period="monthly" periodKey={k.monthly} items={MONTHLY} done={getChecklist(db, "monthly", k.monthly)} />
      </div>
    </>
  );
}
