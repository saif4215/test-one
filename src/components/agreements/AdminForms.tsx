"use client";

import { useActionState } from "react";
import { inviteUserAction, saveSettingsAction, saveTemplateAction, setRoleAction, toggleUserAction } from "@/app/actions/agreements";
import { ROLES, ROLE_LABEL } from "@/lib/agreements/permissions";
import { ActionForm, SubmitButton, type ActionState } from "./ActionForm";

const init: ActionState = {};

export function InviteUserForm() {
  const [state, action] = useActionState(inviteUserAction, init);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <input name="name" required placeholder="Full name" aria-label="Full name" className="input" />
        <input name="email" type="email" required placeholder="email@example.com" aria-label="Email" className="input sm:col-span-2" />
        <select name="role" aria-label="Role" className="input" defaultValue="buyer">
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
      <SubmitButton pendingLabel="Inviting…">Send invitation</SubmitButton>
      {state.message && <p role="status" className={`break-all rounded-md px-3 py-2 text-sm ${state.ok ? "bg-good-bg text-good" : "bg-bad-bg text-bad"}`}>{state.message}</p>}
    </form>
  );
}

export function UserRow({ user, self }: { user: { id: string; name: string; email: string; role: string; status: string; lastLoginAt: string | null }; self: boolean }) {
  return (
    <tr>
      <td>{user.name}<div className="text-xs text-muted">{user.email}</div></td>
      <td>
        <ActionForm action={setRoleAction} fields={{ userId: user.id }} label="Save" inline>
          <select name="role" aria-label={`Role for ${user.name}`} defaultValue={user.role} className="input !w-auto">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </ActionForm>
      </td>
      <td className="text-xs">{user.status}{user.lastLoginAt ? ` · last sign-in ${user.lastLoginAt.slice(0, 10)}` : ""}</td>
      <td>{!self && <ActionForm action={toggleUserAction} fields={{ userId: user.id }} label={user.status === "disabled" ? "Enable" : "Disable"} className="btn btn-danger btn-sm" confirm={user.status === "disabled" ? undefined : `Disable ${user.name}? They are signed out immediately.`} />}</td>
    </tr>
  );
}

export function TemplateForm({ clauses }: { clauses: Array<{ key: string; section: number; title: string; text: string }> }) {
  const [state, action] = useActionState(saveTemplateAction, init);
  return (
    <form action={action} className="space-y-4">
      {clauses.map((c, idx) => {
        const head = idx === 0 || clauses[idx - 1].section !== c.section;
        return (
          <div key={c.key}>
            {head && <h3 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-muted">Section {c.section}</h3>}
            <label htmlFor={`t-${c.key}`} className="mb-1 block text-sm font-medium">{c.title} <span className="font-mono text-xs font-normal text-muted">{c.key}</span></label>
            <textarea id={`t-${c.key}`} name={`clause:${c.key}`} defaultValue={c.text} rows={Math.min(10, Math.max(3, Math.ceil(c.text.length / 90)))} className="input font-serif" />
          </div>
        );
      })}
      <label className="block text-sm" htmlFor="tnote">
        <span className="mb-1 block font-medium">What changed? (kept in the history)</span>
        <input id="tnote" name="note" className="input" maxLength={300} />
      </label>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <SubmitButton pendingLabel="Saving…">Save as new template version</SubmitButton>
        {state.message && <span role="status" className={`text-sm ${state.ok ? "text-good" : "text-bad"}`}>{state.message}</span>}
      </div>
    </form>
  );
}

export function SettingsForm({ defaults }: { defaults: { defaultExpiryDays: number; reminderAfterDays: number; retentionYears: number } }) {
  const [state, action] = useActionState(saveSettingsAction, init);
  return (
    <form action={action} className="grid max-w-xl gap-3 sm:grid-cols-3">
      {([
        ["defaultExpiryDays", "Signing links expire after (days)"],
        ["reminderAfterDays", "Remind slow signers after (days)"],
        ["retentionYears", "Retention period (years)"],
      ] as const).map(([k, label]) => (
        <label key={k} className="block text-sm" htmlFor={k}>
          <span className="mb-1 block font-medium">{label}</span>
          <input id={k} name={k} type="number" min={1} defaultValue={defaults[k]} className="input" />
        </label>
      ))}
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
        <SubmitButton>Save settings</SubmitButton>
        {state.message && <span role="status" className={`text-sm ${state.ok ? "text-good" : "text-bad"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
