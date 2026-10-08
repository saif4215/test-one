import { redirect } from "next/navigation";
import { createAgreementAction } from "@/app/actions/agreements";
import { LegalNotice } from "@/components/agreements/parts";
import { SubmitButton } from "@/components/agreements/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { canCreateAgreement } from "@/lib/agreements/permissions";
import { actorFor, requireUser } from "@/lib/agreements/session";
import { STEPS } from "@/lib/agreements/steps";

export default async function NewAgreement() {
  const user = await requireUser();
  if (!canCreateAgreement(actorFor(user).role)) redirect("/agreements");
  return (
    <>
      <PageHeader title="Create agreement" subtitle="Start a Maruf Cafe business purchase and sale agreement. You can save a draft and come back at any time." />
      <div className="mb-4"><LegalNotice /></div>
      <Card title="What you'll fill in">
        <ol className="mb-5 grid gap-1 text-sm sm:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.key}><span className="mr-2 text-muted">{s.n}.</span>{s.label}</li>
          ))}
        </ol>
        <p className="mb-4 text-sm text-muted">
          Nothing is pre-filled except the business name and location. The owner, buyer, seller, price, address, debts, lease terms, and assets all start blank, and the agreement can&apos;t be sent until you and an attorney have confirmed them.
        </p>
        <form action={createAgreementAction}>
          <SubmitButton pendingLabel="Creating…">Create draft agreement</SubmitButton>
        </form>
      </Card>
    </>
  );
}
