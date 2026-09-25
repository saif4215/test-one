import Papa from "papaparse";
import { getDb } from "@/lib/db/client";
import { listInventory, listSales, listTransactions } from "@/lib/repo/operations";
import { taxSummaryRows } from "@/lib/reports/tax";

export async function GET(req: Request) {
  const y = Number(new URL(req.url).searchParams.get("year"));
  const year = Number.isInteger(y) && y > 2000 && y < 2100 ? y : new Date().getFullYear();
  const db = getDb();
  const rows = taxSummaryRows(year, listSales(db), listInventory(db), listTransactions(db));
  return new Response("﻿" + Papa.unparse(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tax-prep-summary-${year}.csv"`,
    },
  });
}
