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
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Card title="Quick agreement (recommended)">
          <p className="mb-3 text-sm text-muted">One page of about 15 questions. Produces a short, plain-English agreement of 2–3 pages, then you send it to be signed.</p>
          <form action={createAgreementAction}>
            <input type="hidden" name="mode" value="quick" />
            <SubmitButton pendingLabel="Creating…">Start a quick agreement</SubmitButton>
          </form>
        </Card>
        <Card title="Full agreement">
          <p className="mb-3 text-sm text-muted">Nine guided steps and the complete 18-section contract with schedules A–G, closing conditions, permits, and editable legal wording.</p>
          <form action={createAgreementAction}>
            <input type="hidden" name="mode" value="full" />
            <SubmitButton pendingLabel="Creating…">Start a full agreement</SubmitButton>
          </form>
        </Card>
      </div>
      <Card title="Full agreement steps">
        <ol className="mb-5 grid gap-1 text-sm sm:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.key}><span className="mr-2 text-muted">{s.n}.</span>{s.label}</li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          Nothing is pre-filled except the business name and location. The owner, buyer, seller, price, address, debts, lease terms, and assets all start blank, and the agreement can&apos;t be sent until the seller&apos;s authority and ownership have been confirmed by you.
        </p>
      </Card>
    </>
  );
}
