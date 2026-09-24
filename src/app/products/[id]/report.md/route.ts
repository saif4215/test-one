import { loadAnalysis } from "@/lib/analysis/load";
import { getDb } from "@/lib/db/client";
import { dealAnalysisMarkdown, dealReportMarkdown } from "@/lib/reports/dealReport";

export async function GET(_req: Request, ctx: RouteContext<"/products/[id]/report.md">) {
  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  const loaded = Number.isInteger(id) ? loadAnalysis(getDb(), id) : null;
  if (!loaded) return new Response("Not found", { status: 404 });
  const body = `${dealAnalysisMarkdown(loaded.analysis)}\n\n${dealReportMarkdown(loaded.analysis)}`;
  const slug = (loaded.rec.data.name || `product-${id}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="deal-${slug}.md"`,
    },
  });
}
