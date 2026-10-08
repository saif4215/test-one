"use client";

import { useActionState, useState } from "react";
import { declineAction, requestCodeAction, startSigningAction, verifyCodeAction } from "@/app/actions/agreements";
import { SubmitButton, type ActionState } from "./ActionForm";

const init: ActionState = {};

function Msg({ s }: { s: ActionState }) {
  if (!s.message) return null;
  return <p role={s.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-sm ${s.ok ? "bg-good-bg text-good" : "bg-bad-bg text-bad"}`}>{s.message}</p>;
}

export function IdentityGate({ token, maskedEmail }: { token: string; maskedEmail: string }) {
  const [reqState, reqAction] = useActionState(requestCodeAction, init);
  const [verState, verAction] = useActionState(verifyCodeAction, init);
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">Confirm it&apos;s you</h2>
      <p className="text-sm text-muted">To protect the agreement, we&apos;ll email a 6-digit code to <strong>{maskedEmail}</strong>. Enter it below to continue.</p>
      <form action={reqAction} className="space-y-2">
        <input type="hidden" name="token" value={token} />
        <SubmitButton className="btn btn-secondary" pendingLabel="Sending…">Email me a code</SubmitButton>
        <Msg s={reqState} />
      </form>
      <form action={verAction} className="space-y-2">
        <input type="hidden" name="token" value={token} />
        <label className="block text-sm" htmlFor="code">
          <span className="mb-1 block font-medium">6-digit code</span>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="input !w-40 text-lg tracking-widest" />
        </label>
        <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
        <Msg s={verState} />
      </form>
    </div>
  );
}

export function ConsentForm({ token, esignParagraphs, reviewText, consentText }: { token: string; esignParagraphs: string[]; reviewText: string; consentText: string }) {
  const [state, action] = useActionState(startSigningAction, init);
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <input type="hidden" name="token" value={token} />
      <h2 className="text-lg font-semibold">Consent and signature</h2>
      <details className="rounded-md border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Electronic signature disclosure (please read)</summary>
        <ul className="mt-2 list-disc space-y-2 pl-5">{esignParagraphs.map((p) => <li key={p}>{p}</li>)}</ul>
      </details>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="reviewed" className="mt-1 h-4 w-4" checked={b} onChange={(e) => setB(e.target.checked)} />
        <span>{reviewText}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="esign" className="mt-1 h-4 w-4" checked={a} onChange={(e) => setA(e.target.checked)} />
        <span>{consentText}</span>
      </label>
      <Msg s={state} />
      <SubmitButton className="btn !px-5 !py-2.5 !text-base" pendingLabel="Opening the signing page…" disabled={!(a && b)}>Review and Sign Agreement</SubmitButton>
      <p className="text-xs text-muted">You&apos;ll be taken to our e-signature service to add your signature (typed or drawn, if offered). Your signature isn&apos;t final until that service confirms it.</p>
    </form>
  );
}

export function DeclineForm({ token }: { token: string }) {
  const [state, action] = useActionState(declineAction, init);
  return (
    <details className="rounded-lg border border-border bg-surface p-4 text-sm">
      <summary className="cursor-pointer font-medium">I don&apos;t want to sign</summary>
      <form action={action} className="mt-3 space-y-2" onSubmit={(e) => { if (!window.confirm("Decline to sign? This closes the signing request for everyone.")) e.preventDefault(); }}>
        <input type="hidden" name="token" value={token} />
        <label className="block" htmlFor="reason"><span className="mb-1 block">Reason (optional)</span><textarea id="reason" name="reason" rows={2} maxLength={500} className="input" /></label>
        <Msg s={state} />
        <SubmitButton className="btn btn-danger" pendingLabel="Declining…">Decline to sign</SubmitButton>
      </form>
    </details>
  );
}
