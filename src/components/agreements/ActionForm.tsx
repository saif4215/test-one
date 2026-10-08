"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export interface ActionState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Echoed back so a form that React resets after submit can keep what the user typed (never passwords). */
  values?: Record<string, string>;
}

export function SubmitButton({ children, className = "btn", pendingLabel = "Working…", disabled }: { children: ReactNode; className?: string; pendingLabel?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** A small form for a server action that reports its result next to the button (never a silent success). */
export function ActionForm({
  action,
  fields = {},
  label,
  className = "btn btn-secondary btn-sm",
  confirm,
  children,
  inline = true,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  fields?: Record<string, string>;
  label: string;
  className?: string;
  confirm?: string;
  children?: ReactNode;
  inline?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className={inline ? "inline-flex flex-wrap items-center gap-2" : "space-y-2"}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <SubmitButton className={className}>{label}</SubmitButton>
      {state.message && (
        <span role="status" className={`text-xs ${state.ok ? "text-good" : "text-bad"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
