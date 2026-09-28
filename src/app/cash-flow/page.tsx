import { connection } from "next/server";
import { addTransactionAction, deleteTransactionAction } from "@/app/actions/operations";
import { Card, Field, Notice, NumberInput, PageHeader, Pill, Stat, TableWrap, TextInput } from "@/components/ui";
import { classify, monthlyCashFlow, TRANSACTION_LABEL, TRANSACTION_TYPES, type TransactionType } from "@/lib/calc/ledger";
import { getDb } from "@/lib/db/client";
import { fmtUSD } from "@/lib/format";
import { listTransactions } from "@/lib/repo/operations";
import { getSettings } from "@/lib/repo/products";
import { TAX_DISCLAIMER } from "@/lib/reports/tax";
import { BeginnerHelp } from "@/components/BeginnerHelp";

const GROUP_LABEL = { inflow: "Income", cogs: "COGS (inventory)", operating: "Operating expense", equity: "Owner / capital" } as const;

export default async function CashFlowPage({ searchParams }: PageProps<"/cash-flow">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const settings = getSettings(db);
  const txs = listTransactions(db);
  const hasCapital = txs.some((t) => t.type === "capital_contribution");
  const opening = hasCapital ? 0 : settings.startingBudget ?? 0;
  const months = monthlyCashFlow(
    txs.map((t) => ({ date: t.date, type: t.type as TransactionType, amount: t.amount })),
    opening,
  ).reverse();
  const current = months[0]?.endingCash ?? opening;
  const year = new Date().getFullYear();
  const totals = { cogs: 0, operating: 0, inflow: 0 };
  for (const t of txs) {
    const c = classify(t.type as TransactionType);
    if (c !== "equity") totals[c] += t.amount;
  }

  return (
    <>
      <PageHeader
        title="Cash Flow & Expenses"
        subtitle="Record money in and out: Amazon payouts, inventory purchases, shipping, software, and other expenses. Receiving a purchase order records its costs automatically."
        actions={<a className="btn btn-secondary" href={`/cash-flow/tax-export?year=${year}`}>Tax-prep summary {year} (.csv)</a>}
      />
      {typeof sp.error === "string" && (
        <div className="mb-4">
          <Notice tone="bad">{sp.error}</Notice>
        </div>
      )}
      <BeginnerHelp>
        Record every payout from Amazon and every business expense here. Choose the type that matches. Inventory purchases count as <em>COGS</em>{" "}
        (cost of goods), and things like software and supplies are <em>operating expenses</em>. Both go into the tax-prep summary.
      </BeginnerHelp>
      <Notice tone="info" title="Cash isn't profit.">
        Buying inventory lowers your cash now, but it only counts as a cost (COGS) when the item sells. Amazon also pays out on a delay after
        the sale. So a profitable month can still leave you with less cash, and the other way around.
      </Notice>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cash available" value={fmtUSD(current)} hint={hasCapital ? "From recorded transactions" : `Starts from your budget in Settings (${fmtUSD(opening)})`} />
        <Stat label="Payouts and income" value={fmtUSD(totals.inflow)} />
        <Stat label="Inventory purchases (COGS-type)" value={fmtUSD(totals.cogs)} />
        <Stat label="Operating expenses" value={fmtUSD(totals.operating)} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Record a transaction">
          <form action={addTransactionAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" name="date"><TextInput name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
            <Field label="Type" name="type">
              <select id="type" name="type" className="input" defaultValue="amazon_payout">
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRANSACTION_LABEL[t]} · {GROUP_LABEL[classify(t)]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount $" name="amount" hint="Always positive; the type sets the direction."><NumberInput name="amount" min={0} /></Field>
            <Field label="Description" name="description"><TextInput name="description" /></Field>
            <div>
              <button className="btn" type="submit">Add</button>
            </div>
          </form>
        </Card>
        <Card title="Monthly summary">
          {months.length === 0 ? (
            <p className="text-sm text-muted">No transactions yet.</p>
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="r">Starting cash</th>
                    <th className="r">In</th>
                    <th className="r">Out</th>
                    <th className="r">Net</th>
                    <th className="r">Ending cash</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td className="r">{fmtUSD(m.startingCash)}</td>
                      <td className="r text-good">+{fmtUSD(m.inflows)}</td>
                      <td className="r text-bad">−{fmtUSD(m.outflows)}</td>
                      <td className={`r ${m.netCashFlow < 0 ? "text-bad" : ""}`}>{fmtUSD(m.netCashFlow)}</td>
                      <td className="r font-semibold">{fmtUSD(m.endingCash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title="Transactions">
          {txs.length === 0 ? (
            <p className="text-sm text-muted">None yet.</p>
          ) : (
            <TableWrap>
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Group</th>
                    <th>Description</th>
                    <th className="r">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => {
                    const c = classify(t.type as TransactionType);
                    const inflow = c === "inflow" || t.type === "capital_contribution";
                    return (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td>{TRANSACTION_LABEL[t.type as TransactionType] ?? t.type}</td>
                        <td><Pill tone={c === "inflow" ? "good" : c === "cogs" ? "info" : c === "equity" ? "neutral" : "warn"}>{GROUP_LABEL[c]}</Pill></td>
                        <td className="text-muted">{t.description ?? ""}</td>
                        <td className={`r ${inflow ? "text-good" : ""}`}>{inflow ? "+" : "−"}{fmtUSD(t.amount)}</td>
                        <td>
                          <form action={deleteTransactionAction.bind(null, t.id)}>
                            <button className="btn btn-danger btn-sm" type="submit" aria-label="Delete transaction">×</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">{TAX_DISCLAIMER}</p>
    </>
  );
}
