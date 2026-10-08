"use client";

import { useActionState } from "react";
import { acceptInviteAction, changePasswordAction, loginAction } from "@/app/actions/agreements";
import { ActionState, SubmitButton } from "./ActionForm";

const initial: ActionState = {};

function Msg({ s }: { s: ActionState }) {
  if (!s.message) return null;
  return (
    <p role={s.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-sm ${s.ok ? "bg-good-bg text-good" : "bg-bad-bg text-bad"}`}>
      {s.message}
    </p>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <Msg s={state} />
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm" htmlFor="email">
        <span className="mb-1 block font-medium">Email</span>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" autoFocus defaultValue={state.values?.email} />
      </label>
      <label className="block text-sm" htmlFor="password">
        <span className="mb-1 block font-medium">Password</span>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      <SubmitButton className="btn w-full justify-center" pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function InviteForm({ token, name }: { token: string; name: string }) {
  const [state, action] = useActionState(acceptInviteAction, initial);
  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <p className="text-sm text-muted">Welcome, {name}. Choose a password with at least 12 characters.</p>
      <Msg s={state} />
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm" htmlFor="password">
        <span className="mb-1 block font-medium">New password</span>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required className="input" />
      </label>
      <label className="block text-sm" htmlFor="confirm">
        <span className="mb-1 block font-medium">Confirm password</span>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required className="input" />
      </label>
      <SubmitButton className="btn w-full justify-center">Create my account</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="max-w-md space-y-4">
      <Msg s={state} />
      {[
        ["current", "Current password", "current-password"],
        ["next", "New password (12+ characters)", "new-password"],
        ["confirm", "Confirm new password", "new-password"],
      ].map(([name, label, ac]) => (
        <label key={name} className="block text-sm" htmlFor={`pw-${name}`}>
          <span className="mb-1 block font-medium">{label}</span>
          <input id={`pw-${name}`} name={name} type="password" autoComplete={ac} minLength={name === "current" ? undefined : 12} required className="input" />
        </label>
      ))}
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}
