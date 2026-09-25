import { desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";
import type { ImportOptions, Mapping, Sheet } from "@/lib/import/spreadsheet";

export interface ImportRecord {
  id: number;
  batch: string;
  filename: string;
  createdAt: string;
  sheet: Sheet;
  mapping: Mapping;
  options: ImportOptions;
}

function toRecord(r: typeof imports.$inferSelect): ImportRecord {
  return {
    id: r.id,
    batch: r.batch,
    filename: r.filename,
    createdAt: r.createdAt,
    sheet: { headers: r.headers as string[], rows: r.rows as string[][] },
    mapping: r.mapping as Mapping,
    options: r.options as ImportOptions,
  };
}

export function createImport(db: DB, i: { filename: string; sheet: Sheet; mapping: Mapping; options: ImportOptions }): string {
  const batch = `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  db.insert(imports)
    .values({
      batch,
      filename: i.filename,
      createdAt: new Date().toISOString(),
      headers: i.sheet.headers,
      rows: i.sheet.rows,
      mapping: i.mapping,
      options: i.options,
    })
    .run();
  return batch;
}

export function getImport(db: DB, batch: string): ImportRecord | null {
  const r = db.select().from(imports).where(eq(imports.batch, batch)).get();
  return r ? toRecord(r) : null;
}

export function updateImport(db: DB, batch: string, mapping: Mapping, options: ImportOptions): void {
  db.update(imports).set({ mapping, options }).where(eq(imports.batch, batch)).run();
}

export function listImports(db: DB): { batch: string; filename: string; createdAt: string; rowCount: number }[] {
  return db
    .select()
    .from(imports)
    .orderBy(desc(imports.createdAt))
    .all()
    .map((r) => ({ batch: r.batch, filename: r.filename, createdAt: r.createdAt, rowCount: (r.rows as string[][]).length }));
}

export function deleteImport(db: DB, batch: string): void {
  db.delete(imports).where(eq(imports.batch, batch)).run();
}
