"use client";

import { useActionState, useState } from "react";
import { removeAttachmentAction, saveStepAction, submitReviewAction, uploadAttachmentAction } from "@/app/actions/agreements";
import { ActionForm, SubmitButton, type ActionState } from "./ActionForm";

const init: ActionState = {};

export function UploadPanel({ agreementId, disabled, hideSchedule }: { agreementId: string; disabled?: boolean; hideSchedule?: boolean }) {
  const [state, action] = useActionState(uploadAttachmentAction, init);
  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="agreementId" value={agreementId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-3" htmlFor="up-file">
          <span className="mb-1 block font-medium">Files (PDF, PNG, JPG, DOCX, XLSX, CSV; up to 10 MB each)</span>
          <input id="up-file" name="file" type="file" multiple required disabled={disabled} accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv" className="input" />
        </label>
        <label className="block text-sm" htmlFor="up-kind">
          <span className="mb-1 block font-medium">What is it?</span>
          <select id="up-kind" name="kind" className="input" disabled={disabled}>
            <option value="supporting">Supporting document</option>
            <option value="inventory">Inventory document</option>
            <option value="photo">Photograph</option>
          </select>
        </label>
        {hideSchedule ? <input type="hidden" name="schedule" value="" /> : <label className="block text-sm" htmlFor="up-schedule">
          <span className="mb-1 block font-medium">Belongs to schedule</span>
          <select id="up-schedule" name="schedule" className="input" disabled={disabled}>
            <option value="">None (general attachment)</option>
            {["A", "B", "C", "D", "E", "F", "G"].map((s) => (
              <option key={s} value={s}>Schedule {s}</option>
            ))}
          </select>
        </label>}
      </div>
      <p className="text-xs text-muted">PDFs and images are added to the agreement as numbered exhibits and appear in the final PDF. Other file types are listed in the attachment index with their fingerprint but are provided separately. Files are stored privately; they are never public URLs.</p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Uploading…" disabled={disabled}>Upload</SubmitButton>
        {state.message && <span role="status" className={`text-sm ${state.ok ? "text-good" : "text-bad"}`}>{state.message}</span>}
      </div>
    </form>
  );
}

export function RemoveAttachment({ agreementId, attachmentId, disabled }: { agreementId: string; attachmentId: string; disabled?: boolean }) {
  if (disabled) return null;
  return <ActionForm action={removeAttachmentAction} fields={{ agreementId, attachmentId }} label="Remove" className="btn btn-danger btn-sm" confirm="Remove this file from the agreement?" />;
}

export function ClauseEditor({ agreementId, clauses, overrides, templateText, locked }: { agreementId: string; clauses: Array<{ key: string; section: number; title: string }>; overrides: Record<string, string>; templateText: Record<string, string>; locked?: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(clauses.map((c) => [c.key, overrides[c.key] ?? templateText[c.key] ?? ""])));
  const [state, action] = useActionState(saveStepAction, init);
  const changed = (k: string) => values[k] !== (templateText[k] ?? "");
  const payload = JSON.stringify({ clauseOverrides: Object.fromEntries(clauses.filter((c) => changed(c.key)).map((c) => [c.key, values[c.key]])) });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="step" value="clauses" />
      <input type="hidden" name="payload" value={payload} />
      {clauses.map((c, idx) => {
        const head = idx === 0 || clauses[idx - 1].section !== c.section;
        return (
          <div key={c.key}>
            {head && <h3 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-muted">Section {c.section}</h3>}
            <label htmlFor={`cl-${c.key}`} className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
              <span>{c.title}</span>
              {changed(c.key) && (
                <span className="flex items-center gap-2 text-xs font-normal">
                  <span className="rounded bg-warn-bg px-1.5 py-0.5 text-warn">Edited for this agreement</span>
                  <button type="button" className="underline" onClick={() => setValues((v) => ({ ...v, [c.key]: templateText[c.key] ?? "" }))}>Reset to template</button>
                </span>
              )}
            </label>
            <textarea id={`cl-${c.key}`} className="input font-serif" rows={Math.min(10, Math.max(3, Math.ceil((values[c.key]?.length ?? 0) / 90)))} value={values[c.key]} disabled={locked} onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))} />
          </div>
        );
      })}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <SubmitButton pendingLabel="Saving…" disabled={locked}>Save wording</SubmitButton>
        {state.message && <span role="status" className={`text-sm ${state.ok ? "text-good" : "text-bad"}`}>{state.message}</span>}
      </div>
    </form>
  );
}

export function SubmitReviewForm({ agreementId, blocked }: { agreementId: string; blocked: boolean }) {
  const [state, action] = useActionState(submitReviewAction, init);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="agreementId" value={agreementId} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1 h-4 w-4" required disabled={blocked} />
        <span>I have reviewed the full agreement preview and the details above are correct. I understand it is a template and not legal advice.</span>
      </label>
      {state.message && !state.ok && (
        <div role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">
          {state.message}
          {state.errors && <ul className="mt-1 list-disc pl-5">{Object.values(state.errors).slice(0, 12).map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>
      )}
      <SubmitButton pendingLabel="Submitting…" disabled={blocked}>Submit for review</SubmitButton>
    </form>
  );
}
