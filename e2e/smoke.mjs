/**
 * Browser smoke test. Start the app against a throwaway database first:
 *
 *   DATABASE_PATH=/tmp/smoke.db npm run build && DATABASE_PATH=/tmp/smoke.db npx next start -p 3100
 *   BASE_URL=http://localhost:3100 node e2e/smoke.mjs
 *
 * Optional: CHROMIUM_PATH to use a specific Chromium binary.
 * It runs the main flows, visits every page at desktop and phone widths, and
 * fails on any non-200 status, page error, or horizontal overflow.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures.push(msg);
};

// 1. Settings (onboarding)
await page.goto(`${base}/settings`);
await page.fill("#startingBudget", "1000");
await page.click("text=Save settings");
await page.waitForURL(/saved=1/);
check(await page.isVisible("text=Settings saved."), "settings save");

// 2. Analyze a product (fictional values)
await page.goto(`${base}/analyze`);
for (const [id, v] of Object.entries({ name: "SMOKE Test Spatula", brand: "SmokeBrand", asin: "B0SMOKE001", purchasePrice: "8", quantity: "10", salePrice: "24.99", weightLb: "0.6", lengthIn: "12", widthIn: "4", heightIn: "2", sellerCount: "4", listingMonthlySalesLow: "60", listingMonthlySalesHigh: "120" }))
  await page.fill(`#${id}`, v);
await page.selectOption("#category", "Home & Kitchen");
await page.click("text=Analyze deal");
await page.waitForURL(/\/products\/\d+$/);
const productUrl = page.url();
check(await page.isVisible("text=13. Missing information"), "analysis report renders");
check((await page.locator("text=Est. profit / unit").locator("..").innerText()).includes("$"), "profit is shown");

// 3. Scan the sample CSV and check the export keeps the original columns
await page.goto(`${base}/scan`);
await page.setInputFiles("#file", path.join(process.cwd(), "samples", "products.csv"));
await page.click("button:has-text('Scan')");
await page.waitForURL(/\/scan\/imp-/);
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Download .csv")]);
const exported = fs.readFileSync(await dl.path(), "utf8").replace(/^﻿/, "").split(/\r?\n/)[0];
const original = fs.readFileSync(path.join(process.cwd(), "samples", "products.csv"), "utf8").split(/\r?\n/)[0];
check(exported.startsWith(original), "analyzed export keeps original columns");
check(exported.includes("Est. Profit (est.)"), "analyzed export adds estimate columns");
await page.click("text=Add rows to Find Products");
await page.waitForURL(/products\?batch=/);

// 4. Deal Finder → alerts carry data source and timestamp
await page.goto(`${base}/alerts`);
await page.click("text=Run Deal Finder now");
await page.waitForLoadState("networkidle");

// 5. Every page, desktop and phone
const routes = ["/", "/products", "/analyze", "/scan", "/calculator", "/deals", "/match", "/inventory", "/purchase-orders", "/purchase-orders/new", "/suppliers", "/cash-flow", "/sales-intelligence", "/price-monitor", "/alerts", "/dashboard", "/research-log", "/workflows", "/business-plan", "/glossary", "/settings", "/capital", "/listing-research", "/listing-writer", "/keywords", "/reviews", "/login", new URL(productUrl).pathname, `${new URL(productUrl).pathname}/report`];
for (const width of [1280, 390]) {
  await page.setViewportSize({ width, height: 900 });
  for (const r of routes) {
    const res = await page.goto(`${base}${r}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(res?.status() === 200 && overflow <= 1, `${r} @${width}px (status ${res?.status()}, overflow ${overflow}px)`);
  }
}
for (const r of ["/cash-flow/tax-export", "/business-plan/plan.md", `${new URL(productUrl).pathname}/report.md`]) {
  const res = await page.request.get(`${base}${r}`);
  check(res.status() === 200, `download ${r}`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures.length ? 1 : 0);
