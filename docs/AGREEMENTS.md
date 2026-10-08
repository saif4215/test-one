# Maruf Cafe purchase agreements and e-signature

A module inside this app for preparing, reviewing, sending for e-signature, signing, storing, and auditing a **Business Purchase and Sale Agreement** for Maruf Cafe (Staten Island, New York).

> **Not legal advice.** This application generates a customizable business purchase agreement template and is not a substitute for legal advice. The parties should consult a qualified New York attorney before signing. The appropriate terms depend on the transaction structure, ownership, assets, commercial lease, taxes, liabilities, licenses, and other circumstances.

Contents: [What is verified and what is not](#1-what-is-verified-and-what-is-not) · [Architecture decisions](#2-architecture-decisions) · [Setup](#3-setup) · [DocuSign](#4-docusign-e-signature) · [Resend](#5-resend-email) · [How signing works](#6-how-signing-works) · [Sandbox test checklist](#7-sandbox-test-checklist-do-this-before-a-real-agreement) · [Testing](#8-testing) · [Deployment, backup, recovery](#9-deployment-backup-and-recovery) · [Security notes](#10-security-considerations) · [Legal safeguards](#11-legal-safeguards) · [Requirement coverage](#12-requirement-coverage-and-known-limits)

---

## 1. What is verified and what is not

| Part | Status |
| --- | --- |
| Agreement builder, contract text, schedules, readiness checks, PDF generation, versioning, audit chain, accounts, permissions, secure links, one-time codes, consent capture, status logic, webhook handling, email logging | **Built and covered by automated tests** (`npm test`, `node e2e/agreements.mjs`). |
| DocuSign adapter (`src/lib/agreements/providers/docusign.ts`) | **Written but never run against a real DocuSign account.** Unit tests only check the requests it builds and how it reads responses, using mocked HTTP. The workflow tests use a **test-only** fake provider that lives in `test-helpers.ts` and is never loaded by the app. |
| Resend adapter (`email/mailer.ts`) | **Never run against a real Resend account.** Same situation. |
| Real end-to-end signing | **Not tested.** The development sandbox that built this could not reach DocuSign's or Resend's documentation or APIs, so the API calls come from the vendors' documented shapes as I know them. Run the [sandbox checklist](#7-sandbox-test-checklist-do-this-before-a-real-agreement) and fix any difference before sending a real agreement. |

Until credentials are present the app says so, and "Send for signature" is disabled. Nothing pretends to be signed, sent, or delivered: statuses come only from what DocuSign and Resend report.

Please verify current facts on the vendors' own sites (account tiers, prices, API availability on your plan, Connect/webhook options, rate limits). They change, and I could not check them from here.

---

## 2. Architecture decisions

I inspected the project first. It is a **Next.js 16 (App Router) app with SQLite (better-sqlite3 + Drizzle)**, one shared `APP_PASSWORD`, Docker/Render deployment, Vitest and Playwright. It had no user accounts, PDF generation, email, or e-signature code. So:

- **Reused:** Next.js, SQLite/Drizzle and its migration list, Tailwind styling and UI components, Vitest/Playwright, Docker/Render config, the `CRON_SECRET` pattern.
- **Kept separate:** the agreements module lives under `/agreements`, `/sign`, `/api/webhooks/*`, `/api/agreements/*`, and `src/lib/agreements/`. The reselling app's pages are unchanged (it only gained a nav link and the shell now hides its sidebar on agreement pages).
- **Its own accounts** (`users`, server-side `user_sessions`). The reselling app's single shared password can't express "this buyer may see only their deal", so the module has real users with roles (administrator, attorney, buyer, seller) and per-agreement access. The proxy lets these paths bypass the shared `APP_PASSWORD`, because they authenticate themselves (accounts, signed links, webhook signatures, cron secret).
- **E-signature provider: DocuSign**, through a provider interface (`providers/types.ts`) so another provider can be added. DocuSign was chosen because it is widely used and its *embedded signing* lets this app send the invitation (with its own link, expiry, revocation, and one-time-code check) and then hand the signer to DocuSign only for the signature itself.
- **Email provider: Resend** (simple REST API, verified sender domains, idempotency keys, signed delivery webhooks), behind a `Mailer` interface.
- **PDF: `pdf-lib`** (pure JavaScript, no browser needed on the server, can merge uploaded PDFs/images as exhibits). Layout is hand-written; it uses the built-in PDF fonts, so text is limited to Western-European characters (other characters print as `?` rather than being silently dropped).
- **Agreement text comes from structured data**, rendered into one neutral document model that feeds both the on-screen preview and the PDF, so they cannot disagree.
- **Versions are immutable once signatures are requested.** Any change creates a new version, withdraws the old request, and everyone signs again.
- **Master template is versioned.** Each agreement version snapshots the clause text it was created with, so editing the template never changes an existing or signed agreement.
- **Single server instance assumed** (SQLite + in-memory rate limiter), like the rest of this app.

---

## 3. Setup

1. `npm install`
2. Copy the new section of `.env.example` into `.env.local` and fill in what you have. Minimum for local exploration: nothing. For anything real: `APP_URL`, `APP_SECRET`, `FILE_ENCRYPTION_KEY`, plus DocuSign and Resend settings below.
3. Create the first administrator:
   ```bash
   npm run agreements:admin -- you@example.com "Your Name"   # asks for a password (12+ characters)
   ```
   On hosts where you can't run scripts (the Docker image), set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`; the first sign-in attempt creates that administrator when no users exist. Remove both variables afterwards.
4. `npm run dev`, then open `/agreements/login`.
5. Optional: `npm run agreements:demo` loads one **fictional** sample agreement (every value says SAMPLE).
6. In **Admin → Users**, invite the buyer, seller, and attorney. Then open an agreement and use **People with access** to give each person access. People only see agreements they were given.

### Environment variables

| Variable | Needed for | Notes |
| --- | --- | --- |
| `APP_URL` | links in emails | Required in production, e.g. `https://deals.example.com`. Never taken from request headers. |
| `APP_SECRET` | one-time codes, signer sessions | 16+ characters. Required in production. |
| `FILE_ENCRYPTION_KEY` | encrypting stored files | 32 random bytes, base64 (`openssl rand -base64 32`). Uploads are refused in production without it (unless `ALLOW_UNENCRYPTED_STORAGE=true`). **Back it up.** |
| `UPLOAD_DIR` | file location | Default: `files/` next to the database. Keep on the persistent disk. |
| `DOCUSIGN_ENV`, `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_PRIVATE_KEY`, `DOCUSIGN_CONNECT_HMAC_SECRET`, `DOCUSIGN_BASE_URI` (optional) | e-signature | See below. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` | email and delivery confirmation | See below. |
| `CRON_SECRET` | `POST /api/agreements/maintenance` | Same secret the Deal Finder endpoint uses. |

Secrets are read only on the server and are never sent to the browser or stored in the database. The Admin → Integrations page shows only "present/missing".

---

## 4. DocuSign (e-signature)

**Account and cost (verify on docusign.com):** DocuSign offers a free **developer sandbox** (`demo` environment) for building and testing. Sending real, legally binding agreements through the API needs a **paid DocuSign plan that includes API access**, and DocuSign requires an integration to pass its **Go-Live review** (demonstrating successful API calls in the sandbox) before it can be promoted to production. Check the current plans and pricing yourself; I have not quoted numbers because they change.

**Configure it:**

1. Create a DocuSign developer account and sign in to the Admin console (demo).
2. **Apps and Keys** → *Add App and Integration Key*. Copy the **Integration Key** → `DOCUSIGN_INTEGRATION_KEY`. Copy **API Account ID** → `DOCUSIGN_ACCOUNT_ID`. Copy the **API Username / User ID** (a GUID) → `DOCUSIGN_USER_ID`.
3. Under the app's *Authentication* settings, use the **Service Integration / JWT Grant** method (this app does not use the Authorization Code flow). Click *Generate RSA* and save the **private key** → `DOCUSIGN_PRIVATE_KEY` (in an env var, replace line breaks with `\n`; DocuSign shows the private key only once). Add a redirect URI (any valid one, for example `https://www.docusign.com`); DocuSign requires one for the consent step below.
4. Grant the user's one-time **consent** for the integration. Open this URL once in a browser while signed in as that user (replace the placeholders), then approve:
   `https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=INTEGRATION_KEY&redirect_uri=REDIRECT_URI`
   Until this is done the app reports "The API user has not granted consent".
5. **Connect (webhooks):** Settings → Connect → *Add Configuration* → *Custom*. URL: `https://YOUR-SITE/api/webhooks/signature`. Data format **JSON** (SIM). Turn on **Include HMAC Signature**, generate a key, and set it as `DOCUSIGN_CONNECT_HMAC_SECRET`. Subscribe at least to envelope events *Sent, Delivered, Completed, Declined, Voided* and recipient events *Sent, Delivered, Completed, Declined*. The webhook is only a **prompt**: the app re-reads the envelope from DocuSign's API before it believes anything.
6. For production later: set `DOCUSIGN_ENV=production`, use the production integration key/user/account, and complete Go-Live.

**How the adapter talks to DocuSign** (all to check in the sandbox): JWT token from `account-d.docusign.com` (`account.docusign.com` in production); `POST …/envelopes` with the PDF, two *embedded* signers (a `clientUserId` each, so DocuSign sends no email), a *Sign Here* and *Date Signed* tab at the coordinates computed when the PDF was built; `POST …/envelopes/{id}/views/recipient` to get a one-time signing URL; `GET …/envelopes/{id}?include=recipients` to read status; `PUT …/envelopes/{id}` to void; `GET …/documents/combined` and `…/documents/certificate` for the signed PDF and certificate.

What DocuSign's signing page offers (typed, drawn, or uploaded signature styles) depends on your DocuSign account settings; the app does not draw its own signature control, because a typed name alone is not treated as proof of signing.

---

## 5. Resend (email)

1. Create a Resend account, **add and verify your sending domain** (DNS records), and create an API key → `RESEND_API_KEY`. Resend has a free tier at the time of writing; check current limits.
2. `EMAIL_FROM` must be on the verified domain, e.g. `Maruf Cafe Deals <deals@your-domain.com>`.
3. **Delivery webhook:** in Resend add a webhook to `https://YOUR-SITE/api/webhooks/email` for `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`; copy the signing secret (`whsec_…`) → `RESEND_WEBHOOK_SECRET`.

The app records an email as **"accepted by email service"** when Resend takes it. It becomes **"delivery confirmed"** only when Resend's webhook says so. Failures (API errors, network errors) are logged, shown in the agreement's Emails table, and can be re-sent. Identical notifications are sent once (de-duplicated by key, plus Resend's idempotency key).

---

## 6. How signing works

1. **Build** (Steps 1–7): buyer, seller, business, assets, price and payments, lease/liabilities/conditions, attachments. Save drafts any time.
2. **Preview** (Step 8), **confirm and submit** (Step 9). Submitting needs every required item, the two human **checkpoints** (seller's authority verified, ownership verified), and no unfinished `[TO BE COMPLETED]` placeholders. Attorney review is recorded if you have one but is **optional** and never blocks sending.
3. **Send** (`/agreements/{id}/send`): choose order (buyer first, seller first, or both) and link expiry. The app builds the final PDF (agreement + schedules + attachment index + PDF/image exhibits), hashes it, creates the DocuSign envelope, then locks the version. If DocuSign rejects it, nothing is locked and nothing is emailed.
4. **Invitation:** each signer gets an email with a private link (256-bit random token; only its hash is stored). In sequential order the second signer is invited only after the first signature is confirmed.
5. **Signer opens the link:** must enter a **6-digit code emailed to the same address** (10-minute life, 5 guesses, rate-limited). Then sees the whole agreement, the e-signature disclosure, two required tick-boxes (reviewed everything; consent to electronic signing) and the **Review and Sign Agreement** button. The consent record (wording version and hash, document hash, time, IP, browser, verification method) is saved. They can also download the exact PDF or decline.
6. **Signing** happens on DocuSign's page (embedded). The app declares the signer was authenticated by email code.
7. **Confirmation:** after returning, and on every webhook, the app reads the envelope from DocuSign. A signer becomes "signed" only if DocuSign says that recipient completed. The agreement becomes **Fully Signed** only if DocuSign says the envelope is *completed*, every recipient *completed*, and the request belongs to the agreement's *current* version.
8. **Completion:** the signed PDF and certificate are downloaded, hashed, encrypted, and stored; every signer and the creator get an email with a download link (signers: a 30-day link that again needs the email code). Staff and people with access can download from the agreement page.

**Statuses:** Draft, Awaiting Review, Sent for Signature, Viewed (only when DocuSign reports it), Partially Signed, Fully Signed, Declined, Expired, Cancelled.

**Revisions:** a sent version cannot be edited. "Create revision" copies it to a new version, revokes every open link, voids the old envelope, notifies the signers, and requires everyone to sign the new version. A signature (or even a completed envelope) on an old version never counts for the new one.

**Cancel/expire/revoke:** cancelling or expiry kills our links immediately, then voids the envelope (if DocuSign is unreachable the void is retried by the maintenance job and flagged on screen). Staff can revoke or re-send an individual link (re-sending issues a new link and invalidates the old one).

**Maintenance job (recommended):** schedule `POST /api/agreements/maintenance` with `Authorization: Bearer $CRON_SECRET` (e.g. every 30–60 minutes). It expires overdue requests, retries failed voids and signed-document downloads, and reminds signers who haven't acted after the configured number of days.

**Audit trail:** every meaningful event with timestamp, actor, and provider reference. It is append-only (database triggers reject UPDATE/DELETE) and hash-chained per agreement, and the agreement page shows whether the chain still verifies. Events are only recorded for things that happened; for example "viewed" is recorded only when the provider reports it (the app separately records "signing page opened" as its own observation).

---

## 7. Sandbox test checklist (do this before a real agreement)

Use DocuSign `demo` and a Resend test domain with **your own** email addresses. Tick each box; fix any difference in `providers/docusign.ts` or `email/mailer.ts`.

- [ ] Admin → Integrations shows DocuSign and Resend "present". `APP_URL` set to a public https URL (use a tunnel such as ngrok for local webhook testing).
- [ ] Create the sample agreement (`npm run agreements:demo`), give a test buyer and seller (your two addresses) access, and **Send for signature**. The agreement shows **Sent for Signature** and an envelope id appears.
- [ ] In the DocuSign sandbox, the envelope contains a single PDF with a *Sign Here* and *Date Signed* field on the **signature page for each party, on the right lines** (compare with the PDF). If the positions are off, adjust `signX/signTop/dateX/dateTop` in `pdf.ts`.
- [ ] The buyer's invitation arrives; the code email arrives; wrong code is rejected; right code shows the agreement.
- [ ] "Review and Sign Agreement" opens the DocuSign signing page; signing there returns to `/sign/…/return` and the page then shows "Your signature is confirmed".
- [ ] A Connect delivery reaches `/api/webhooks/signature` (200) and the **Audit trail** shows `signer.signed`. Re-deliver the same event: no duplicate email.
- [ ] Sequential order: the seller's invitation is sent only after the buyer's signature is confirmed.
- [ ] After the seller signs: status **Fully Signed**, signed PDF and certificate download, both parties get the completion email, the signed PDF's signatures look right.
- [ ] Decline from the signing page and from DocuSign's page: status **Declined**.
- [ ] Let a request expire (set expiry to 1 day and run the maintenance job after, or shorten manually): status **Expired**.
- [ ] Create a revision while a request is open: old link dead, envelope voided, new version needs both signatures again.
- [ ] Break each credential on purpose: the UI shows a clear error; nothing claims success.
- [ ] Resend: invitation shows "accepted", then "delivery confirmed" after the webhook; a bounce shows "Bounced".
- [ ] Confirm the DocuSign **certificate of completion** shows your two signers' emails and timestamps.

---

## 8. Testing

```bash
npm test            # all unit + workflow tests (Vitest, in-memory SQLite, fake provider/mailer)
npm run typecheck && npm run lint
# Browser checks (layouts at desktop and phone widths, access control, honest states):
export DATABASE_PATH=/tmp/ag-e2e.db UPLOAD_DIR=/tmp/ag-e2e-files APP_SECRET=any-16+-character-secret
ADMIN_PASSWORD='test-password-1234' npm run agreements:admin -- admin@example.test "E2E Admin"
npm run agreements:demo && npm run build && npx next start -p 3100 &
BASE_URL=http://localhost:3100 ADMIN_PASSWORD='test-password-1234' node e2e/agreements.mjs
```

The 20 required scenarios and where they are covered: create (`workflow.test.ts` "creating and editing"), required fields, balance calculation, draft save/reopen, PDF generation, sending, buyer and seller signing, fully-signed detection, decline, expired link, revoked link, unauthorized access, signature reuse on a different version ("versions and revisions"), invalid/duplicate webhooks ("webhooks"), email failures ("email handling", `units.test.ts`), downloading the completed agreement, revised contract needs new signatures, no false completion ("never shows 'fully signed'…"). Mobile and desktop layouts: `e2e/agreements.mjs`. The signed-agreement download path is tested with the fake provider, not a real one.

---

## 9. Deployment, backup, and recovery

**Deploy** like the rest of this app (see the main README): a Node host with a **persistent disk** (Render blueprint and Dockerfile are updated). Put the SQLite file and `UPLOAD_DIR` on the disk (`/data/reseller.db`, `/data/files`). Serve only over HTTPS (set `APP_URL` to the https address; the app sends HSTS and marks cookies `Secure` behind HTTPS). In `render.yaml` the new variables are listed; fill the `sync: false` ones in the dashboard.

**What must be backed up (all of it, together):**
1. the SQLite database (use `sqlite3 reseller.db ".backup 'backup.db'"` for a consistent copy; don't just copy a live file),
2. the `UPLOAD_DIR` folder (encrypted files),
3. `FILE_ENCRYPTION_KEY` (store it in a password manager; **without it the files are unreadable**) and `APP_SECRET`.

**Plan:** nightly automated copy of 1+2 to storage off the server (encrypted at rest), keep at least 30 days plus the signed agreements indefinitely (your retention policy is a setting; the app never deletes signed agreements or the audit trail itself). **Test a restore** after setup and every few months: restore the DB and files to a scratch instance with the same key, open a signed agreement, download its PDF, and confirm the audit chain shows "verified". DocuSign also keeps its own copy of the envelope and certificate for the life of your account; download and archive them yourself too.

**Recovery from a lost disk:** provision a new disk, restore DB + files, set the same `FILE_ENCRYPTION_KEY`, deploy. Open requests continue working (links are looked up by token hash in the database).

---

## 10. Security considerations

Implemented: password hashing with scrypt (never plaintext, policy 12+ characters, lockout after 5 failures, generic error text); random 256-bit session and link tokens stored only as hashes; server-side sessions (12 h, 2 h idle, revoked on password change/disable); role- and per-agreement authorization checked in the server code for every action and download (unknown and forbidden agreements look identical); CSRF protection from Next's server-action origin check plus `SameSite=Lax`; rate limits on login, codes, signing, PDF generation, refresh, and webhooks; HMAC verification for DocuSign Connect and Svix-signed Resend webhooks (with timestamp window), replay/duplicate protection, and state re-read from the provider; upload allow-list, size cap, content-signature check, rejection of PDFs with scripts or embedded files, sanitized names, random storage keys, files kept outside `public/`, AES-256-GCM encryption at rest, downloads only through authenticated routes with `nosniff`; private pages sent with `no-store`, `no-referrer` (links contain tokens), frame blocking; secrets only in server environment variables; email addresses and IPs hidden from viewers who can't send; append-only, hash-chained audit trail; no raw card data handled anywhere.

Know the limits:
- Identity check for signers is **possession of the invited email inbox** (link + emailed code). That is reasonable for a commercial deal between known parties but is not government-ID or knowledge-based verification. For higher risk, add DocuSign ID Verification / access codes / SMS to the adapter.
- The SQLite database itself is not encrypted by the app; rely on disk/volume encryption from your host. Files are encrypted by the app.
- The rate limiter and session cache are in memory (single instance). Behind several instances, move them to a shared store.
- Client IPs come from `X-Forwarded-For`; only deploy behind a proxy you trust to set it.
- PDF text is limited to the built-in fonts' character set.
- Anyone who can read your inbox can sign as you; tell signers not to forward emails.

---

## 11. Legal safeguards

- The legal notice appears on the dashboard, create page, step pages, preview, sending page, signing page, cover page of every PDF, and the footer.
- The text deliberately **does not**: invent the owner, parties, price, address, debts, lease terms, or assets (every missing value is shown as `[TO BE COMPLETED: …]` and blocks sending); treat an asset sale as a sale of the entity; transfer liabilities, employees, contracts, leases, or licenses automatically; promise occupancy of the premises; add penalties, forfeitures, or liquidated damages; guarantee enforceability; simulate notarization or signatures; or waive non-waivable rights.
- **ESIGN / New York ESRA:** the signing page shows an electronic-signature disclosure (right to a paper alternative, withdrawing consent before signing, what you need, how to get copies) and requires explicit consent, then each signature carries the provider's evidence plus this app's consent record. Signers can download the document they sign and, afterwards, the signed copy. The federal ESIGN Act (15 U.S.C. § 7001 et seq.) and New York's Electronic Signatures and Records Act (State Technology Law, Article 3) generally support e-signing commercial contracts, but neither guarantees every document or method is sufficient.
- **"Points worth double-checking"** (shown on Step 9 and Preview) prompt discussion of items such as New York's bulk-sale notice rules for asset purchases (Tax Law § 1141(c); confirm applicability and timing), landlord consent, real-estate formalities (deeds, acknowledgments, recording), alcohol and food-service permits (generally not automatically transferable), tax and wage liabilities that may follow the business, notarization/witness requirements, and e-signature suitability. They are prompts, not legal conclusions.
- **Verification checkpoints:** sending is blocked until a person confirms the seller's authority and ownership. (Attorney review is optional.) The app can't verify these itself.

---

## 12. Requirement coverage and known limits

Covered: dashboard with all columns, filters, and actions; nine-step builder with validation, save/return, structured generation; all 18 sections, schedules A–G, attachment index, merged exhibits; asset/payment/liability/permit/condition tables; automatic balance and schedule check; verification and attorney checkpoints; DocuSign adapter with configurable order, expiry, revocation, resend, reminders; email notifications (invitation, reminder, buyer signed, seller signed, fully signed, declined, expired, cancelled) with failure handling and de-duplication; signed PDF and certificate storage and download; audit trail; admin (users, roles, templates with history, integrations status, settings, activity); account page with password change and consent review; Docker/Render config; tests.

Known gaps and choices you should know about:
- The two third-party adapters are untested against live services (see §1).
- **Retention** is a recorded policy only; there is no automatic deletion (deliberate).
- Non-PDF/image attachments (DOCX, XLSX, CSV) are listed with their SHA-256 fingerprint in the attachment index but are **not merged** into the signed PDF.
- Alcohol licensing, real-estate conveyancing, and notarization are flagged, not implemented.
- Email "Viewed" status depends on DocuSign reporting recipient delivery; the app never infers it.
- "Attorney" is a role with access like any invited user; it has no special powers beyond the access an administrator or owner grants.
- The master-template editor edits plain clause text; tokens such as `{{purchasePrice}}` must be kept for the values to fill in.
- No multi-instance support and no MFA for staff accounts. There is no self-service "forgot password": an administrator re-invites the person's email (Admin → Users), which emails a one-time link that sets a new password and signs them out everywhere.
