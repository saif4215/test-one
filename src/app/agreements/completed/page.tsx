import { AgreementList } from "@/components/agreements/AgreementList";
import { PageHeader } from "@/components/ui";
import { actorFor, requireUser } from "@/lib/agreements/session";
import { getDb } from "@/lib/db/client";

export default async function CompletedAgreements() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Completed agreements" subtitle="Fully signed agreements. An agreement appears here only after the e-signature service has confirmed that every party signed." />
      <AgreementList db={getDb()} actor={actorFor(user)} status="fully_signed" emptyHint="Nothing is fully signed yet." />
    </>
  );
}
