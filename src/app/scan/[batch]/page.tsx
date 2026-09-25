import { notFound } from "next/navigation";
import { connection } from "next/server";
import { deleteImportAction, importRowsToProductsAction, updateMappingAction } from "@/app/actions/scan";
import { ImportOptionsFields } from "@/components/ImportOptionsFields";
import { Card, Disclaimer, Field, LinkButton, Notice, PageHeader, Pill, Stat, statusTone, TableWrap } from "@/components/ui";
import { effectiveFeeTable } from "@/lib/analysis/feeTable";
import { getDb } from "@/lib/db/client";
import { FIELD_LABELS } from "@/lib/domain/product";
import { fmtDateTime } from "@/lib/format";
import { analyzeSheet, MAPPABLE_FIELDS } from "@/lib/import/spreadsheet";
import { getImport } from "@/lib/repo/imports";
import { getSettings } from "@/lib/repo/products";

const PREVIEW_ROWS = 100;

export default async function ScanResultPage({ params }: PageProps<"/scan/[batch]">) {
  await connection();
  const { batch } = await params;
  const db = getDb();
  const imp = getImport(db, batch);
  if (!imp) notFound();
  const settings = getSettings(db);
  const result = analyzeSheet(imp.sheet, imp.mapping, imp.options, { settings, feeTable: effectiveFeeTable(settings) });
  const counts = { PASS: 0, "NEEDS DATA": 0, FAIL: 0 };
  for (const a of result.analyses) counts[a.filter.status]++;
  const origCols = imp.sheet.headers.length;
  const unmapped = imp.sheet.headers.filter((_, i) => !Object.values(imp.mapping).includes(i));

  return (
    <>
      <PageHeader
        title={`Scan: ${imp.filename}`}
        subtitle={`${imp.sheet.rows.length} rows · uploaded ${fmtDateTime(imp.createdAt)} · data as of ${fmtDateTime(imp.options.asOf)}`}
        actions={
          <>
            <a className="btn" href={`/scan/${batch}/export?format=xlsx`}>Download .xlsx</a>
            <a className="btn btn-secondary" href={`/scan/${batch}/export?format=csv`}>Download .csv</a>
            <form action={importRowsToProductsAction.bind(null, batch)}>
              <button className="btn btn-secondary" type="submit">Add rows to Find Products</button>
            </form>
          </>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pass your filters" value={counts.PASS} tone="good" />
        <Stat label="Need more data" value={counts["NEEDS DATA"]} tone="warn" />
        <Stat label="Fail a filter" value={counts.FAIL} tone="bad" />
      </div>
      <div className="mt-3">
        <Notice tone="warn">
          All calculated columns are estimates. Rows are shown in file order, not ranked. Unknown means the data wasn&apos;t in the file:
          Data unavailable — verify before purchasing.
        </Notice>
      </div>

      <form action={updateMappingAction.bind(null, batch)} className="mt-5 space-y-4">
        <Card title="Column mapping">
          <p className="mb-3 text-sm text-muted">
            Detected automatically from your headers. Fix any wrong ones and re-analyze. Unmapped columns are still kept in the export.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MAPPABLE_FIELDS.map((f) => (
              <Field key={f} label={FIELD_LABELS[f] ?? f} name={`map:${f}`}>
                <select id={`map:${f}`} name={`map:${f}`} className="input" defaultValue={imp.mapping[f] ?? ""}>
                  <option value="">Not in file</option>
                  {imp.sheet.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {unmapped.length > 0 && <p className="mt-3 text-xs text-muted">Kept but not used in calculations: {unmapped.join(", ")}</p>}
        </Card>
        <Card title="Data options">
          <ImportOptionsFields kind={imp.options.marketDataKind} asOf={imp.options.asOf} category={imp.options.defaultCategory} fulfillment={imp.options.fulfillment} />
        </Card>
        <div className="flex justify-end">
          <button className="btn btn-secondary" type="submit">Save mapping and re-analyze</button>
        </div>
      </form>

      <div className="mt-5">
        <Card title={`Results${result.rows.length > PREVIEW_ROWS ? ` (first ${PREVIEW_ROWS} of ${result.rows.length}; download for all)` : ""}`}>
          <TableWrap>
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className="r">Cost</th>
                  <th className="r">Price</th>
                  <th className="r">Fees (est.)</th>
                  <th className="r">Profit (est.)</th>
                  <th className="r">ROI (est.)</th>
                  <th>Risk</th>
                  <th>Filters</th>
                  <th>Why / missing</th>
                </tr>
              </thead>
              <tbody>
                {result.analyses.slice(0, PREVIEW_ROWS).map((a, i) => {
                  const cells = result.rows[i].slice(origCols);
                  return (
                    <tr key={i}>
                      <td className="text-muted">{i + 1}</td>
                      <td className="min-w-40">
                        <div className="font-medium">{a.product.name || "(no name)"}</div>
                        <div className="text-xs text-muted">{[a.product.brand, a.product.asin, a.product.upc].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="r">{a.product.purchasePrice?.toFixed(2) ?? "Unknown"}</td>
                      <td className="r">{a.product.salePrice?.toFixed(2) ?? "Unknown"}</td>
                      <td className="r">{cells[1]}</td>
                      <td className={`r ${a.unit && a.unit.profit < 0 ? "text-bad" : ""}`}>{cells[5]}</td>
                      <td className="r">{cells[6]}</td>
                      <td>{a.overallRisk}</td>
                      <td>
                        <Pill tone={statusTone(a.filter.status)}>{a.filter.status}</Pill>
                      </td>
                      <td className="max-w-md text-xs text-muted">
                        {cells[17] || null}
                        {cells[17] && a.missing.length ? " · " : ""}
                        {a.missing.length ? `Missing: ${a.missing.slice(0, 4).join(", ")}${a.missing.length > 4 ? "…" : ""}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Disclaimer />
        <div className="flex gap-2">
          <LinkButton href="/scan" variant="secondary">New scan</LinkButton>
          <form action={deleteImportAction.bind(null, batch)}>
            <button className="btn btn-danger" type="submit">Delete scan</button>
          </form>
        </div>
      </div>
    </>
  );
}
