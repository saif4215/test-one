"use client";

import { useMemo, useState } from "react";
import { generateListing, SEARCH_TERMS_MAX_BYTES, TITLE_MAX, type WriterInput } from "@/lib/listing/writer";

const lines = (s: string) => s.split(/\n/).map((x) => x.trim()).filter(Boolean);

function In({ label, value, onChange, area, hint }: { label: string; value: string; onChange: (v: string) => void; area?: boolean; hint?: string }) {
  const id = `w-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {area ? (
        <textarea id={id} rows={3} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function CopyBox({ label, text, meta }: { label: string; text: string; meta?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</h3>
        <div className="flex items-center gap-2">
          {meta && <span className="text-xs text-muted">{meta}</span>}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="whitespace-pre-wrap break-words text-sm">{text || "—"}</div>
    </div>
  );
}

export interface WriterInitial {
  brand: string;
  productName: string;
  size: string;
  color: string;
  packCount: string;
  keywords: string;
}

export function Writer({ initial }: { initial: WriterInitial }) {
  const [brand, setBrand] = useState(initial.brand);
  const [name, setName] = useState(initial.productName);
  const [type, setType] = useState("");
  const [features, setFeatures] = useState("");
  const [size, setSize] = useState(initial.size);
  const [color, setColor] = useState(initial.color);
  const [pack, setPack] = useState(initial.packCount);
  const [material, setMaterial] = useState("");
  const [dims, setDims] = useState("");
  const [included, setIncluded] = useState("");
  const [uses, setUses] = useState("");
  const [keywords, setKeywords] = useState(initial.keywords);

  const out = useMemo(() => {
    const input: WriterInput = {
      brand,
      productName: name,
      productType: type,
      keyFeatures: lines(features),
      size,
      color,
      packCount: Number(pack) || null,
      material,
      dimensions: dims,
      includedItems: lines(included),
      useCases: uses.split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
      specs: [],
      keywords: keywords.split(/[,\n]/),
    };
    return generateListing(input);
  }, [brand, name, type, features, size, color, pack, material, dims, included, uses, keywords]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <In label="Brand" value={brand} onChange={setBrand} />
          <In label="Product name" value={name} onChange={setName} />
          <In label="Product type" value={type} onChange={setType} hint="e.g. Kitchen utensil set" />
          <In label="Material" value={material} onChange={setMaterial} />
          <In label="Size" value={size} onChange={setSize} />
          <In label="Color" value={color} onChange={setColor} />
          <In label="Pack count" value={pack} onChange={setPack} />
          <In label="Dimensions" value={dims} onChange={setDims} />
        </div>
        <In label="Key features (one per line; only what you can verify)" value={features} onChange={setFeatures} area hint='Tip: "Heat resistant - holds up to 450°F per the packaging" becomes a labeled bullet.' />
        <In label="What's included (one per line)" value={included} onChange={setIncluded} area />
        <In label="Uses (comma separated)" value={uses} onChange={setUses} />
        <In label="Search keywords (comma separated)" value={keywords} onChange={setKeywords} area hint="From your keyword research. Words already in the title, and your own brand, are left out automatically." />
      </div>
      <div className="min-w-0 space-y-3">
        {out.flagged.length > 0 && (
          <div className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn" role="note">
            <strong>Left out: claims that need proof or aren&apos;t allowed</strong>
            <ul className="mt-1 list-disc pl-5">
              {out.flagged.map((f, i) => (
                <li key={i}>
                  &ldquo;{f.match}&rdquo;: {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <CopyBox label="Title" text={out.title} meta={`${out.title.length}/${TITLE_MAX} characters`} />
        <CopyBox label="Bullet points" text={out.bullets.map((b) => `• ${b}`).join("\n")} />
        <CopyBox label="Description" text={out.description} />
        <CopyBox label="Backend search terms" text={out.searchTerms} meta={`${out.searchTermBytes}/${SEARCH_TERMS_MAX_BYTES} bytes`} />
        <ul className="list-disc pl-5 text-xs text-muted">
          {out.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
