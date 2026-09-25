import { effectiveFeeTable } from "@/lib/analysis/feeTable";
import { getDb } from "@/lib/db/client";
import { analyzeSheet, toCsv, toXlsx } from "@/lib/import/spreadsheet";
import { getImport } from "@/lib/repo/imports";
import { getSettings } from "@/lib/repo/products";

export async function GET(req: Request, ctx: RouteContext<"/scan/[batch]/export">) {
  const { batch } = await ctx.params;
  const db = getDb();
  const imp = getImport(db, batch);
  if (!imp) return new Response("Not found", { status: 404 });
  const settings = getSettings(db);
  const out = analyzeSheet(imp.sheet, imp.mapping, imp.options, { settings, feeTable: effectiveFeeTable(settings) });
  const base = imp.filename.replace(/\.(csv|xlsx)$/i, "").replace(/[^\w.-]+/g, "_") || "scan";
  const format = new URL(req.url).searchParams.get("format");
  if (format === "xlsx") {
    const buf = await toXlsx(out.headers, out.rows, imp.sheet.headers.length);
    return new Response(buf, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${base}-analyzed.xlsx"`,
      },
    });
  }
  return new Response("﻿" + toCsv(out.headers, out.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${base}-analyzed.csv"`,
    },
  });
}
