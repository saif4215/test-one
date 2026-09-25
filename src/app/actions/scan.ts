"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import type { DataKind } from "@/lib/data/provenance";
import { fStr } from "@/lib/forms";
import {
  detectMapping,
  MAPPABLE_FIELDS,
  MAX_ROWS,
  parseIdentifierList,
  parseUpload,
  rowToProduct,
  type ImportOptions,
  type Mapping,
  type Sheet,
} from "@/lib/import/spreadsheet";
import { createImport, deleteImport, getImport, updateImport } from "@/lib/repo/imports";
import { createProduct } from "@/lib/repo/products";

const KINDS: DataKind[] = ["USER_PROVIDED", "THIRD_PARTY", "VERIFIED"];

function readOptions(fd: FormData, filename: string): ImportOptions {
  const kind = fStr(fd, "marketDataKind") as DataKind | null;
  const asOf = fStr(fd, "asOf");
  return {
    filename,
    marketDataKind: kind && KINDS.includes(kind) ? kind : "USER_PROVIDED",
    asOf: asOf && !Number.isNaN(Date.parse(asOf)) ? new Date(asOf).toISOString() : new Date().toISOString(),
    defaultCategory: fStr(fd, "defaultCategory"),
    fulfillment: fStr(fd, "fulfillment") === "FBM" ? "FBM" : "FBA",
  };
}

export async function uploadSpreadsheetAction(formData: FormData) {
  const file = formData.get("file");
  const pasted = fStr(formData, "pasted");
  let sheet: Sheet;
  let filename: string;
  try {
    if (file instanceof File && file.size > 0) {
      filename = file.name;
      sheet = await parseUpload(file.name, await file.arrayBuffer());
    } else if (pasted) {
      filename = "Pasted list";
      sheet = parseIdentifierList(pasted);
    } else {
      redirect("/scan?error=" + encodeURIComponent("Choose a file or paste a list."));
    }
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    redirect("/scan?error=" + encodeURIComponent(`Couldn't read the file: ${(e as Error).message}`));
  }
  if (!sheet.headers.length || !sheet.rows.length) redirect("/scan?error=" + encodeURIComponent("The file has no data rows."));
  if (sheet.rows.length > MAX_ROWS)
    redirect("/scan?error=" + encodeURIComponent(`The file has ${sheet.rows.length} rows; the limit is ${MAX_ROWS}. Split it into smaller files.`));
  const batch = createImport(getDb(), { filename, sheet, mapping: detectMapping(sheet.headers), options: readOptions(formData, filename) });
  revalidatePath("/scan");
  redirect(`/scan/${batch}`);
}

export async function updateMappingAction(batch: string, formData: FormData) {
  const db = getDb();
  const imp = getImport(db, batch);
  if (!imp) redirect("/scan");
  const mapping: Mapping = {};
  for (const f of MAPPABLE_FIELDS) {
    const v = fStr(formData, `map:${f}`);
    if (v !== null && Number.isInteger(Number(v))) mapping[f] = Number(v);
  }
  updateImport(db, batch, mapping, readOptions(formData, imp.filename));
  revalidatePath(`/scan/${batch}`);
  redirect(`/scan/${batch}`);
}

export async function importRowsToProductsAction(batch: string) {
  const db = getDb();
  const imp = getImport(db, batch);
  if (!imp) redirect("/scan");
  for (const row of imp.sheet.rows) {
    if (row.every((c) => !c.trim())) continue;
    const p = rowToProduct(row, imp.sheet.headers, imp.mapping, imp.options);
    createProduct(db, p, { importBatch: batch });
  }
  revalidatePath("/products");
  redirect(`/products?batch=${batch}`);
}

export async function deleteImportAction(batch: string) {
  deleteImport(getDb(), batch);
  revalidatePath("/scan");
  redirect("/scan");
}
