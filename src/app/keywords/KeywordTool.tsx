"use client";

import { useMemo, useState } from "react";
import { analyzeKeywords, type KeywordPhrase } from "@/lib/listing/keywords";

function PhraseList({ title, items, empty }: { title: string; items: KeywordPhrase[]; empty: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((p) => (
            <li key={p.phrase} className={`rounded-full border px-2 py-0.5 text-sm ${p.inOwnTitle ? "border-accent" : "border-border"}`} title={`In ${p.docCount} text(s)${p.inOwnTitle ? " · in your title" : ""}`}>
              {p.phrase} <span className="text-xs text-muted">×{p.docCount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function KeywordTool({ initialTitle, initialTerms, brand }: { initialTitle: string; initialTerms: string; brand: string }) {
  const [own, setOwn] = useState(initialTitle);
  const [comp, setComp] = useState("");
  const [terms, setTerms] = useState(initialTerms);
  const r = useMemo(
    () => analyzeKeywords({ ownTitle: own, competitorTitles: comp.split(/\n/), searchTerms: terms.split(/[\n,]/), brand }),
    [own, comp, terms, brand],
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 lg:grid-cols-3">
        <label className="block text-sm" htmlFor="kw-own">
          <span className="mb-1 block font-medium">Your title (or draft)</span>
          <textarea id="kw-own" rows={4} className="input" value={own} onChange={(e) => setOwn(e.target.value)} />
        </label>
        <label className="block text-sm" htmlFor="kw-comp">
          <span className="mb-1 block font-medium">Competitor titles (one per line)</span>
          <textarea id="kw-comp" rows={4} className="input" value={comp} onChange={(e) => setComp(e.target.value)} />
        </label>
        <label className="block text-sm" htmlFor="kw-terms">
          <span className="mb-1 block font-medium">Search terms you&apos;ve seen (comma or line separated)</span>
          <textarea id="kw-terms" rows={4} className="input" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </label>
      </div>
      <p className="text-sm text-muted">{r.basis}</p>
      {r.stuffing.length > 0 && (
        <div className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn" role="note">
          {r.stuffing.map((s) => (
            <div key={s}>{s}</div>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Primary keyword</h3>
          <p className="text-lg font-semibold">{r.primary ? r.primary.phrase : "Not enough text yet"}</p>
          {r.primary && <p className="text-xs text-muted">Found in {r.primary.docCount} of {r.textsAnalyzed} texts{r.primary.inOwnTitle ? ", and already in your title" : ""}</p>}
        </div>
        <PhraseList title="Missing from your title (in 2+ texts)" items={r.missingFromOwnTitle} empty="Nothing obvious is missing." />
        <PhraseList title="Secondary keywords" items={r.secondary} empty="Add competitor titles to find shared phrases." />
        <PhraseList title="Long-tail keywords" items={r.longTail} empty="None found yet." />
        <PhraseList title="High-intent (buyer) keywords" items={r.high} empty="None found yet." />
        <PhraseList title="Informational keywords" items={r.informational} empty="None (how/what/vs/review searches)." />
        <PhraseList title="Low-relevance (found in one text only)" items={r.low} empty="None." />
        <div className="min-w-0 rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Product attributes mentioned</h3>
          <p className="text-sm">{r.attributes.length ? r.attributes.join(", ") : "None found."}</p>
        </div>
      </div>
      <p className="text-xs text-muted">
        Outlined chips are already in your title. Use keywords naturally; don&apos;t repeat words or stuff titles. Don&apos;t use other brands&apos; names
        as keywords.
      </p>
    </div>
  );
}
