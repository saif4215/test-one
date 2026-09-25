/**
 * Daily Deal Finder (§64).
 *
 *   npm run deal-finder                     run once
 *   npm run deal-finder -- --schedule       run every day at 08:00 (server local time)
 *   npm run deal-finder -- --schedule "0 7 * * 1-5"   custom cron expression
 *
 * Uses DATABASE_PATH (default ./data/reseller.db), the same database as the web app.
 */
import cron from "node-cron";
import { runDealFinder } from "@/lib/alerts/dealFinder";
import { getDb } from "@/lib/db/client";

function runOnce() {
  const r = runDealFinder(getDb());
  console.log(`[${r.ranAt}] ${r.messages.join(" ")}`);
}

const idx = process.argv.indexOf("--schedule");
if (idx === -1) {
  runOnce();
} else {
  const expr = process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--") ? process.argv[idx + 1] : "0 8 * * *";
  if (!cron.validate(expr)) {
    console.error(`Invalid cron expression: ${expr}`);
    process.exit(1);
  }
  console.log(`Deal Finder scheduled: "${expr}". Press Ctrl+C to stop.`);
  cron.schedule(expr, runOnce);
}
