/**
 * Browser test for the purchase-agreement module (layout, access control, honest states).
 * It needs a running server and an administrator account:
 *
 *   export DATABASE_PATH=/tmp/agreements-e2e.db UPLOAD_DIR=/tmp/agreements-e2e-files APP_SECRET=any-16+-char-test-secret
 *   ADMIN_PASSWORD='test-password-1234' npm run agreements:admin -- admin@example.test "E2E Admin"
 *   npm run agreements:demo                      # one fictional sample agreement
 *   npm run build && npx next start -p 3100 &
 *   BASE_URL=http://localhost:3100 ADMIN_EMAIL=admin@example.test ADMIN_PASSWORD='test-password-1234' node e2e/agreements.mjs
 *
 * Optional: CHROMIUM_PATH. It does not call any e-signature or email service.
 */
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const email = process.env.ADMIN_EMAIL ?? "admin@example.test";
const password = process.env.ADMIN_PASSWORD ?? "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures.push(msg);
};
const errors = [];

async function signIn(context) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/agreements/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button:has-text('Sign in')");
  await page.waitForURL(`${base}/agreements`, { waitUntil: "commit" });
  return page;
}

// --- desktop ---
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const anon = await desk.newPage();
await anon.goto(`${base}/agreements`);
check(anon.url().includes("/agreements/login"), "dashboard requires sign-in");
const page = await signIn(desk);
check(await page.isVisible("text=not a substitute for legal advice"), "legal notice is shown on the dashboard");
const id = (await page.locator("a.font-mono").first().textContent())?.trim();
check(!!id, "dashboard lists an agreement");

const unauth = await (await browser.newContext()).request.get(`${base}/agreements/${id}/pdf?kind=draft`);
check(unauth.status() === 401, "PDF download without a session is refused");
const unauthFile = await (await browser.newContext()).request.get(`${base}/agreements/${id}/attachments/anything`);
check(unauthFile.status() === 401, "attachment download without a session is refused");
const draft = await desk.request.get(`${base}/agreements/${id}/pdf?kind=draft`);
check(draft.status() === 200 && draft.headers()["content-type"] === "application/pdf", "signed-in user can download the (draft) PDF");
check((await desk.request.get(`${base}/agreements/${id}/pdf?kind=signed`)).status() === 404, "no signed PDF exists before completion");
const hdr = (await page.request.get(`${base}/agreements/${id}`)).headers();
check(hdr["referrer-policy"] === "no-referrer" && /no-store/.test(hdr["cache-control"] ?? ""), "private pages send no-referrer and no-store");

const bogus = await page.goto(`${base}/sign/${"x".repeat(43)}`);
check(bogus?.status() === 200 && (await page.isVisible("text=This link can't be used")), "an invalid signing link reveals nothing");
const wh = await desk.request.post(`${base}/api/webhooks/signature`, { data: "{}", headers: { "content-type": "application/json" } });
check([401, 429].includes(wh.status()), "signature webhook without a valid signature is rejected");

// --- phone ---
const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true });
const mp = await signIn(phone);
for (const [name, p] of [["dashboard", ""], ["details", `/${id}`], ["preview", `/${id}/preview`], ["step 1", `/${id}/edit/buyer`], ["step 4", `/${id}/edit/assets`], ["step 5", `/${id}/edit/price`], ["step 6", `/${id}/edit/terms`], ["step 7", `/${id}/edit/documents`], ["step 9", `/${id}/edit/submit`], ["clauses", `/${id}/edit/clauses`], ["send", `/${id}/send`], ["completed", "/completed"], ["admin", "/admin"], ["users", "/admin/users"], ["templates", "/admin/templates"], ["integrations", "/admin/integrations"], ["account", "/account"]]) {
  const res = await mp.goto(`${base}/agreements${p}`);
  // isMobile widens the layout viewport when content overflows, so compare with the real device width.
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - 390);
  check(res?.status() === 200 && overflow <= 1, `phone layout: ${name} (status ${res?.status()}, overflow ${overflow}px)`);
}
for (const [name, p] of [["dashboard", ""], ["preview", `/${id}/preview`], ["step 6", `/${id}/edit/terms`], ["admin/integrations", "/admin/integrations"]]) {
  const res = await page.goto(`${base}/agreements${p}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(res?.status() === 200 && overflow <= 1, `desktop layout: ${name} (overflow ${overflow}px)`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nAll agreement checks passed");
process.exit(failures.length ? 1 : 0);
