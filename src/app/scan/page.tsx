import Link from "next/link";
import { connection } from "next/server";
import { uploadSpreadsheetAction } from "@/app/actions/scan";
import { ImportOptionsFields } from "@/components/ImportOptionsFields";
import { Card, Field, Notice, PageHeader, TableWrap } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { fmtDateTime } from "@/lib/format";
import { MAX_ROWS } from "@/lib/import/spreadsheet";
import { listImports } from "@/lib/repo/imports";

export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  await connection();
  const sp = await searchParams;
  const imports = listImports(getDb());
  return (
    <>
      <PageHeader
        title="Scan Spreadsheet"
        subtitle="Upload a CSV or Excel buy list, supplier catalog, or tool export, or paste ASINs/UPCs/URLs. Every row gets analyzed, your original columns are kept, and you can download the analyzed file."
      />
      {typeof sp.error === "string" && (
        <div className="mb-4">
          <Notice tone="bad">{sp.error}</Notice>
        </div>
      )}
      <form action={uploadSpreadsheetAction} className="space-y-5">
        <Card title="1. Choose data">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Upload .csv or .xlsx" name="file" hint={`Up to ${MAX_ROWS.toLocaleString()} rows and 10 MB. The first row should hold column headers.`}>
              <input id="file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input" />
            </Field>
            <Field label="…or paste a list (one ASIN, UPC, URL, or name per line)" name="pasted">
              <textarea id="pasted" name="pasted" rows={4} className="input" placeholder={"B0ABCDEF12\n036000291452"} />
            </Field>
          </div>
        </Card>
        <Card title="2. About this data">
          <ImportOptionsFields />
        </Card>
        <div className="flex justify-end">
          <button className="btn" type="submit">Scan</button>
        </div>
      </form>

      <div className="mt-6">
        <Card title="Recent scans">
          {imports.length === 0 ? (
            <p className="text-sm text-muted">No scans yet. A sample file is in <code>samples/products.csv</code>.</p>
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>File</th>
                    <th className="r">Rows</th>
                    <th>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((i) => (
                    <tr key={i.batch}>
                      <td>
                        <Link className="text-accent hover:underline" href={`/scan/${i.batch}`}>{i.filename}</Link>
                      </td>
                      <td className="r">{i.rowCount}</td>
                      <td>{fmtDateTime(i.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
