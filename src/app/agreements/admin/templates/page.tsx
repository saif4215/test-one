import { TemplateForm } from "@/components/agreements/AdminForms";
import { fmtStamp } from "@/components/agreements/parts";
import { Card, Notice, PageHeader } from "@/components/ui";
import { ensureTemplate, listTemplates } from "@/lib/agreements/repo";
import { requireAdmin } from "@/lib/agreements/session";
import { CLAUSES } from "@/lib/agreements/template";
import { getDb } from "@/lib/db/client";

export default async function TemplatesPage() {
  await requireAdmin();
  const db = getDb();
  const latest = ensureTemplate(db);
  const all = listTemplates(db);
  return (
    <>
      <PageHeader title="Agreement templates" subtitle={`Editing creates template version ${latest.versionNo + 1}. Every agreement version keeps the exact wording it was created with, so signed agreements are never silently changed.`} />
      <div className="space-y-5">
        <Notice tone="warn">Template wording is the starting text for every new agreement. Edit it carefully. Existing agreements keep the wording they were created with.</Notice>
        <Card title="Template history">
          <ul className="space-y-1 text-sm">
            {all.map((t) => <li key={t.id}>v{t.versionNo} · {fmtStamp(t.createdAt)} · {t.note || "—"}</li>)}
          </ul>
        </Card>
        <TemplateForm clauses={CLAUSES.map((c) => ({ key: c.key, section: c.section, title: c.title, text: latest.clauses[c.key] ?? c.text }))} />
      </div>
    </>
  );
}
