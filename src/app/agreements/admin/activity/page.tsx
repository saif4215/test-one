import { desc } from "drizzle-orm";
import Link from "next/link";
import { fmtStamp } from "@/components/agreements/parts";
import { Card, PageHeader, TableWrap } from "@/components/ui";
import { requireAdmin } from "@/lib/agreements/session";
import { getDb } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";

export default async function ActivityPage() {
  await requireAdmin();
  const rows = getDb().select().from(auditEvents).orderBy(desc(auditEvents.at)).limit(200).all();
  return (
    <>
      <PageHeader title="Signing activity" subtitle="The 200 most recent audit events across all agreements." />
      <Card>
        <TableWrap>
          <table className="data">
            <thead><tr><th>When</th><th>Agreement</th><th>Event</th><th>Actor</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-xs">{fmtStamp(e.at)}</td>
                  <td className="text-xs">{e.agreementId ? <Link className="font-mono underline" href={`/agreements/${e.agreementId}#audit`}>{e.agreementId}</Link> : "—"}</td>
                  <td className="text-sm">{e.type.replace(/[._]/g, " ")}</td>
                  <td className="text-xs">{e.actorType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
