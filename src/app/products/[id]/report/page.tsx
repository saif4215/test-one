import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { loadAnalysis } from "@/lib/analysis/load";
import { getDb } from "@/lib/db/client";
import { dealAnalysisMarkdown, dealReportMarkdown } from "@/lib/reports/dealReport";

export default async function ReportPage({ params }: PageProps<"/products/[id]/report">) {
  await connection();
  const { id: idParam } = await params;
  const id = Number(idParam);
  const loaded = Number.isInteger(id) ? loadAnalysis(getDb(), id) : null;
  if (!loaded) notFound();
  const { rec, analysis } = loaded;
  return (
    <>
      <PageHeader
        title={`Deal report: ${rec.data.name || "(unnamed)"}`}
        subtitle="The Deal Analysis template and AI Deal Report as plain text, for printing or sharing."
        actions={
          <>
            <LinkButton href={`/products/${id}`} variant="secondary">Back to product</LinkButton>
            <a className="btn" href={`/products/${id}/report.md`}>Download .md</a>
          </>
        }
      />
      <div className="space-y-5">
        <Card title="Deal analysis">
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">{dealAnalysisMarkdown(analysis)}</pre>
        </Card>
        <Card title="AI deal report">
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">{dealReportMarkdown(analysis)}</pre>
        </Card>
      </div>
    </>
  );
}
