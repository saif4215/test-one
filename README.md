# Amazon Reselling AI

A research and record-keeping assistant for a legitimate Amazon reselling business: retail arbitrage, online arbitrage, and wholesale. It **discovers, verifies, calculates, compares, tracks, and monitors** opportunities, and shows the evidence behind every number. The final purchasing decision is always yours.

> Estimates only. Nothing here guarantees sales, profit, or Buy Box share. Amazon fees, restrictions, and policies change; check them in Seller Central before buying.

## What it does

| Area | Pages |
| --- | --- |
| Research | Analyze Product (ASIN, UPC, URL, or name), Find Products, Find Deals (filters with pass/fail reasons), Scan Spreadsheet (CSV/XLSX/Google Sheet in, analyzed file out), Calculate Profit, Product Matching |
| Listing tools | Listing Research, Listing Writer (original copy, flags unsupported claims), Keyword Research, Review Analysis (all from text you provide) |
| Operations | Inventory, Purchase Orders (receive into inventory), Suppliers (tradeoff comparison), Cash Flow & Expenses (plus a tax-prep CSV) |
| Intelligence | Dashboard, Sales Intelligence, Price Monitor, Deal Alerts (Daily Deal Finder), Research Log |
| Business | Capital Planner, Workflows (daily/weekly/monthly checklists), Business Plan generator, Glossary, Settings (including beginner/advanced explanations) |

Every analysis includes: profit, ROI, margin, break-even price, maximum buy price, minimum profitable price, FBA vs FBM, low/expected/high scenarios, a sensitivity table, sales-velocity ranges, competition, price history, a risk table, a data-confidence level, missing information, a verification checklist, a suggested test quantity, and scaling considerations.

### Honest data rules

- Every value is labeled **Verified**, **User-provided**, **Third-party**, **Estimate**, **Assumption**, or **Unknown**, with its source and timestamp. Old data is flagged "Data may be stale."
- Nothing is made up. Missing data shows as *Data unavailable — verify before purchasing*; missing sales data shows as *Insufficient data to estimate sales reliably*.
- Sales rank is treated as an indicator, not a unit count. Sales estimates are always ranges.
- No web scraping, and no getting around logins, CAPTCHAs, rate limits, or paywalls. Retailer URLs are saved as sources, never fetched.

### How the math works

- **Profit per unit** = selling price − (purchase price + sales tax + inbound shipping + prep + packaging + other) − (referral fee + closing fee + fulfillment fee + storage + returns allowance + advertising)
- **ROI** = profit ÷ upfront investment × 100. Upfront investment is what you pay before the sale: purchase price, shipping, prep, and so on. Amazon fees come out of the payout, so they aren't part of it. This matches the spec's examples: $9 ÷ $13 = 69.23%, and $120 ÷ $300 = 40%.
- **Margin** = profit ÷ selling price × 100
- **Reorder point** = average daily sales × supplier lead time + safety stock

**Amazon fees** come from a built-in **reference table** (`src/data/feeTables.us.ts`, dated 2025-01-15) and are always labeled *Estimate*. Check them against Seller Central. You can override referral rates and storage rates in Settings, or enter Amazon's exact fees for a product (for example, from the Revenue Calculator). Fees you enter, and fees from the SP-API, always take priority over the table.

## Maruf Cafe purchase agreements (e-signature)

A separate module under `/agreements` for preparing, reviewing, e-signing, and tracking a **Business Purchase and Sale Agreement** for Maruf Cafe: multi-step builder, generated contract and schedules, PDF, secure signing links with email verification, DocuSign integration, Resend email, audit trail, admin area, and per-agreement permissions. It has its own accounts (`npm run agreements:admin -- you@example.com "Your Name"`). The DocuSign and Resend integrations are written but **not yet tested against live accounts**; follow the sandbox checklist first. See **[docs/AGREEMENTS.md](docs/AGREEMENTS.md)** for setup, provider configuration, testing, deployment, backup, and security notes. It is a template generator, not legal advice.

## Getting started

Requires Node.js 22+.

```bash
npm install
npm run dev            # http://localhost:3000
```

Open **Settings** first to answer the setup questions (budget, fulfillment, sourcing, targets, categories). Data is stored in SQLite at `./data/reseller.db`; set `DATABASE_PATH` to use a different file.

Want to explore with example data first?

```bash
DATABASE_PATH=./data/demo.db npm run seed:demo
DATABASE_PATH=./data/demo.db npm run dev
```

The demo data is **fictional**: every record is named "SAMPLE". A sample buy list for the scanner is in `samples/products.csv`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run build` / `npm start` | Develop, build, and run the app |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run deal-finder` | Runs the Daily Deal Finder once (creates timestamped alerts) |
| `npm run deal-finder -- --schedule "0 8 * * *"` | Keeps running and fires on a cron schedule |
| `npm run seed:demo` | Loads fictional demo data into an empty database |
| `docker build -t amazon-reselling-ai .` | Production image (see Deploy) |
| `node e2e/smoke.mjs` | Browser smoke test against a running server (see the file header) |

To run the Deal Finder daily without keeping a process open, add a system cron job, e.g. `0 8 * * * cd /path/to/app && npm run deal-finder`.

## Deploy (put it online)

The app is a Node.js server with a SQLite database file. It needs a host with a **persistent disk**; otherwise your data is lost on every deploy. That rules out Vercel and other serverless hosts.

**Always set `APP_PASSWORD`** for an online deployment. Without it, anyone with the URL can see and change your business data. When it's set, every page asks for the password (Sign out is in the sidebar). `robots.txt` also asks search engines not to index the site.

### Render (easiest)

1. Push this repo to GitHub (it's already there).
2. In [Render](https://render.com), choose **New → Blueprint** and select the repo. Render reads `render.yaml`.
3. Enter an `APP_PASSWORD` when asked. `CRON_SECRET` is generated for you.
4. Deploy. Render builds the `Dockerfile` and mounts a 1 GB disk at `/data` for the database.

Persistent disks need a paid Render instance (Starter). Check Render's current pricing.

### Any server with Docker (VPS, Railway, Fly.io, …)

```bash
docker build -t amazon-reselling-ai .
docker run -d -p 3000:3000 -v reseller-data:/data \
  -e APP_PASSWORD='choose-a-long-password' -e CRON_SECRET='another-random-string' \
  --name reseller amazon-reselling-ai
```

If Docker Hub rate-limits the base image, build with `--build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim`.

Put it behind HTTPS (e.g. Caddy, or your host's TLS). Back up the `reseller-data` volume (it contains `reseller.db`) regularly.

### Running the Deal Finder on a schedule when hosted

Set `CRON_SECRET`, then have any scheduler (a Render Cron Job, cron-job.org, GitHub Actions) call:

```bash
curl -X POST https://your-app.example.com/api/deal-finder -H "Authorization: Bearer $CRON_SECRET"
```

## Optional data connections

All of these are **off until you add credentials** to `.env.local` (see `.env.example`). Settings → Data sources shows what's active.

### Amazon SP-API (free with a seller account)

This adds catalog details, package dimensions and weight, sales rank, offer counts, the Buy Box price, official fee estimates, and whether a listing is restricted for your account. All of it is labeled *Verified* with a timestamp.

1. In Seller Central, register as a developer and create a private SP-API application.
2. Authorize it for your own account to get a refresh token.
3. Set `SPAPI_CLIENT_ID`, `SPAPI_CLIENT_SECRET`, `SPAPI_REFRESH_TOKEN`, and `SPAPI_SELLER_ID`.

> The adapter follows Amazon's documented endpoints (Catalog Items 2022-04-01, Product Pricing v0 offers, Product Fees v0, Listings Restrictions 2021-08-01), and its response parsing is unit-tested. It has **not** been tested against the live API, because no credentials were available during development. If something doesn't work, the error appears on the Analyze page.

### Google Sheets sync (free)

This syncs products (with analysis columns), inventory, purchase orders, cash flow, and suppliers to a Google Sheet, and imports buy lists from a Sheet.

1. In Google Cloud, create a project, enable the **Google Sheets API**, and create a **service account** with a JSON key.
2. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (the key's `private_key`, with `\n` escapes), and `GOOGLE_SHEET_ID` (the sheet URL or ID).
3. Share the spreadsheet with the service-account email as an **Editor**.
4. Use **Sync to Google Sheets** in Settings or on the Dashboard. The sync replaces the contents of those five tabs.

### Google price lookup (Custom Search JSON API)

For a UPC or product name, this lists possible retailer listings with their listed prices as *Third-party* candidates. It **never** fills in your purchase price, because a search result isn't a verified product match. Set `GOOGLE_CSE_KEY` and `GOOGLE_CSE_ID` to enable it. Google has restricted this API for new customers and announced a retirement date, so check that it's available for your account.

> The Google integrations are unit-tested with mocked responses; they haven't been run against live Google accounts.

### Not included (by design)

Keepa and other paid data tools aren't built in. You can type their numbers into a product, or import their CSV exports; mark that data as *Third-party* when you do.

## Project layout

```
src/lib/calc/        pure calculation engine (profit, fees, velocity, risk, matching, filters, …), unit-tested
src/lib/analysis/    analyzeProduct(): the full deal report pipeline
src/lib/providers/   data sources: saved research, SP-API, Google price lookup
src/lib/google/      Google service-account auth and Sheets client
src/lib/import/      CSV/XLSX parsing, column mapping, analyzed export
src/lib/alerts/      Daily Deal Finder
src/lib/reports/     deal report, tax-prep summary, business plan
src/lib/db/          SQLite schema and migrations (Drizzle ORM)
src/app/             pages and server actions (Next.js App Router)
```

## Compliance

This app doesn't recommend counterfeit or stolen goods, fake invoices, fake reviews, review manipulation, fraudulent returns, or deceptive listings. It never tells you that you're approved (ungated) for a product unless you've verified it. The tax-prep export only organizes your records: it isn't tax advice, so consult a qualified tax professional.
