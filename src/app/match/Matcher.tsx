"use client";

import { useMemo, useState } from "react";
import { matchProducts, type MatchableProduct } from "@/lib/calc/matching";
import { parseNumber } from "@/lib/format";

type Side = Record<"title" | "brand" | "gtin" | "model" | "size" | "color" | "packCount" | "quantity" | "condition", string>;

const FIELDS: { key: keyof Side; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "brand", label: "Brand" },
  { key: "gtin", label: "UPC / EAN / GTIN" },
  { key: "model", label: "Model / MPN" },
  { key: "size", label: "Size" },
  { key: "color", label: "Color" },
  { key: "packCount", label: "Pack count" },
  { key: "quantity", label: "Net quantity (e.g. 16 oz)" },
  { key: "condition", label: "Condition" },
];

const empty: Side = { title: "", brand: "", gtin: "", model: "", size: "", color: "", packCount: "", quantity: "", condition: "" };

function toMatchable(s: Side): MatchableProduct {
  return {
    title: s.title || null,
    brand: s.brand || null,
    gtin: s.gtin || null,
    model: s.model || null,
    size: s.size || null,
    color: s.color || null,
    packCount: parseNumber(s.packCount),
    quantity: s.quantity || null,
    condition: s.condition || null,
  };
}

const RESULT_STYLE: Record<string, string> = {
  same: "text-good",
  different: "text-bad",
  missing: "text-muted",
  invalid: "text-warn",
};

export function Matcher({
  initialAmazon,
  productId,
  saveAction,
}: {
  initialAmazon?: Partial<Side>;
  productId?: number;
  saveAction?: (formData: FormData) => Promise<void>;
}) {
  const [supplier, setSupplier] = useState<Side>(empty);
  const [amazon, setAmazon] = useState<Side>({ ...empty, ...initialAmazon });
  const result = useMemo(() => matchProducts(toMatchable(supplier), toMatchable(amazon)), [supplier, amazon]);
  const tone = result.verdict === "MATCH" ? "bg-good-bg text-good" : result.verdict === "POSSIBLE MATCH" ? "bg-warn-bg text-warn" : "bg-bad-bg text-bad";

  const column = (title: string, side: Side, set: (s: Side) => void, prefix: string) => (
    <fieldset className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {FIELDS.map((f) => (
        <label key={f.key} className="block text-sm" htmlFor={`${prefix}-${f.key}`}>
          <span className="mb-1 block font-medium">{f.label}</span>
          <input id={`${prefix}-${f.key}`} className="input" value={side[f.key]} onChange={(e) => set({ ...side, [f.key]: e.target.value })} />
        </label>
      ))}
    </fieldset>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {column("Supplier / source product", supplier, setSupplier, "sup")}
        {column("Amazon listing", amazon, setAmazon, "amz")}
      </div>
      <div className="rounded-lg border border-border bg-surface p-4" aria-live="polite">
        <div className={`inline-block rounded-md px-3 py-1 text-lg font-bold ${tone}`}>{result.verdict}</div>
        <p className="mt-2 text-sm">{result.summary}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {result.evidence.map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className={`w-20 shrink-0 font-semibold uppercase ${RESULT_STYLE[e.result]}`}>{e.result}</span>
              <span>{e.detail}</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold">Still verify</h3>
        <ul className="list-disc pl-5 text-sm">
          {result.toVerify.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
        {productId && saveAction && (
          <form action={saveAction} className="mt-4">
            <input type="hidden" name="verdict" value={result.verdict} />
            <button className="btn btn-secondary" type="submit">Save verdict to product</button>
          </form>
        )}
      </div>
    </div>
  );
}
