import Link from "next/link";
import { AgreementList } from "@/components/agreements/AgreementList";
import { LegalNotice } from "@/components/agreements/parts";
import { PageHeader } from "@/components/ui";
import { canCreateAgreement } from "@/lib/agreements/permissions";
import { listAgreements } from "@/lib/agreements/repo";
import { AGREEMENT_STATUSES, STATUS_LABEL, isStatus } from "@/lib/agreements/status";
import { actorFor, requireUser } from "@/lib/agreements/session";
import { getDb } from "@/lib/db/client";

export default async function Dashboard({ searchParams }: PageProps<"/agreements">) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = getDb();
  const actor = actorFor(user);
  const status = typeof sp.status === "string" && isStatus(sp.status) ? sp.status : undefined;
  const all = listAgreements(db, actor);
  const counts = Object.fromEntries(AGREEMENT_STATUSES.map((s) => [s, all.filter((r) => r.agreement.status === s).length]));
  return (
    <>
      <PageHeader
        title="Agreements"
        subtitle="Every purchase agreement you have access to. You only see agreements you were given access to."
        actions={canCreateAgreement(actor.role) && <Link href="/agreements/new" className="btn">New agreement</Link>}
      />
      <div className="mb-4"><LegalNotice /></div>
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        <Link href="/agreements" aria-current={!status ? "true" : undefined} className={`btn btn-sm ${status ? "btn-secondary" : ""}`}>All ({all.length})</Link>
        {AGREEMENT_STATUSES.map((s) => (
          <Link key={s} href={`/agreements?status=${s}`} aria-current={status === s ? "true" : undefined} className={`btn btn-sm ${status === s ? "" : "btn-secondary"}`}>
            {STATUS_LABEL[s]} ({counts[s]})
          </Link>
        ))}
      </nav>
      <AgreementList
        db={db}
        actor={actor}
        status={status}
        emptyHint={canCreateAgreement(actor.role) ? "Create a new agreement to get started." : "An administrator will give you access to an agreement."}
      />
    </>
  );
}
