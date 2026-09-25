import { syncGoogleSheetsAction } from "@/app/actions/google";
import { sheetsConfig } from "@/lib/google/sync";
import { Notice } from "./ui";

/** "Sync to Google Sheets" control, plus the result of the last sync (passed through the query string). */
export function GoogleSheetsSync({ back, result, error }: { back: "/settings" | "/dashboard"; result?: string; error?: string }) {
  const cfg = sheetsConfig();
  return (
    <div className="space-y-2">
      {result && <Notice tone="good">{result}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
      {cfg.syncConfigured ? (
        <form action={syncGoogleSheetsAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="back" value={back} />
          <button className="btn btn-secondary" type="submit">Sync to Google Sheets</button>
          <span className="text-xs text-muted">Writes the Products, Inventory, Purchase Orders, Cash Flow, and Suppliers tabs (replacing their contents).</span>
        </form>
      ) : (
        <p className="text-sm text-muted">
          Google Sheets sync is off. To turn it on, set <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code>, <code>GOOGLE_PRIVATE_KEY</code>, and{" "}
          <code>GOOGLE_SHEET_ID</code> in <code>.env.local</code>, then share the sheet with the service account (see the README).
        </p>
      )}
    </div>
  );
}
