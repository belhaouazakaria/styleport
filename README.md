# What Type Of | Translator Platform

What Type Of | Translator is a production-grade multi-translator discovery platform with:
- public translator discovery + translator runtime pages
- secure admin dashboard (CRUD for translators/categories/requests/ads/settings)
- OpenAI translation + AI draft generation
- translator page quick-share to Pinterest with **pre-generated stored pin images per translator**
- quota protection + emergency shutdown + alert email flow
- create-translator intake flow with anti-spam controls

This repository is **feature-complete** and this hardening pass is focused on **deployment and operational readiness**.

## Production Architecture (Hostinger target)

Recommended runtime for this project:
1. **Hostinger Node.js Web App** in hPanel
2. **Subdomain** on existing domain (`translators.whattypeof.com`)
3. **External managed PostgreSQL** (Supabase, Neon, Prisma Postgres, or equivalent)
4. Existing app stack unchanged (Next.js + Prisma + Auth.js + OpenAI)

Important:
- Do **not** host PostgreSQL inside Hostinger shared hosting.
- Keep `DATABASE_URL` pointed at managed Postgres.
- App features and behavior are unchanged; only infrastructure/config are hardened.

---

## Environment Files

### Local development
- Use `.env.example` as template for `.env.local`.
- Local URLs remain localhost-based.

### Production (Hostinger)
- Use `.env.production.example` as template for `.env.production`.
- Must use your HTTPS subdomain URL (no localhost values).

### Public vs server env vars
- Public-safe (client-exposed): `NEXT_PUBLIC_*`
- Server-only secrets: all others (`DATABASE_URL`, `OPENAI_API_KEY`, `NEXTAUTH_SECRET`, etc.)

---

## `.env.production` Setup (Required)

Copy `.env.production.example` to `.env.production` and fill values:

- `APP_BASE_URL=https://translators.whattypeof.com`
- `NEXT_PUBLIC_APP_URL=https://translators.whattypeof.com`
- `NEXTAUTH_URL=https://translators.whattypeof.com`
- `NEXTAUTH_SECRET=<strong-random-secret>`
- `DATABASE_URL=<managed-postgres-connection>`
- `OPENAI_API_KEY=<openai-key>`
- `OPENAI_MODEL=<model>`
- `GOOGLE_INDEXING_ENABLED=false`
- `GOOGLE_INDEXING_DRY_RUN=false`
- `GOOGLE_SERVICE_ACCOUNT_JSON=<full-service-account-json-one-line>`
- `NEXT_PUBLIC_APP_NAME=What Type Of | Translator`
- `IP_HASH_SECRET=<random-secret>`
- `ALERT_ADMIN_EMAIL=<ops-email>`
- `EMAIL_FROM=What Type Of | Translator <translate@whattypeof.com>`
- `BREVO_API_KEY=<brevo-api-key>`

Production validation is fail-fast for critical vars, so missing required values will stop startup.

---

## Google Indexing API Setup

Google Indexing API support in this app is optional and admin-triggered.  
Sitemap remains the primary indexing method.

Important limitation:
- Google officially documents the Indexing API for limited content types (for example JobPosting and BroadcastEvent).
- Use this feature as an extra submission tool only.
- Indexing is never guaranteed, even after a successful submission response.

### 1. Verify Search Console property
1. Open Google Search Console.
2. Verify this exact property:
   - `https://translators.whattypeof.com`

### 2. Google Cloud project and API
1. Create or select a Google Cloud project.
2. Enable **Google Indexing API** for that project.

### 3. Create service account and JSON key
1. Create a service account in Google Cloud IAM.
2. Generate and download a JSON private key for that service account.
3. Open the JSON file and keep it secure.

### 4. Grant Search Console access to service account
1. Copy `client_email` from the downloaded JSON.
2. Add that email as a user on the Search Console property.
3. Grant enough permission to submit indexing requests.

### 5. Configure runtime environment (JSON-only mode)
This app uses only one credential variable:
- `GOOGLE_SERVICE_ACCOUNT_JSON`

Do not split credentials into multiple vars.

Example shape:
```bash
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"your-service-account@your-project.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"...","universe_domain":"googleapis.com"}'
```

To use the full JSON key, open the downloaded service account JSON file, copy the entire JSON content, compress it into one line if needed, and paste it into GOOGLE_SERVICE_ACCOUNT_JSON in Hostinger environment variables. Do not commit this value to GitHub.

The service account JSON contains a private key. Treat it like a password. Never expose it in frontend code, public repositories, screenshots, or logs.

### 6. Dry-run mode
Use dry-run to test safely without sending requests to Google:
- `GOOGLE_INDEXING_ENABLED=true`
- `GOOGLE_INDEXING_DRY_RUN=true`

---

---

## Scripts

Core scripts:
- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — production start (`next start -p ${PORT:-3000}`)
- `npm run check` — lint + typecheck + tests
- `npm run prisma:generate`
- `npm run prisma:migrate` (dev)
- `npm run prisma:deploy` (production-safe migration apply)
- `npm run prisma:seed`
- `npm run prisma:status`
- `npm run validate:env:production`
- `npm run deploy:hostinger` (helper build pipeline script)

---

## Local Development

1. Install:
```bash
npm ci
```

2. Create local env:
```bash
cp .env.example .env.local
```

3. Generate Prisma client:
```bash
npm run prisma:generate
```

4. Run migrations:
```bash
npm run prisma:migrate
```

5. Seed:
```bash
npm run prisma:seed
```

6. Start dev:
```bash
npm run dev
```

---

## Hostinger Deployment Guide (Node.js Web App + Subdomain)

### 1. Prepare managed Postgres
1. Create a managed PostgreSQL project (Supabase/Neon/etc.).
2. Copy the SSL-enabled `DATABASE_URL`.
3. Verify connectivity from your app environment.

### 2. Create subdomain
1. In Hostinger hPanel, open your existing domain.
2. Create/use subdomain: `translators.whattypeof.com`.
3. Point subdomain to your Node.js app location in hPanel.

### 3. Create Node.js Web App in hPanel
1. Select Node.js app (Node 20+ recommended).
2. Set app root to this project.
3. Set startup command to:
```bash
npm run start:hostinger
```
4. Ensure build step is run before startup.

### 4. Configure production env in Hostinger
Set all variables from `.env.production.example` in hPanel environment settings.

Critical for auth/subdomain:
- `APP_BASE_URL=https://translators.whattypeof.com`
- `NEXT_PUBLIC_APP_URL=https://translators.whattypeof.com`
- `NEXTAUTH_URL=https://translators.whattypeof.com`
- `NEXTAUTH_SECRET=<strong random value>`

If Hostinger auto-detects your app as `Other` and leaves build settings as `null`, set:
- Output directory: `.next`
- Entry file: `server.js`
- Startup command: `npm run start:hostinger`

### Google Indexing API production env setup on Hostinger

In Hostinger Node.js app environment variables, add:
- `GOOGLE_INDEXING_ENABLED=true`
- `GOOGLE_INDEXING_DRY_RUN=false`
- `NEXT_PUBLIC_APP_URL=https://translators.whattypeof.com`
- `NEXTAUTH_URL=https://translators.whattypeof.com`
- `GOOGLE_SERVICE_ACCOUNT_JSON=<paste full JSON as one line>`

Steps:
1. Open the downloaded Google service account JSON file.
2. Copy the entire JSON content.
3. Paste it into Hostinger as the value of `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. Prefer keeping it as one line if Hostinger has issues with multiline values.
5. Do not commit this JSON key to GitHub.
6. Do not expose it in frontend code.
7. Restart the Node.js app after changing env vars.

Notes:
- If the JSON contains `\\n` in `private_key`, keep those characters exactly.
- The app handles escaped newline sequences automatically.
- If JSON is pasted multiline and Hostinger accepts it, it may still work, but one-line JSON is safer.

### Do I need GitHub secrets for Google Indexing API?

- For this project, Google indexing runs at runtime from the Hostinger app.
- Therefore, GitHub does **not** need `GOOGLE_SERVICE_ACCOUNT_JSON` for normal build/deploy.
- Add the Google JSON key to GitHub secrets only if a future workflow directly calls Google Indexing API.
- Do not expose Google service account JSON in public files.
- Do not commit `.env.production`.

### 5. Deploy sequence
Preferred production deploy is GitHub Actions artifact deployment:
- CI gate runs lint, typecheck, tests, Prisma migrations, and build on GitHub runners.
- CI then creates a production release bundle (`release.tar.gz`) containing:
  - `.next`
  - `node_modules` (production-pruned)
  - runtime config and assets (`public`, `prisma`, `package.json`, `server.js`, etc.)
- Deploy job uploads only the bundle + deploy script to Hostinger.
- Remote script extracts staged files and atomically swaps runtime paths in app root.
- Server-side `npm install` and `next build` are intentionally avoided to prevent process-limit spikes.

If your Hostinger runtime uses restart files, deployment touches:
```bash
tmp/restart.txt
```

GitHub deploy workflow notes:
- `deploy-hostinger.yml` CI gate now also runs `npm run prisma:deploy` using `DATABASE_URL` secret.
- Remote deploy script is low-overhead and lock-protected (`.deploy-lock`) to avoid overlapping deployments.
- Deploy no longer depends on server-side `.git`.

### 6. Post-deploy verification
Check:
1. `/api/healthz` returns ok
2. `/api/readyz` returns ready
3. public homepage `/` loads and search works
4. `/translators/[slug]` translates successfully
5. `/login` and `/admin` auth flow works
6. request form submission works
7. usage protection dashboard reflects expected state
8. legal/contact pages load (`/privacy`, `/terms`, `/disclaimer`, `/cookies`, `/contact`)

---

## Prisma Production Safety

- Use `npm run prisma:deploy` in production (not `prisma migrate dev`).
- Run migrations before app startup.
- Seed only when explicitly needed:
```bash
npm run prisma:seed
```
- Keep backups/snapshots enabled at your DB provider.

---

## Auth and Subdomain Hardening Notes

- Auth is configured for trusted host deployments (`trustHost`) and secure cookies in production.
- Use HTTPS in production for proper secure session behavior.
- `NEXTAUTH_URL` must exactly match your production subdomain URL.
- Admin and login routes are `noindex` to prevent indexing.

---

## Security and Runtime Hardening Included

- Security headers via Next config:
  - CSP
  - HSTS
  - X-Frame-Options
  - X-Content-Type-Options
  - Referrer-Policy
  - Permissions-Policy
- Standard API no-store response headers.
- Structured server logging for critical failures and external integration errors.
- Proxy-based route protection for `/admin/**` and `/login`.

---

## Pinterest Sharing

- Translator pages include a **Share on Pinterest** action.
- Pinterest intent uses:
  - translator page URL
  - stored pre-generated image at `/generated/pins/...`
  - translator summary text
- Make sure `APP_BASE_URL` (or `NEXTAUTH_URL`) is set correctly in production so share URLs resolve to the public domain.
- Pin images are generated server-side when translators are created/updated and can be manually regenerated from admin translator edit/list screens.

## Optional Admin Google Indexing Tool

The admin dashboard now includes **Indexing** at `/admin/indexing`:
- status/config panel
- bulk action: **Index all active translators**
- indexing logs table with source/status/message

Automatic behavior:
- when a translator is created active, it is submitted automatically
- when a translator becomes active later, it is submitted automatically
- failures are logged and never block translator create/update flows

Admin message reminder:
- “Google Indexing API submission requested. Final indexing is not guaranteed.”

## Public Create-Translator Flow

- Public UX uses a low-friction **Create translator** modal with only:
  - translator name
  - translator description
- Submissions are reviewed in **Admin → Create Submissions**.
- Approving a submission can generate the AI draft and create the translator in one flow.

## Head Code Injection

- Admin settings include **Custom Head Code** for controlled snippet injection into public `<head>`.
- Intended for analytics, AdSense scripts, and verification tags.
- Because this is admin-managed code, only trusted snippets should be used.

## Auto-Featured Translators

- What Type Of | Translator can auto-assign the top 3 featured translators from performance analytics.
- Ranking logic:
  1. highest successful translation usage count (selected window)
  2. highest recent success count (last 7 days)
  3. highest token usage as tiebreaker
- Configure in **Admin → Settings**:
  - `Auto-assign top 3 featured translators`
  - ranking window days
  - manual `Recalculate now`
- When auto-featured is enabled, featured slots are managed automatically and manual featured toggles are informational only.

---

## Health Endpoints

- `GET /api/healthz` — liveness (process-level)
- `GET /api/readyz` — readiness (database connectivity)

Use these for deployment checks and uptime monitors.

---

## CI/CD

GitHub Actions included:
- `.github/workflows/ci.yml`: lint, typecheck, test, build
- `.github/workflows/deploy-hostinger.yml`: validated deployment scaffold using SSH + migration + build

Required GitHub secrets for deploy workflow:
- `HOSTINGER_SSH_HOST`
- `HOSTINGER_SSH_USER`
- `HOSTINGER_SSH_PRIVATE_KEY`
- `HOSTINGER_SSH_PORT`
- `HOSTINGER_APP_PATH`

---

## Troubleshooting (Hostinger + Managed DB)

### App starts but auth fails
- Check `NEXTAUTH_URL` exactly matches production URL.
- Check `NEXTAUTH_SECRET` is present and stable.
- Ensure HTTPS is active on subdomain.

### Prisma connection errors
- Verify `DATABASE_URL` with SSL options.
- Confirm managed DB network rules allow Hostinger egress.
- Run `npm run prisma:status` and `npm run prisma:deploy`.

### Translation unavailable
- Check usage-protection state in `/admin/usage-protection`.
- Review `GLOBAL_DAILY_TOKEN_CAP` and emergency flags.
- Confirm `OPENAI_API_KEY` is valid.

### Alert emails not sent
- Verify `BREVO_API_KEY`, `EMAIL_FROM`, `ALERT_ADMIN_EMAIL`.
- Check server logs for structured `email_alert_*` events.

---

## Operational Note

This pass keeps all existing business logic and UX behavior intact and focuses on production deployment hardening only.
