import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/agreements/session";

const ITEMS = [
  ["/agreements/admin/users", "Users and permissions", "Invite buyers, sellers, and attorneys; change roles; disable accounts."],
  ["/agreements/admin/templates", "Agreement templates", "Edit the master wording. Each save creates a new template version; existing agreements are not changed."],
  ["/agreements/admin/integrations", "Integrations and settings", "E-signature and email status, reminders, expiry, retention."],
  ["/agreements/admin/activity", "Signing activity", "Recent activity across every agreement."],
  ["/agreements", "All agreements", "Administrators can open every agreement from the dashboard."],
];

export default async function AdminHome() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Administration" />
      <div className="grid gap-4 sm:grid-cols-2">
        {ITEMS.map(([href, title, text]) => (
          <Link key={href} href={href} className="block rounded-lg border border-border bg-surface p-4 hover:bg-surface-2">
            <div className="font-semibold">{title}</div>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </Link>
        ))}
      </div>
      <div className="mt-5"><Card title="Good to know"><p className="text-sm text-muted">Secret keys (e-signature, email, encryption) are set as server environment variables and are never shown or stored here. See docs/AGREEMENTS.md.</p></Card></div>
    </>
  );
}
