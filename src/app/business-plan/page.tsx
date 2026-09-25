import { connection } from "next/server";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/repo/products";
import { businessPlanMarkdown } from "@/lib/reports/businessPlan";
import { planFacts } from "@/lib/reports/planFacts";

export default async function BusinessPlanPage() {
  await connection();
  const db = getDb();
  const md = businessPlanMarkdown(getSettings(db), planFacts(db));
  return (
    <>
      <PageHeader
        title="Business Plan"
        subtitle="Generated from your Settings and records. Anything the app doesn't know is marked [Fill in: …]. Update Settings to change the plan, or download it and edit it."
        actions={
          <>
            <LinkButton href="/settings" variant="secondary">Edit settings</LinkButton>
            <a className="btn" href="/business-plan/plan.md">Download .md</a>
          </>
        }
      />
      <Card>
        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">{md}</pre>
      </Card>
    </>
  );
}
