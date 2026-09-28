"use client";

import { useMemo, useState } from "react";
import { analyzeReviews } from "@/lib/listing/reviews";

export function ReviewTool({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const a = useMemo(() => analyzeReviews(text), [text]);
  const complaints = a.themes.filter((t) => t.kind === "complaint");
  const compliments = a.themes.find((t) => t.kind === "compliment");
  return (
    <div className="space-y-5">
      <label className="block rounded-lg border border-border bg-surface p-4 text-sm" htmlFor="rv-text">
        <span className="mb-1 block font-medium">Reviews (separate them with a blank line, or start each one with its star rating)</span>
        <textarea id="rv-text" rows={8} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={"★★ Broke after two uses…\n\n★★★★★ Works great…"} />
      </label>
      <p className="text-sm text-muted">
        {a.reviews} review(s) analyzed. {a.notes.join(" ")}
      </p>
      {a.reviews > 0 && (
        <>
          {a.topComplaints.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">What this suggests</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {a.topComplaints.map((t) => (
                  <li key={t.id}>
                    <strong>{t.label}</strong> ({t.count} of {a.reviews}): {t.opportunity}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border bg-surface p-4">
            <table className="data">
              <thead>
                <tr>
                  <th>Theme</th>
                  <th className="r">Reviews</th>
                  <th className="r">Share</th>
                  <th>Examples</th>
                </tr>
              </thead>
              <tbody>
                {[...complaints, ...(compliments ? [compliments] : [])].map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">
                      {t.label}
                      <div className="text-xs font-normal text-muted">{t.kind === "complaint" ? "Complaint" : "Compliment"}</div>
                    </td>
                    <td className="r">{t.count}</td>
                    <td className="r">{t.pct.toFixed(0)}%</td>
                    <td className="max-w-md text-xs text-muted">
                      {t.examples.length ? t.examples.map((e, i) => <div key={i}>&ldquo;{e}&rdquo;</div>) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
