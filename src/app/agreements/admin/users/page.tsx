import { InviteUserForm, UserRow } from "@/components/agreements/AdminForms";
import { Card, PageHeader, TableWrap } from "@/components/ui";
import { requireAdmin } from "@/lib/agreements/session";
import { listUsers } from "@/lib/agreements/users";
import { getDb } from "@/lib/db/client";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = listUsers(getDb());
  return (
    <>
      <PageHeader title="Users and permissions" subtitle="Buyers and sellers only see agreements they have been given access to. Give access from each agreement's page." />
      <div className="space-y-5">
        <Card title="Invite someone"><InviteUserForm /><p className="mt-3 text-xs text-muted">Inviting an email that already has an account sends a one-time link to set a new password (a password reset). Their role and access don&apos;t change.</p></Card>
        <Card title={`People (${users.length})`}>
          <TableWrap>
            <table className="data">
              <thead><tr><th>Person</th><th>Role</th><th>Status</th><th /></tr></thead>
              <tbody>{users.map((u) => <UserRow key={u.id} self={u.id === admin.id} user={{ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, lastLoginAt: u.lastLoginAt }} />)}</tbody>
            </table>
          </TableWrap>
        </Card>
      </div>
    </>
  );
}
