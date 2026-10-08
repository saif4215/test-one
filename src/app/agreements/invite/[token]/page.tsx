import { InviteForm } from "@/components/agreements/AuthForms";
import { Notice } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { findInvite } from "@/lib/agreements/users";

export default async function InvitePage({ params }: PageProps<"/agreements/invite/[token]">) {
  const { token } = await params;
  const user = findInvite(getDb(), token);
  return (
    <div className="mx-auto mt-8 max-w-sm">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Create your account</h1>
      {user ? <InviteForm token={token} name={user.name} /> : <Notice tone="bad">This invitation is invalid or has expired. Ask an administrator to send a new one.</Notice>}
    </div>
  );
}
