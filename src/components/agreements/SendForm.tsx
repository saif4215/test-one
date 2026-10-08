"use client";

import { useActionState } from "react";
import { sendAction } from "@/app/actions/agreements";
import { SubmitButton, type ActionState } from "./ActionForm";

export function SendForm({ agreementId, defaultDays, disabled, buyerName, sellerName }: { agreementId: string; defaultDays: number; disabled: boolean; buyerName: string; sellerName: string }) {
  const [state, action] = useActionState<ActionState, FormData>(sendAction, {});
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="agreementId" value={agreementId} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Signing order</legend>
        <div className="space-y-2 text-sm">
          {[
            ["buyer_first", `Buyer first, then Seller`, `${buyerName} signs, then ${sellerName} is invited.`],
            ["seller_first", `Seller first, then Buyer`, `${sellerName} signs, then ${buyerName} is invited.`],
            ["parallel", "Both at the same time", "Both are invited right away and can sign in any order."],
          ].map(([v, label, hint], i) => (
            <label key={v} className="flex items-start gap-2 rounded-md border border-border p-3">
              <input type="radio" name="order" value={v} defaultChecked={i === 0} className="mt-1" disabled={disabled} />
              <span><span className="font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm" htmlFor="expiryDays">
        <span className="mb-1 block font-medium">Signing links expire after (days)</span>
        <input id="expiryDays" name="expiryDays" type="number" min={1} max={60} defaultValue={defaultDays} className="input !w-32" disabled={disabled} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1 h-4 w-4" required disabled={disabled} />
        <span>I confirm this exact version has been reviewed by the parties and their attorney and is ready to be signed. Sending locks it; any later change requires a new version that everyone must sign again.</span>
      </label>
      {state.message && !state.ok && <div role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{state.message}</div>}
      <SubmitButton pendingLabel="Sending…" disabled={disabled}>Send for signature</SubmitButton>
    </form>
  );
}
