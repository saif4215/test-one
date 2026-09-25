import { Card, PageHeader } from "@/components/ui";
import { GLOSSARY } from "@/lib/content/glossary";

export default function GlossaryPage() {
  return (
    <>
      <PageHeader title="Glossary" subtitle="Plain-language definitions of the terms used throughout the app." />
      <Card>
        <dl className="divide-y divide-border">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
              <dt className="font-semibold">{g.term}</dt>
              <dd className="text-sm">
                {g.definition}
                {g.example && <div className="mt-1 text-muted">Example: {g.example}</div>}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
