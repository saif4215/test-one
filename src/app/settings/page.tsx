import { connection } from "next/server";
import { FEE_CATEGORIES, US_FEE_TABLE } from "@/data/feeTables.us";
import { saveSettingsAction } from "@/app/actions/settings";
import { Card, Field, Notice, NumberInput, PageHeader, Pill, TextInput } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { providerStatuses } from "@/lib/providers";
import { getSettings } from "@/lib/repo/products";

function Check({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1" />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function refLabel(cat: string) {
  const r = US_FEE_TABLE.referral[cat];
  const tiers = r.tiers
    .map((t) => (t.upTo === null ? `${t.pct}%` : `${t.pct}% ${r.mode === "marginal" ? "of the first" : "if ≤"} $${t.upTo}`))
    .join(", ");
  return `${tiers}${r.minFee ? ` (min $${r.minFee.toFixed(2)})` : ""}${r.closingFee ? ` + $${r.closingFee.toFixed(2)} closing` : ""}`;
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const s = getSettings(db);
  const providers = providerStatuses(db);
  const f = s.filters;
  const c = s.costDefaults;

  return (
    <>
      <PageHeader
        title={s.onboarded ? "Settings" : "Set up your reselling system"}
        subtitle="Your answers set the targets, filters, and cost assumptions used in every analysis. Change them any time; saved analyses recalculate automatically."
      />
      {sp.saved && (
        <div className="mb-4">
          <Notice tone="good">Settings saved.</Notice>
        </div>
      )}
      <form action={saveSettingsAction} className="space-y-6">
        <Card title="1. Getting started">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Business name (optional)" name="businessName">
              <TextInput name="businessName" defaultValue={s.businessName} />
            </Field>
            <Field label="Starting budget ($)" name="startingBudget" hint="Used for test-buy sizing and capital limits.">
              <NumberInput name="startingBudget" defaultValue={s.startingBudget} min={0} />
            </Field>
            <Field label="Marketplace" name="marketplace" hint="Fee tables cover Amazon US.">
              <select id="marketplace" name="marketplace" className="input" defaultValue="US" disabled>
                <option value="US">Amazon US (USD)</option>
              </select>
            </Field>
            <Field label="Fulfillment" name="fulfillment">
              <select id="fulfillment" name="fulfillment" className="input" defaultValue={s.fulfillment}>
                <option value="BOTH">Both FBA and FBM</option>
                <option value="FBA">FBA only</option>
                <option value="FBM">FBM only</option>
              </select>
            </Field>
            <Field label="Amazon seller account?" name="hasSellerAccount">
              <select id="hasSellerAccount" name="hasSellerAccount" className="input" defaultValue={s.hasSellerAccount}>
                <option value="yes">Yes</option>
                <option value="no">Not yet</option>
                <option value="not_sure">Not sure</option>
              </select>
            </Field>
            <Field label="Selling plan" name="sellerPlan">
              <select id="sellerPlan" name="sellerPlan" className="input" defaultValue={s.sellerPlan}>
                <option value="unknown">Unknown</option>
                <option value="professional">Professional</option>
                <option value="individual">Individual</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Sourcing methods</legend>
              <div className="space-y-1">
                <Check name="sourcing:retail" label="Retail arbitrage" checked={s.sourcing.includes("retail")} />
                <Check name="sourcing:online" label="Online arbitrage" checked={s.sourcing.includes("online")} />
                <Check name="sourcing:wholesale" label="Wholesale" checked={s.sourcing.includes("wholesale")} />
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">About you</legend>
              <div className="space-y-1">
                <Check name="hasSuppliers" label="I already have suppliers" checked={s.hasSuppliers} />
                <Check name="wantsProductHelp" label="I want help finding products" checked={s.wantsProductHelp} />
                <Check name="wantsSpreadsheets" label="I want spreadsheet import/export" checked={s.wantsSpreadsheets} />
              </div>
            </fieldset>
            <Field label="Categories I want to sell" name="preferredCategories" hint="Comma-separated, e.g. Home & Kitchen, Toys & Games">
              <TextInput name="preferredCategories" defaultValue={s.preferredCategories.join(", ")} />
            </Field>
            <Field label="Categories to avoid" name="avoidCategories" hint="Products in these categories fail the deal filters.">
              <TextInput name="avoidCategories" defaultValue={s.avoidCategories.join(", ")} />
            </Field>
            <Field label="Explanation level" name="mode">
              <select id="mode" name="mode" className="input" defaultValue={s.mode}>
                <option value="beginner">Beginner: plain-language explanations</option>
                <option value="advanced">Advanced: sensitivity, scaling, and unit economics shown by default</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="2. Targets">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum profit per unit ($)" name="targetMinProfit">
              <NumberInput name="targetMinProfit" defaultValue={s.targetMinProfit} min={0} />
            </Field>
            <Field label="Minimum ROI (%)" name="targetRoiPct">
              <NumberInput name="targetRoiPct" defaultValue={s.targetRoiPct} min={0} />
            </Field>
            <Field label="Minimum margin (%)" name="targetMarginPct">
              <NumberInput name="targetMarginPct" defaultValue={s.targetMarginPct} min={0} />
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted">
            Used for the maximum buy price, the minimum profitable price, and the default deal filters.
          </p>
        </Card>

        <Card title="3. Cost assumptions">
          <p className="mb-3 text-sm text-muted">
            Used only when a product doesn&apos;t have its own value, and always labeled <strong>Assumption</strong> in reports.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Prep per unit ($)" name="prepPerUnit"><NumberInput name="prepPerUnit" defaultValue={c.prepPerUnit} min={0} /></Field>
            <Field label="Packaging per unit ($)" name="packagingPerUnit"><NumberInput name="packagingPerUnit" defaultValue={c.packagingPerUnit} min={0} /></Field>
            <Field label="Inbound shipping ($/lb)" name="inboundPerLb"><NumberInput name="inboundPerLb" defaultValue={c.inboundPerLb} min={0} /></Field>
            <Field label="Sales tax on purchases (%)" name="purchaseTaxPct"><NumberInput name="purchaseTaxPct" defaultValue={c.purchaseTaxPct} min={0} /></Field>
            <Field label="Returns allowance (% of price)" name="returnsPct"><NumberInput name="returnsPct" defaultValue={c.returnsPct} min={0} /></Field>
            <Field label="Advertising per unit ($)" name="advertisingPerUnit"><NumberInput name="advertisingPerUnit" defaultValue={c.advertisingPerUnit} min={0} /></Field>
            <Field label="Expected days in storage" name="expectedStorageDays"><NumberInput name="expectedStorageDays" defaultValue={c.expectedStorageDays} min={0} /></Field>
            <Field label="Max capital per product (%)" name="maxCapitalPctPerProduct" hint="Caps test buys and scaling."><NumberInput name="maxCapitalPctPerProduct" defaultValue={c.maxCapitalPctPerProduct} min={0} /></Field>
            <Field label="Flag data stale after (days)" name="staleAfterDays"><NumberInput name="staleAfterDays" defaultValue={c.staleAfterDays} min={1} /></Field>
            <Field label="Slow mover after (days without a sale)" name="slowMoverDays"><NumberInput name="slowMoverDays" defaultValue={c.slowMoverDays} min={1} /></Field>
            <Field label="Safety stock (days of sales)" name="safetyDays"><NumberInput name="safetyDays" defaultValue={c.safetyDays} min={0} /></Field>
            <Field label="Warn when price is above 90-day avg by (%)" name="aboveAverageWarnPct"><NumberInput name="aboveAverageWarnPct" defaultValue={c.aboveAverageWarnPct} min={0} /></Field>
          </div>
        </Card>

        <Card title="4. Deal filters">
          <p className="mb-3 text-sm text-muted">
            Leave the profit/ROI/margin fields blank to use your targets above. Unknown data never counts as a pass; it shows as <em>Needs data</em>.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Min profit ($)" name="f_minProfit"><NumberInput name="f_minProfit" defaultValue={f.minProfit} placeholder={`Target: ${s.targetMinProfit}`} /></Field>
            <Field label="Min ROI (%)" name="f_minRoiPct"><NumberInput name="f_minRoiPct" defaultValue={f.minRoiPct} placeholder={`Target: ${s.targetRoiPct}`} /></Field>
            <Field label="Min margin (%)" name="f_minMarginPct"><NumberInput name="f_minMarginPct" defaultValue={f.minMarginPct} placeholder={`Target: ${s.targetMarginPct}`} /></Field>
            <Field label="Max purchase price ($)" name="f_maxPurchasePrice"><NumberInput name="f_maxPurchasePrice" defaultValue={f.maxPurchasePrice} placeholder="No limit" /></Field>
            <Field label="Max seller count" name="f_maxSellerCount"><NumberInput name="f_maxSellerCount" defaultValue={f.maxSellerCount} placeholder="No limit" /></Field>
            <Field label="Max sales rank" name="f_maxSalesRank"><NumberInput name="f_maxSalesRank" defaultValue={f.maxSalesRank} placeholder="No limit" /></Field>
            <Field label="Min your monthly sales (low est.)" name="f_minMonthlySalesLow"><NumberInput name="f_minMonthlySalesLow" defaultValue={f.minMonthlySalesLow} placeholder="No minimum" /></Field>
            <Field label="Max inventory days (slow case)" name="f_maxInventoryDays"><NumberInput name="f_maxInventoryDays" defaultValue={f.maxInventoryDays} placeholder="No limit" /></Field>
            <Field label="Max capital per product ($)" name="f_maxCapitalPerProduct"><NumberInput name="f_maxCapitalPerProduct" defaultValue={f.maxCapitalPerProduct} placeholder="No limit" /></Field>
            <Field label="Max risk level" name="f_maxRiskLevel">
              <select id="f_maxRiskLevel" name="f_maxRiskLevel" className="input" defaultValue={f.maxRiskLevel ?? ""}>
                <option value="">Any</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </Field>
            <Field label="Only these categories" name="f_allowedCategories" className="sm:col-span-2"><TextInput name="f_allowedCategories" defaultValue={f.allowedCategories.join(", ")} placeholder="Any category" /></Field>
            <Field label="Exclude categories" name="f_excludedCategories" className="sm:col-span-2"><TextInput name="f_excludedCategories" defaultValue={f.excludedCategories.join(", ")} /></Field>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Check name="f_excludeRestricted" label="Exclude restricted / unverified" checked={f.excludeRestricted} hint="Unknown restriction status shows as Needs data" />
            <Check name="f_excludeFragile" label="Exclude fragile" checked={f.excludeFragile} />
            <Check name="f_excludeExpiring" label="Exclude expiring products" checked={f.excludeExpiring} />
            <Check name="f_excludeHazmat" label="Exclude hazmat" checked={f.excludeHazmat} />
          </div>
        </Card>

        <Card title="5. Amazon fee reference table">
          <Notice tone="warn" title="Verify:">{US_FEE_TABLE.verifyNote}</Notice>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Date you last checked the fees against Amazon" name="feeTableVerifiedAt" hint={`Built-in reference date: ${US_FEE_TABLE.effectiveDate}`}>
              <TextInput name="feeTableVerifiedAt" type="date" defaultValue={s.feeTableVerifiedAt} />
            </Field>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">Referral fee overrides by category</summary>
            <p className="mt-2 text-xs text-muted">Enter a flat % to replace the reference rate. Leave blank to use the reference.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {FEE_CATEGORIES.map((cat) => (
                <Field key={cat} label={cat} name={`ref:${cat}`} hint={`Reference: ${refLabel(cat)}`}>
                  <NumberInput name={`ref:${cat}`} defaultValue={s.referralPctOverrides[cat] ?? null} placeholder="Use reference" />
                </Field>
              ))}
            </div>
          </details>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium">Monthly storage rate overrides ($ per cubic foot)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Standard, Jan–Sep" name="st_standardJanSep"><NumberInput name="st_standardJanSep" defaultValue={s.storageRateOverrides.standardJanSep ?? null} placeholder={String(US_FEE_TABLE.storage.standard.janSep)} /></Field>
              <Field label="Standard, Oct–Dec" name="st_standardOctDec"><NumberInput name="st_standardOctDec" defaultValue={s.storageRateOverrides.standardOctDec ?? null} placeholder={String(US_FEE_TABLE.storage.standard.octDec)} /></Field>
              <Field label="Oversize, Jan–Sep" name="st_oversizeJanSep"><NumberInput name="st_oversizeJanSep" defaultValue={s.storageRateOverrides.oversizeJanSep ?? null} placeholder={String(US_FEE_TABLE.storage.oversize.janSep)} /></Field>
              <Field label="Oversize, Oct–Dec" name="st_oversizeOctDec"><NumberInput name="st_oversizeOctDec" defaultValue={s.storageRateOverrides.oversizeOctDec ?? null} placeholder={String(US_FEE_TABLE.storage.oversize.octDec)} /></Field>
            </div>
          </details>
        </Card>

        <div className="flex justify-end">
          <button type="submit" className="btn">Save settings</button>
        </div>
      </form>

      <div className="mt-8">
        <Card title="Data sources">
          <ul className="space-y-4">
            {providers.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 max-w-2xl">
                  <div className="font-medium">
                    {p.name} <span className="text-xs font-normal text-muted">· {p.cost}</span>
                  </div>
                  <div className="text-sm text-muted">{p.description}</div>
                  <div className="mt-1 text-xs text-muted">Provides: {p.capabilities.join("; ")}</div>
                  {!p.configured && p.setup && <div className="mt-1 text-xs">To enable: {p.setup}</div>}
                </div>
                <Pill tone={p.configured ? "good" : "neutral"}>{p.configured ? "Active" : "Not configured"}</Pill>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            The app never scrapes websites or gets around logins, CAPTCHAs, rate limits, or paywalls. Paid tools (Keepa, etc.) are not
            built in, but you can type their numbers in or import their exports as CSV, labeled Third-party.
          </p>
        </Card>
      </div>
    </>
  );
}
