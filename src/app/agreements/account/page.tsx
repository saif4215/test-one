import { PasswordForm } from "@/components/agreements/AuthForms";
import { LegalNotice, fmtStamp } from "@/components/agreements/parts";
import { Card, PageHeader } from "@/components/ui";
import { CONSENT_STATEMENT, CONSENT_VERSION, ESIGN_DISCLOSURE } from "@/lib/agreements/consent";
import { ROLE_LABEL, type Role } from "@/lib/agreements/permissions";
import { requireUser } from "@/lib/agreements/session";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Account and security" subtitle="Your sign-in details and the electronic-signature consent you can review at any time." />
      <div className="space-y-5">
        <Card title="Your account">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Name</dt><dd>{user.name}</dd></div>
            <div><dt className="text-xs text-muted">Email</dt><dd>{user.email}</dd></div>
            <div><dt className="text-xs text-muted">Role</dt><dd>{ROLE_LABEL[user.role as Role]}</dd></div>
            <div><dt className="text-xs text-muted">Last sign-in</dt><dd>{fmtStamp(user.lastLoginAt)}</dd></div>
          </dl>
        </Card>
        <Card title="Change password">
          <PasswordForm />
          <p className="mt-3 text-xs text-muted">Changing your password signs you out of other devices. Sessions also end after 12 hours, or 2 hours without activity.</p>
        </Card>
        <Card title={`Electronic signature consent (version ${CONSENT_VERSION})`}>
          <ul className="list-disc space-y-2 pl-5 text-sm">{ESIGN_DISCLOSURE.map((d) => <li key={d}>{d}</li>)}</ul>
          <p className="mt-3 text-sm font-medium">{CONSENT_STATEMENT}</p>
          <p className="mt-2 text-xs text-muted">Signers see this wording and confirm it before every signing. Each confirmation is saved with the time, the document fingerprint, and the identity check used.</p>
        </Card>
        <LegalNotice />
      </div>
    </>
  );
}
