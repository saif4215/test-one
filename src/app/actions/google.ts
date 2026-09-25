"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { fStr } from "@/lib/forms";
import { readServiceAccount } from "@/lib/google/auth";
import { parseSheetId, SheetsClient } from "@/lib/google/sheets";
import { syncToGoogleSheets } from "@/lib/google/sync";
import { detectMapping, MAX_ROWS } from "@/lib/import/spreadsheet";
import { createImport } from "@/lib/repo/imports";

export async function syncGoogleSheetsAction(formData: FormData) {
  const back = fStr(formData, "back") === "/dashboard" ? "/dashboard" : "/settings";
  let msg: string;
  try {
    const r = await syncToGoogleSheets(getDb());
    msg = `sheets=${encodeURIComponent(`Synced ${r.rows} rows to ${r.tabs.length} tabs (${r.tabs.join(", ")}) at ${new Date().toISOString()}.`)}`;
  } catch (e) {
    msg = `sheetsError=${encodeURIComponent((e as Error).message)}`;
  }
  redirect(`${back}?${msg}`);
}

export async function importGoogleSheetAction(formData: FormData) {
  const sa = readServiceAccount();
  const fail = (m: string) => redirect("/scan?error=" + encodeURIComponent(m));
  if (!sa) fail("Google service account isn't configured (set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY).");
  const sheetId = parseSheetId(fStr(formData, "sheet") ?? "");
  if (!sheetId) fail("Enter a Google Sheets URL or spreadsheet ID.");
  const tab = fStr(formData, "tab") ?? undefined;
  let values: string[][] = [];
  try {
    values = await new SheetsClient(sa!, sheetId!).readTab(tab);
  } catch (e) {
    fail((e as Error).message);
  }
  const [headers = [], ...rows] = values;
  if (!headers.length || !rows.length) fail("That sheet tab has no data rows.");
  if (rows.length > MAX_ROWS) fail(`The sheet has ${rows.length} rows; the limit is ${MAX_ROWS}.`);
  const width = headers.length;
  const sheet = { headers: headers.map((h) => h.trim()), rows: rows.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill("")]) };
  const filename = `Google Sheet ${sheetId!.slice(0, 8)}…${tab ? ` / ${tab}` : ""}`;
  const asOf = new Date().toISOString();
  const batch = createImport(getDb(), {
    filename,
    sheet,
    mapping: detectMapping(sheet.headers),
    options: {
      filename,
      marketDataKind: fStr(formData, "marketDataKind") === "THIRD_PARTY" ? "THIRD_PARTY" : "USER_PROVIDED",
      asOf,
      defaultCategory: fStr(formData, "defaultCategory"),
      fulfillment: fStr(formData, "fulfillment") === "FBM" ? "FBM" : "FBA",
    },
  });
  revalidatePath("/scan");
  redirect(`/scan/${batch}`);
}
