import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/repo/products";
import { businessPlanMarkdown } from "@/lib/reports/businessPlan";
import { planFacts } from "@/lib/reports/planFacts";

export async function GET() {
  const db = getDb();
  return new Response(businessPlanMarkdown(getSettings(db), planFacts(db)), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": 'attachment; filename="business-plan.md"',
    },
  });
}
