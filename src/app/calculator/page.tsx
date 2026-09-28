import { connection } from "next/server";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/repo/products";
import { Calculator } from "./Calculator";
import { BeginnerHelp } from "@/components/BeginnerHelp";

export default async function CalculatorPage() {
  await connection();
  const s = getSettings(getDb());
  return (
    <>
      <PageHeader
        title="Calculate Profit"
        subtitle="A quick what-if calculator. For a full analysis with risk, competition, and data sources, use Analyze Product."
      />
      <BeginnerHelp>
        Enter what you&apos;ll pay and what it sells for. <strong>Amazon fees</strong> are the referral fee (a % of the price) plus fulfillment; you can see the
        exact amount in Amazon&apos;s Revenue Calculator. <strong>Maximum buy price</strong> is the most you should pay to still hit your targets.
      </BeginnerHelp>
      <Calculator targetProfit={s.targetMinProfit} targetRoi={s.targetRoiPct} />
    </>
  );
}
