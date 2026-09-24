import { connection } from "next/server";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/repo/products";
import { Calculator } from "./Calculator";

export default async function CalculatorPage() {
  await connection();
  const s = getSettings(getDb());
  return (
    <>
      <PageHeader
        title="Calculate Profit"
        subtitle="A quick what-if calculator. For a full analysis with risk, competition, and data sources, use Analyze Product."
      />
      <Calculator targetProfit={s.targetMinProfit} targetRoi={s.targetRoiPct} />
    </>
  );
}
