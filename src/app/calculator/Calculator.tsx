"use client";

import { useMemo, useState } from "react";
import { FEE_CATEGORIES, US_FEE_TABLE } from "@/data/feeTables.us";
import { classifySizeTier, fbaFulfillmentFee, referralFee } from "@/lib/calc/fees";
import { batchEconomics, breakEvenPrice, maxBuyCost, minProfitablePrice, unitEconomics, type CostModel } from "@/lib/calc/profit";
import { fmtPct, fmtUSD, parseNumber } from "@/lib/format";

type FeeMode = "total" | "estimate";

function NumField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input id={id} className="input num" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Calculator({ targetProfit, targetRoi }: { targetProfit: number; targetRoi: number }) {
  const [buy, setBuy] = useState("10");
  const [sell, setSell] = useState("30");
  const [qty, setQty] = useState("20");
  const [mode, setMode] = useState<FeeMode>("total");
  const [fees, setFees] = useState("8");
  const [category, setCategory] = useState("Home & Kitchen");
  const [weight, setWeight] = useState("");
  const [l, setL] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [prepShip, setPrepShip] = useState("3");
  const [other, setOther] = useState("0");
  const [tp, setTp] = useState(String(targetProfit));
  const [tr, setTr] = useState(String(targetRoi));

  const r = useMemo(() => {
    const n = (s: string) => parseNumber(s) ?? 0;
    const price = n(sell);
    let fulfillment = 0;
    let referral: (p: number) => number;
    let feeNote = "";
    if (mode === "total") {
      referral = () => n(fees);
      feeNote = "Total Amazon fees as you entered them.";
    } else {
      const rule = US_FEE_TABLE.referral[category];
      referral = (p) => referralFee(rule, p);
      const dims = { lengthIn: n(l), widthIn: n(w), heightIn: n(h) };
      if (dims.lengthIn && dims.widthIn && dims.heightIn && n(weight)) {
        const tier = classifySizeTier(US_FEE_TABLE, dims, n(weight));
        fulfillment = fbaFulfillmentFee(US_FEE_TABLE, tier, price);
        feeNote = `Estimated from the reference fee table (${US_FEE_TABLE.effectiveDate}): ${tier.tier.replace("_", " ")}, ${tier.shippingWeightLb.toFixed(2)} lb. Verify with Amazon.`;
      } else {
        feeNote = "Enter weight and dimensions to estimate the FBA fee. Without them, only the referral fee is included.";
      }
    }
    const model: CostModel = {
      purchasePrice: n(buy),
      purchaseTaxPct: 0,
      inboundShipping: 0,
      prep: n(prepShip),
      packaging: 0,
      otherUpfront: n(other),
      fulfillment,
      storage: 0,
      advertising: 0,
      closingFee: mode === "estimate" ? US_FEE_TABLE.referral[category].closingFee ?? 0 : 0,
      referral,
      returnsPct: 0,
    };
    const u = unitEconomics(model, price);
    return {
      u,
      feeNote,
      batch: n(qty) > 0 ? batchEconomics(u, n(qty)) : null,
      be: breakEvenPrice(model),
      maxBuy: maxBuyCost(model, price, n(tp), n(tr)),
      minPrice: minProfitablePrice(model, n(tp), n(tr)),
    };
  }, [buy, sell, qty, mode, fees, category, weight, l, w, h, prepShip, other, tp, tr]);

  const { u } = r;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumField label="Purchase price ($)" value={buy} onChange={setBuy} />
          <NumField label="Selling price ($)" value={sell} onChange={setSell} />
          <NumField label="Quantity" value={qty} onChange={setQty} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Amazon fees</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" name="mode" checked={mode === "total"} onChange={() => setMode("total")} /> I know the total
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="mode" checked={mode === "estimate"} onChange={() => setMode("estimate")} /> Estimate from category and size
            </label>
          </div>
        </fieldset>
        {mode === "total" ? (
          <NumField label="Total Amazon fees per unit ($)" value={fees} onChange={setFees} hint="Referral + fulfillment fees, e.g. from Amazon's Revenue Calculator." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2" htmlFor="calc-category">
              <span className="mb-1 block font-medium">Category</span>
              <select id="calc-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {FEE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <NumField label="Weight (lb)" value={weight} onChange={setWeight} />
            <NumField label="Length (in)" value={l} onChange={setL} />
            <NumField label="Width (in)" value={w} onChange={setW} />
            <NumField label="Height (in)" value={h} onChange={setH} />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="Shipping + prep per unit ($)" value={prepShip} onChange={setPrepShip} />
          <NumField label="Other upfront cost per unit ($)" value={other} onChange={setOther} />
          <NumField label="Target profit per unit ($)" value={tp} onChange={setTp} />
          <NumField label="Target ROI (%)" value={tr} onChange={setTr} />
        </div>
        <p className="text-xs text-muted">{r.feeNote}</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-muted">Est. profit / unit</div>
            <div className={`num text-2xl font-semibold ${u.profit < 0 ? "text-bad" : "text-good"}`}>{fmtUSD(u.profit)}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-muted">ROI</div>
            <div className="num text-2xl font-semibold">{fmtPct(u.roiPct)}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-muted">Margin</div>
            <div className="num text-2xl font-semibold">{fmtPct(u.marginPct)}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-muted">Break-even price</div>
            <div className="num text-2xl font-semibold">{fmtUSD(r.be)}</div>
          </div>
        </div>
        <div className="space-y-1 rounded-lg border border-border bg-surface p-4 font-mono text-xs leading-relaxed sm:text-sm">
          <div>Amazon fees = {fmtUSD(u.amazonFees)}</div>
          <div>
            Total cost = {fmtUSD(u.purchaseCost)} + {fmtUSD(u.amazonFees)} + {fmtUSD(u.upfrontCost - u.purchaseCost)} = {fmtUSD(u.totalCost)}
          </div>
          <div>
            Profit = {fmtUSD(u.salePrice)} − {fmtUSD(u.totalCost)} = <strong>{fmtUSD(u.profit)}</strong>
          </div>
          <div>
            ROI = {fmtUSD(u.profit)} ÷ {fmtUSD(u.upfrontCost)} × 100 = <strong>{fmtPct(u.roiPct)}</strong>
          </div>
          <div>
            Margin = {fmtUSD(u.profit)} ÷ {fmtUSD(u.salePrice)} × 100 = <strong>{fmtPct(u.marginPct)}</strong>
          </div>
          <div className="pt-2">Maximum buy price (meets both targets): {fmtUSD(r.maxBuy)}</div>
          <div>Minimum profitable selling price: {fmtUSD(r.minPrice)}</div>
          {r.batch && (
            <>
              <div className="pt-2">
                Total investment = {r.batch.quantity} × {fmtUSD(u.upfrontCost)} = {fmtUSD(r.batch.totalInvestment)}
              </div>
              <div>
                Estimated total profit = {r.batch.quantity} × {fmtUSD(u.profit)} = {fmtUSD(r.batch.totalProfit)}
              </div>
              <div>Batch ROI = {fmtPct(r.batch.roiPct)}</div>
            </>
          )}
        </div>
        <p className="text-xs text-muted">
          ROI is measured against the upfront investment (purchase price + shipping/prep + other), because Amazon fees are
          taken from the sale. This is an estimate: check the actual fees and selling price before buying.
        </p>
      </div>
    </div>
  );
}
