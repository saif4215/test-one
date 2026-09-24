import { FEE_CATEGORIES } from "@/data/feeTables.us";
import { saveProductAction } from "@/app/actions/products";
import type { ProductInput } from "@/lib/domain/product";
import { Card, Field, NumberInput, TextInput, TriSelect } from "./ui";

function localDateTimeValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function ProductForm({ product, id, submitLabel = "Analyze deal" }: { product: ProductInput; id?: number; submitLabel?: string }) {
  const p = product;
  const marketKind = p.prov.sellerCount?.kind ?? p.prov.listingMonthlySalesLow?.kind ?? "USER_PROVIDED";
  const marketSource = p.prov.listingMonthlySalesLow?.source ?? p.prov.sellerCount?.source ?? "";
  return (
    <form action={saveProductAction} className="space-y-5">
      <input type="hidden" name="__original" value={JSON.stringify(p)} />
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      <Card title="Product">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Product name" name="name" className="sm:col-span-2">
            <TextInput name="name" defaultValue={p.name} required />
          </Field>
          <Field label="Brand" name="brand"><TextInput name="brand" defaultValue={p.brand} /></Field>
          <Field label="ASIN" name="asin"><TextInput name="asin" defaultValue={p.asin} placeholder="B0…" /></Field>
          <Field label="UPC/EAN" name="upc"><TextInput name="upc" defaultValue={p.upc} /></Field>
          <Field label="Category (fee category)" name="category" hint="Sets the referral fee rate.">
            <select id="category" name="category" className="input" defaultValue={p.category ?? ""}>
              <option value="">Unknown</option>
              {FEE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              {p.category && !FEE_CATEGORIES.includes(p.category) && <option value={p.category}>{p.category} (not in fee table)</option>}
            </select>
          </Field>
          <Field label="Subcategory" name="subcategory"><TextInput name="subcategory" defaultValue={p.subcategory} /></Field>
          <Field label="Condition" name="condition">
            <select id="condition" name="condition" className="input" defaultValue={p.condition}>
              {["New", "Used - Like New", "Used - Very Good", "Used - Good", "Used - Acceptable", "Collectible"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Fulfillment" name="fulfillment">
            <select id="fulfillment" name="fulfillment" className="input" defaultValue={p.fulfillment}>
              <option value="FBA">FBA (Fulfilled by Amazon)</option>
              <option value="FBM">FBM (you ship)</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Purchase (source)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Sourcing type" name="sourceType">
            <select id="sourceType" name="sourceType" className="input" defaultValue={p.sourceType ?? ""}>
              <option value="">Unknown</option>
              <option value="retail">Retail arbitrage</option>
              <option value="online">Online arbitrage</option>
              <option value="wholesale">Wholesale</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Supplier / store" name="sourceName"><TextInput name="sourceName" defaultValue={p.sourceName} /></Field>
          <Field label="Source URL" name="sourceUrl" className="sm:col-span-2"><TextInput name="sourceUrl" type="url" defaultValue={p.sourceUrl} placeholder="https://…" /></Field>
          <Field label="Purchase price per unit ($)" name="purchasePrice"><NumberInput name="purchasePrice" defaultValue={p.purchasePrice} min={0} /></Field>
          <Field label="Quantity" name="quantity"><NumberInput name="quantity" defaultValue={p.quantity} step="1" min={0} /></Field>
          <Field label="Sales tax on purchase (%)" name="purchaseTaxPct"><NumberInput name="purchaseTaxPct" defaultValue={p.purchaseTaxPct} placeholder="Settings default" /></Field>
          <Field label="Supplier lead time (days)" name="leadTimeDays"><NumberInput name="leadTimeDays" defaultValue={p.leadTimeDays} step="1" /></Field>
        </div>
      </Card>

      <Card title="Amazon selling price">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Expected selling price ($)" name="salePrice"><NumberInput name="salePrice" defaultValue={p.salePrice} min={0} /></Field>
          <Field label="Where the price came from" name="salePriceSource"><TextInput name="salePriceSource" defaultValue={p.prov.salePrice?.source} placeholder="Amazon listing (checked by user)" /></Field>
          <Field label="Prices checked at" name="pricesCheckedAt" hint="Timestamp for the prices you enter.">
            <input id="pricesCheckedAt" name="pricesCheckedAt" type="datetime-local" className="input" defaultValue={localDateTimeValue()} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="recordPrice" defaultChecked /> Add to price history
          </label>
          <Field label="Historical low ($)" name="lowPrice" hint="For the low-price scenario."><NumberInput name="lowPrice" defaultValue={p.lowPrice} /></Field>
          <Field label="Historical high ($)" name="highPrice" hint="Only if the data supports it."><NumberInput name="highPrice" defaultValue={p.highPrice} /></Field>
        </div>
      </Card>

      <Card title="Package (for FBA fees)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Weight (lb)" name="weightLb"><NumberInput name="weightLb" defaultValue={p.weightLb} min={0} /></Field>
          <Field label="Length (in)" name="lengthIn"><NumberInput name="lengthIn" defaultValue={p.lengthIn} min={0} /></Field>
          <Field label="Width (in)" name="widthIn"><NumberInput name="widthIn" defaultValue={p.widthIn} min={0} /></Field>
          <Field label="Height (in)" name="heightIn"><NumberInput name="heightIn" defaultValue={p.heightIn} min={0} /></Field>
        </div>
      </Card>

      <Card title="Fees and costs (optional overrides)">
        <p className="mb-3 text-sm text-muted">
          Leave blank to estimate from the fee table or use your Settings defaults. If you have Amazon&apos;s exact fees (e.g. from the
          Revenue Calculator), enter them here.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Referral fee from Amazon ($)" name="referralFeeOverride"><NumberInput name="referralFeeOverride" defaultValue={p.referralFeeOverride} /></Field>
          <Field label="Fulfillment fee from Amazon ($)" name="fulfillmentFeeOverride"><NumberInput name="fulfillmentFeeOverride" defaultValue={p.fulfillmentFeeOverride} /></Field>
          <Field label="Fee source" name="feeSource"><TextInput name="feeSource" defaultValue={p.prov.referralFeeOverride?.source} placeholder="Amazon Revenue Calculator" /></Field>
          <Field label="FBM shipping cost ($)" name="fbmShippingCost"><NumberInput name="fbmShippingCost" defaultValue={p.fbmShippingCost} /></Field>
          <Field label="Inbound shipping per unit ($)" name="inboundPerUnit"><NumberInput name="inboundPerUnit" defaultValue={p.inboundPerUnit} placeholder="From weight" /></Field>
          <Field label="Prep per unit ($)" name="prepPerUnit"><NumberInput name="prepPerUnit" defaultValue={p.prepPerUnit} placeholder="Settings default" /></Field>
          <Field label="Packaging per unit ($)" name="packagingPerUnit"><NumberInput name="packagingPerUnit" defaultValue={p.packagingPerUnit} placeholder="Settings default" /></Field>
          <Field label="Other cost per unit ($)" name="otherPerUnit"><NumberInput name="otherPerUnit" defaultValue={p.otherPerUnit} placeholder="0" /></Field>
          <Field label="Advertising per unit ($)" name="advertisingPerUnit"><NumberInput name="advertisingPerUnit" defaultValue={p.advertisingPerUnit} placeholder="Settings default" /></Field>
          <Field label="Returns allowance (%)" name="returnsPct"><NumberInput name="returnsPct" defaultValue={p.returnsPct} placeholder="Settings default" /></Field>
        </div>
      </Card>

      <Card title="Competition and sales indicators">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Where this data came from" name="marketDataKind">
            <select id="marketDataKind" name="marketDataKind" className="input" defaultValue={marketKind === "VERIFIED" ? "VERIFIED" : marketKind === "THIRD_PARTY" ? "THIRD_PARTY" : "USER_PROVIDED"}>
              <option value="USER_PROVIDED">I checked it myself</option>
              <option value="THIRD_PARTY">Third-party tool / estimate</option>
              <option value="VERIFIED">Verified from Amazon data</option>
            </select>
          </Field>
          <Field label="Source name" name="marketDataSource"><TextInput name="marketDataSource" defaultValue={marketSource} placeholder="e.g. listing page, Keepa chart" /></Field>
          <Field label="Seller count (offers)" name="sellerCount"><NumberInput name="sellerCount" defaultValue={p.sellerCount} step="1" min={0} /></Field>
          <Field label="FBA sellers" name="fbaSellerCount"><NumberInput name="fbaSellerCount" defaultValue={p.fbaSellerCount} step="1" min={0} /></Field>
          <Field label="Amazon sells on this listing?" name="amazonOnListing"><TriSelect name="amazonOnListing" value={p.amazonOnListing} /></Field>
          <Field label="Sales rank" name="salesRank" hint="An indicator, not a unit count."><NumberInput name="salesRank" defaultValue={p.salesRank} step="1" /></Field>
          <Field label="Listing monthly sales (low)" name="listingMonthlySalesLow" hint="All sellers combined."><NumberInput name="listingMonthlySalesLow" defaultValue={p.listingMonthlySalesLow} /></Field>
          <Field label="Listing monthly sales (high)" name="listingMonthlySalesHigh"><NumberInput name="listingMonthlySalesHigh" defaultValue={p.listingMonthlySalesHigh} /></Field>
          <Field label="Your share of sales (%)" name="shareAssumptionPct" hint="Blank = even split (an assumption)."><NumberInput name="shareAssumptionPct" defaultValue={p.shareAssumptionPct} /></Field>
        </div>
      </Card>

      <Card title="Restrictions and risk">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Restricted for your account?" name="restricted"><TriSelect name="restricted" value={p.restricted} /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="restrictionChecked" defaultChecked={p.restrictionChecked} /> I checked this in Seller Central
          </label>
          <Field label="Brand gated?" name="brandGated"><TriSelect name="brandGated" value={p.brandGated} /></Field>
          <Field label="Authorized / reputable source?" name="sourceAuthorized"><TriSelect name="sourceAuthorized" value={p.sourceAuthorized} /></Field>
          <Field label="Often counterfeited?" name="counterfeitProne"><TriSelect name="counterfeitProne" value={p.counterfeitProne} /></Field>
          <Field label="Has an expiration date?" name="expiring"><TriSelect name="expiring" value={p.expiring} /></Field>
          <Field label="Months to expiration" name="monthsToExpiration"><NumberInput name="monthsToExpiration" defaultValue={p.monthsToExpiration} /></Field>
          <Field label="Fragile?" name="fragile"><TriSelect name="fragile" value={p.fragile} /></Field>
          <Field label="Hazmat / dangerous goods?" name="hazmat"><TriSelect name="hazmat" value={p.hazmat} /></Field>
          <Field label="Meltable?" name="meltable"><TriSelect name="meltable" value={p.meltable} /></Field>
          <Field label="Seasonal?" name="seasonal"><TriSelect name="seasonal" value={p.seasonal} /></Field>
          <Field label="Return rate (%)" name="returnRatePct"><NumberInput name="returnRatePct" defaultValue={p.returnRatePct} /></Field>
          <Field label="Identity matched to listing?" name="identityVerdict" hint="Use Product Matching to check.">
            <select id="identityVerdict" name="identityVerdict" className="input" defaultValue={p.identityVerdict ?? ""}>
              <option value="">Not checked</option>
              <option value="MATCH">Match</option>
              <option value="POSSIBLE MATCH">Possible match</option>
              <option value="DO NOT MATCH">Do not match</option>
            </select>
          </Field>
        </div>
        <Field label="Notes" name="notes" className="mt-4">
          <textarea id="notes" name="notes" defaultValue={p.notes} rows={3} className="input" />
        </Field>
      </Card>

      <div className="flex justify-end gap-2">
        <button type="submit" className="btn">{submitLabel}</button>
      </div>
    </form>
  );
}
