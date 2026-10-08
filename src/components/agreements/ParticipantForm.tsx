"use client";

import { grantAccessAction } from "@/app/actions/agreements";
import { ActionForm } from "./ActionForm";

export function ParticipantForm({ agreementId }: { agreementId: string }) {
  return (
    <ActionForm action={grantAccessAction} fields={{ agreementId }} label="Give access" className="btn btn-sm" inline={false}>
      <div className="grid gap-2 sm:grid-cols-4">
        <input name="email" type="email" required placeholder="user@example.com" aria-label="User email" className="input sm:col-span-2" />
        <select name="party" aria-label="Role in this deal" className="input" defaultValue="">
          <option value="">Other</option>
          <option value="buyer">Buyer</option>
          <option value="seller">Seller</option>
          <option value="attorney">Attorney</option>
        </select>
        <select name="level" aria-label="Access level" className="input" defaultValue="viewer">
          <option value="viewer">Can view and download</option>
          <option value="editor">Can edit and send</option>
        </select>
      </div>
    </ActionForm>
  );
}
