/**
 * Minimal Google Sheets API v4 client (REST). You share the spreadsheet with
 * your service account's email, and the app reads and writes only that sheet.
 */
import { getAccessToken, SHEETS_SCOPE, type ServiceAccount } from "./auth";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/** Accepts a spreadsheet ID or a full Google Sheets URL. */
export function parseSheetId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(s) ? s : null;
}

/** A1 range covering a whole tab, with the tab name quoted. */
export const tabRange = (title: string) => `'${title.replace(/'/g, "''")}'`;

export class SheetsClient {
  constructor(
    private sa: ServiceAccount,
    private sheetId: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getAccessToken(this.sa, SHEETS_SCOPE, this.fetchImpl);
    const res = await this.fetchImpl(`${BASE}/${this.sheetId}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) {
      const msg = body.error?.message ?? res.statusText;
      throw new Error(
        res.status === 403 || res.status === 404
          ? `Google Sheets: ${msg}. Share the spreadsheet with ${this.sa.email} as an Editor, and check the sheet ID.`
          : `Google Sheets: ${msg}`,
      );
    }
    return body;
  }

  async tabTitles(): Promise<string[]> {
    const r = await this.call<{ sheets?: { properties: { title: string } }[] }>("?fields=sheets.properties.title");
    return (r.sheets ?? []).map((s) => s.properties.title);
  }

  async ensureTabs(titles: string[]): Promise<void> {
    const existing = new Set(await this.tabTitles());
    const missing = titles.filter((t) => !existing.has(t));
    if (!missing.length) return;
    await this.call(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }),
    });
  }

  async readTab(title?: string): Promise<string[][]> {
    const tab = title ?? (await this.tabTitles())[0];
    if (!tab) return [];
    const r = await this.call<{ values?: unknown[][] }>(`/values/${encodeURIComponent(tabRange(tab))}?valueRenderOption=FORMATTED_VALUE`);
    return (r.values ?? []).map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c))));
  }

  /** Replaces the tab's contents with `rows` (strings are written as-is, not as formulas). */
  async writeTab(title: string, rows: (string | number | null)[][]): Promise<void> {
    const range = encodeURIComponent(tabRange(title));
    await this.call(`/values/${range}:clear`, { method: "POST", body: "{}" });
    await this.call(`/values/${range}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ range: tabRange(title), majorDimension: "ROWS", values: rows.map((r) => r.map((c) => (c === null ? "" : c))) }),
    });
  }
}
