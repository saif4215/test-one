import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/repo/products";

/** Plain-language help (§43). Shown only in beginner mode (Settings → Explanation level). */
export function BeginnerHelp({ children }: { children: ReactNode }) {
  if (getSettings(getDb()).mode !== "beginner") return null;
  return (
    <details className="mb-5 rounded-lg border border-border bg-info-bg px-4 py-3 text-sm text-info" open>
      <summary className="cursor-pointer font-semibold">What this means</summary>
      <div className="mt-2 text-text">
        {children}{" "}
        <Link href="/glossary" className="text-accent underline">
          Glossary
        </Link>
        {" · "}
        <span className="text-muted">Turn these tips off in Settings → Explanation level.</span>
      </div>
    </details>
  );
}
