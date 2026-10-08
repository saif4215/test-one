"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { saveStepAction } from "@/app/actions/agreements";
import { formatCents, parseCents, remainingBalance, sumCents } from "@/lib/agreements/money";
import { ASSET_CATEGORIES, LIABILITY_CATEGORIES } from "@/lib/agreements/schema";
import { SubmitButton, type ActionState } from "./ActionForm";
import type { Column, FieldSpec, SectionSpec } from "./formSpecs";

type Data = Record<string, unknown>;

function getAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function setAt(obj: Data, path: string, value: unknown): Data {
  const [head, ...rest] = path.split(".");
  const clone: Data | unknown[] = Array.isArray(obj) ? [...obj] : { ...obj };
  const key = Array.isArray(clone) ? Number(head) : head;
  (clone as Record<string | number, unknown>)[key] = rest.length ? setAt(((obj as Record<string, unknown>)[head] ?? {}) as Data, rest.join("."), value) : value;
  return clone as Data;
}

const idFor = (path: string) => `f-${path.replace(/\./g, "-")}`;

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <p id={`${id}-err`} className="field-error" role="alert">
      {msg}
    </p>
  ) : null;
}

function Control({ kind, id, value, onChange, options, rows, placeholder, error, label }: { kind: string; id: string; value: unknown; onChange: (v: unknown) => void; options?: Array<[string, string]>; rows?: number; placeholder?: string; error?: string; label: string }) {
  const common = { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-err` : undefined } as const;
  const v = value === undefined || value === null ? "" : String(value);
  if (kind === "textarea") return <textarea {...common} className="input" rows={rows ?? 3} value={v} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
  if (kind === "select")
    return (
      <select {...common} className="input" value={v} onChange={(e) => onChange(e.target.value)}>
        {(options ?? []).map(([val, text]) => (
          <option key={val} value={val}>{text}</option>
        ))}
      </select>
    );
  if (kind === "checkbox")
    return (
      <label className="flex items-center gap-2 text-sm" htmlFor={id}>
        <input {...common} type="checkbox" className="h-4 w-4" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
    );
  if (kind === "money")
    return (
      <input
        {...common}
        className="input num"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder ?? "0.00"}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const c = parseCents(e.target.value);
          if (c !== null) onChange((c / 100).toFixed(2));
        }}
      />
    );
  const type = kind === "email" ? "email" : kind === "tel" ? "tel" : kind === "date" ? "date" : "text";
  return <input {...common} className="input" type={type} inputMode={kind === "number" ? "numeric" : undefined} value={v} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function Labeled({ id, label, required, hint, error, children, span, hideLabel }: { id: string; label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; span?: number; hideLabel?: boolean }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : span === 3 ? "sm:col-span-3" : span === 4 ? "sm:col-span-2 lg:col-span-4" : ""}>
      {!hideLabel && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium">
          {label}
          {required && <span className="ml-1 text-bad" title="Required before the agreement can be submitted for review">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <Err id={id} msg={error} />
    </div>
  );
}

function PriceSummary({ data, onAddDifference }: { data: Data; onAddDifference: (cents: number) => void }) {
  const total = String(getAt(data, "price.totalPrice") ?? "");
  const deposit = String(getAt(data, "price.deposit") ?? "");
  const payments = (getAt(data, "price.payments") as Array<{ amount: string }> | undefined) ?? [];
  const bal = remainingBalance(total, deposit);
  const t = parseCents(total);
  const sum = sumCents(payments.map((p) => p.amount));
  const diff = t === null ? null : t - sum;
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3 text-sm sm:col-span-2" aria-live="polite">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><div className="text-xs text-muted">Remaining balance (calculated)</div><div className="num text-lg font-semibold">{bal === null ? (parseCents(deposit) !== null && t !== null ? "Deposit exceeds price" : "—") : formatCents(bal)}</div></div>
        <div><div className="text-xs text-muted">Scheduled payments total</div><div className="num text-lg font-semibold">{formatCents(sum)}</div></div>
        <div>
          <div className="text-xs text-muted">Check against purchase price</div>
          <div className={`text-sm font-semibold ${diff === 0 ? "text-good" : diff === null ? "" : "text-bad"}`}>
            {diff === null ? "Enter the purchase price" : diff === 0 ? "Schedule matches the price" : diff > 0 ? `${formatCents(diff)} not yet scheduled` : `Over by ${formatCents(-diff)}`}
          </div>
        </div>
      </div>
      {diff !== null && diff > 0 && (
        <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => onAddDifference(diff)}>
          Add a payment for the {formatCents(diff)} difference
        </button>
      )}
    </div>
  );
}

function ListField({ spec, data, set, errors }: { spec: Extract<FieldSpec, { type: "list" }>; data: Data; set: (path: string, v: unknown) => void; errors: Record<string, string> }) {
  const rows = (getAt(data, spec.path) as Array<Record<string, unknown>> | undefined) ?? [];
  const update = (i: number, key: string, v: unknown) => set(`${spec.path}.${i}.${key}`, v);
  return (
    <div className="sm:col-span-2">
      <div className="mb-2 text-sm font-medium">{spec.label}</div>
      {spec.hint && <p className="mb-2 text-xs text-muted">{spec.hint}</p>}
      {rows.length === 0 && <p className="mb-2 rounded-md border border-dashed border-border p-3 text-sm text-muted">{spec.emptyText ?? "Nothing added yet."}</p>}
      <ol className="space-y-3">
        {rows.map((row, i) => (
          <li key={i} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{spec.itemTitle} {i + 1}</span>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => set(spec.path, rows.filter((_, j) => j !== i))} aria-label={`Remove ${spec.itemTitle} ${i + 1}`}>Remove</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {spec.columns.map((c: Column) => {
                const id = `${idFor(spec.path)}-${i}-${c.key}`;
                const err = errors[`${spec.path}.${i}.${c.key}`];
                return (
                  <Labeled key={c.key} id={id} label={c.label} error={err} span={c.span === 4 ? 4 : c.span === 3 ? 3 : c.span === 2 ? 2 : 1} hideLabel={c.kind === "checkbox"}>
                    <Control kind={c.kind} id={id} value={row[c.key]} onChange={(v) => update(i, c.key, v)} options={c.options} rows={2} placeholder={c.placeholder} error={err} label={c.label} />
                  </Labeled>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {(!spec.max || rows.length < spec.max) && (
        <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => set(spec.path, [...rows, { ...spec.blank }])}>
          + {spec.addLabel}
        </button>
      )}
    </div>
  );
}

function FieldView({ f, data, set, errors }: { f: FieldSpec; data: Data; set: (path: string, v: unknown) => void; errors: Record<string, string> }) {
  switch (f.type) {
    case "note":
      return <p className={`rounded-md px-3 py-2 text-sm sm:col-span-2 ${f.tone === "warn" ? "bg-warn-bg text-warn" : "bg-info-bg text-info"}`}>{f.text}</p>;
    case "priceSummary":
      return (
        <PriceSummary
          data={data}
          onAddDifference={(cents) => set("price.payments", [...(((getAt(data, "price.payments") as unknown[]) ?? [])), { description: "Balance", amount: (cents / 100).toFixed(2), dueDate: String(getAt(data, "closing.closingDate") ?? getAt(data, "business.proposedClosingDate") ?? ""), status: "scheduled" }])}
        />
      );
    case "list":
      return <ListField spec={f} data={data} set={set} errors={errors} />;
    case "assetCategories": {
      const cats = (getAt(data, f.path) as Record<string, string> | undefined) ?? {};
      return (
        <fieldset className="sm:col-span-2">
          <legend className="sr-only">Asset categories</legend>
          <ul className="divide-y divide-border rounded-md border border-border">
            {ASSET_CATEGORIES.map(([key, label]) => (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{label}</span>
                <select aria-label={label} className="input !w-auto" value={cats[key] ?? "tbd"} onChange={(e) => set(`${f.path}.${key}`, e.target.value)}>
                  <option value="tbd">Not decided yet</option>
                  <option value="included">Included</option>
                  <option value="excluded">Not included</option>
                </select>
              </li>
            ))}
          </ul>
        </fieldset>
      );
    }
    case "noneDisclosed": {
      const none = (getAt(data, f.path) as string[] | undefined) ?? [];
      const items = (getAt(data, f.itemsPath) as Array<{ category: string }> | undefined) ?? [];
      return (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Categories with nothing to disclose</legend>
          <p className="mb-2 text-xs text-muted">Tick a category only if the parties state that no items exist in it. Every category must either have a listed item or be ticked.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {LIABILITY_CATEGORIES.map(([key, label]) => {
              const has = items.some((it) => it.category === key);
              return (
                <li key={key}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={none.includes(key)} disabled={has} onChange={(e) => set(f.path, e.target.checked ? [...none, key] : none.filter((k) => k !== key))} />
                    <span>{label}{has ? " (has listed items)" : ""}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      );
    }
    case "field": {
      const id = idFor(f.path);
      const err = errors[f.path];
      return (
        <Labeled id={id} label={f.label} required={f.required} hint={f.hint} error={err} span={f.span} hideLabel={f.kind === "checkbox"}>
          <Control kind={f.kind} id={id} value={getAt(data, f.path)} onChange={(v) => set(f.path, v)} options={f.options} rows={f.rows} placeholder={f.placeholder} error={err} label={f.label} />
        </Labeled>
      );
    }
  }
}

export function StepForm({ agreementId, step, sections, initial, prevHref, locked, finalLabel }: { agreementId: string; step: string; sections: SectionSpec[]; initial: Data; prevHref?: string; locked?: boolean; finalLabel?: string }) {
  const [data, setData] = useState<Data>(initial);
  const [version, setVersion] = useState(0);
  const [savedVersion, setSavedVersion] = useState(0);
  const dirty = version !== savedVersion;
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await saveStepAction(prev, fd);
    // Only a confirmed save clears the "unsaved changes" mark.
    if (res.ok) setSavedVersion(Number(fd.get("version")));
    return res;
  }, {});
  const errors = state.errors ?? {};
  const set = (path: string, v: unknown) => {
    setData((d) => setAt(d, path, v));
    setVersion((n) => n + 1);
  };
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const errorCount = Object.keys(errors).length;
  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="payload" value={JSON.stringify(data)} />
      {state.message && !state.ok && (
        <div role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">
          {state.message}
          {errorCount > 0 && <ul className="mt-1 list-disc pl-5">{Object.entries(errors).slice(0, 8).map(([k, m]) => <li key={k}>{m}</li>)}</ul>}
        </div>
      )}
      {sections.map((s) => (
        <fieldset key={s.title} disabled={locked} className="rounded-lg border border-border bg-surface p-4">
          <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">{s.title}</legend>
          {s.description && <p className="mb-3 text-sm text-muted">{s.description}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {s.fields.map((f, i) => (
              <FieldView key={i} f={f} data={data} set={set} errors={errors} />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        {prevHref && <Link href={prevHref} className="btn btn-secondary">← Back</Link>}
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving…" disabled={locked}>Save draft</SubmitButton>
        <button type="submit" name="intent" value="next" className="btn" disabled={locked}>{finalLabel ?? "Save and continue →"}</button>
        <span role="status" className={`text-sm ${state.ok ? "text-good" : "text-muted"}`}>
          {state.ok && !dirty ? "Saved." : dirty ? "Unsaved changes" : ""}
        </span>
      </div>
    </form>
  );
}
