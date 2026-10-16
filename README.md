# SayTwist Platform

SayTwist is a production-grade multi-translator discovery platform with:

- public translator discovery + translator runtime pages
- secure admin dashboard (CRUD for translators/categories/requests/ads/settings)
- OpenAI translation + AI draft generation
- translator page quick-share to Pinterest with **pre-generated stored pin images per translator**
- quota protection + emergency shutdown + alert email flow
- create-translator intake flow with anti-spam controls

This repository is **feature-complete** and this hardening pass is focused on **deployment and operational readiness**.

Phase 12 Evergreen & Learning v1 was deployed and production-validated on October 15, 2026; its immutable run produced 355 `INSUFFICIENT_DATA` recommendations. Phase 12.1 legacy evidence subsequently ran successfully as v2, but its evidence remained `PARTIAL` because historical Pinterest daily observations were missing or still `PROCESSING`. Phase 12.2 analytics gap recovery remains undeployed. Its migration requires the separate operator-approved backup/preparation procedure; the normal deploy script refuses pending migrations and never applies one. Growth and attribution stay disabled, the two earlier HTTP 401 chains remain historical evidence, and individual Pin approval remains mandatory. See [`docs/growth/README.md`](docs/growth/README.md).

## Production Architecture (Hostinger target)

Implementation and release notes for the current mobile/editorial/ads.txt work are in:

- [`docs/mobile-content-adsense-audit.md`](docs/mobile-content-adsense-audit.md)
- [`docs/adsense-readiness-report.md`](docs/adsense-readiness-report.md)
- [`docs/ezoic-setup.md`](docs/ezoic-setup.md)

Recommended runtime for this project:

1. **Hostinger Node.js Web App** in hPanel
2. **Primary domain** (`saytwist.com`)
3. **PostgreSQL 18 self-hosted on the VPS** (local SayTwist database)
4. Existing app stack unchanged (Next.js + Prisma + Auth.js + OpenAI)

Important:

- Production SayTwist connects to the VPS-local PostgreSQL service at `127.0.0.1:5433`, using database `saytwist` and application role `saytwist_app`.
- App features and behavior are unchanged; only infrastructure/config are hardened.

---

## Environment Files

### Local development

- Use `.env.example` as template for `.env.local`.
- Local URLs remain localhost-based.

### Production (Hostinger)

- Use `.env.production.example` as template for `.env.production`.
- Must use your HTTPS domain URL (no localhost values).

### Public vs server env vars

- Public-safe (client-exposed): `NEXT_PUBLIC_*`
- Server-only secrets: all others (`DATABASE_URL`, `OPENAI_API_KEY`, `NEXTAUTH_SECRET`, etc.)

---

## `.env.production` Setup (Required)

Copy `.env.production.example` to `.env.production` and fill values:

- `APP_BASE_URL=https://saytwist.com`
- `NEXT_PUBLIC_APP_URL=https://saytwist.com`
- `NEXTAUTH_URL=https://saytwist.com`
- `NEXTAUTH_SECRET=<strong-random-secret>`
- `DATABASE_URL=<local-vps-postgres-connection>`
- `OPENAI_API_KEY=<openai-key>`
- `OPENAI_MODEL=<model>`
- `NEXT_PUBLIC_APP_NAME=SayTwist`
- `IP_HASH_SECRET=<random-secret>`
- `ALERT_ADMIN_EMAIL=<ops-email>`
- `EMAIL_FROM=SayTwist <hello@saytwist.com>`
- `BREVO_API_KEY=<brevo-api-key>`

Production validation is fail-fast for critical vars, so missing required values will stop startup.

---

## Search discovery and Search Console

SayTwist does not use the Google Indexing API or any automatic submission service. Search discovery and monitoring use the dynamic XML sitemap and Google Search Console only.

- Sitemap: `https://saytwist.com/sitemap.xml`
- Robots: `https://saytwist.com/robots.txt`
- Submit the sitemap in Search Console under **Indexing → Sitemaps** using `sitemap.xml`.
- Use **URL Inspection** for representative homepage, translator, and Idea URLs. Confirm the live test returns HTTP 200, allows crawling, exposes the production canonical, and does not emit `noindex` before requesting indexing.
- Run `SEO_VERIFY_DEPLOYED_VERSION=<actual-deployed-release> npm run --silent seo:verify-production` for a read-only live crawlability check. The required version label prevents old production responses from being presented as evidence that this branch is deployed. It never submits or modifies content.

The read-only production impact report was approved on 2026-10-13: all 355 existing translator URLs remain eligible under the proposed rule, with zero sitemap removals and zero robots metadata changes. Strict human-review enforcement remains disabled. Any future eligibility-policy change requires a new production report and approval.

Google decides whether and when an eligible URL is indexed; sitemap presence is not an indexing guarantee.

See `docs/search-console-operations.md` for the eligibility contract, safe production impact report, live verification, sitemap submission, and URL Inspection checklist.

See `docs/production-release-runbook.md` for validation, artifact, migration, deployment, verification, and rollback procedures.

---

## Scripts

Core scripts:

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — production start (`next start -p ${PORT:-3000}`)
- `npm run check` — lint + typecheck + tests
- `SEO_VERIFY_DEPLOYED_VERSION=<actual-deployed-release> npm run --silent seo:verify-production` — read-only live robots/sitemap/status/canonical/noindex audit
- `DATABASE_URL="$READ_ONLY_PRODUCTION_DATABASE_URL" SEO_IMPACT_ENVIRONMENT=production SEO_IMPACT_DEPLOYED_VERSION=<actual-deployed-release> SEO_IMPACT_BASE_URL=https://saytwist.com npm run --silent seo:report-indexing-impact` — transaction-enforced read-only comparison of deployed, proposed, and future strict translator eligibility
- `npm run prisma:generate`
- `npm run prisma:migrate` (dev)
- `npm run prisma:deploy` (VPS-only production migration command; use through the protected deployment workflow)
- `npm run prisma:seed`
- `npm run prisma:status`
- `npm run validate:env:production`
- `npm run deploy:hostinger` (VPS-only deployment helper; requires the protected workflow inputs)

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

### 1. Verify local VPS PostgreSQL

1. Confirm PostgreSQL 18 is running on the VPS and reachable locally by the SayTwist app.
2. Confirm the app uses the existing `saytwist` database and `saytwist_app` role.
3. Verify connectivity from the app process without exposing connection credentials.

### 2. Configure domain

1. In Hostinger hPanel, point `saytwist.com` to your Node.js app location.
2. Set up the domain to point to your Node.js app location in hPanel.

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

Critical for auth/domain:

- `APP_BASE_URL=https://saytwist.com`
- `NEXT_PUBLIC_APP_URL=https://saytwist.com`
- `NEXTAUTH_URL=https://saytwist.com`
- `NEXTAUTH_SECRET=<strong random value>`

If Hostinger auto-detects your app as `Other` and leaves build settings as `null`, set:

- Output directory: `.next`
- Entry file: `server.js`
- Startup command: `npm run start:hostinger`

### 5. Deploy sequence

Preferred production deploy is GitHub Actions artifact deployment:

- CI gate runs a clean install, lint, typecheck, tests, build, dependency pruning, and artifact validation on GitHub runners. It cannot connect to or migrate the private production database.
- CI then creates a production release bundle (`release.tar.gz`) containing:
  - `.next`
  - `node_modules` (production-pruned)
  - runtime config and assets (`public`, `prisma`, `package.json`, `server.js`, etc.)
- After the protected `production` environment is approved, the deploy job uploads only the bundle, deployment script, and PM2 contract validator to Hostinger.
- The authenticated VPS script uses the existing Node.js installation at `/home/saytwist/.nvm/versions/node/v24.20.0/bin`, verifies a PostgreSQL backup, requires an already-current Prisma migration status for this release, and only then publishes the staged files.
- The remote script requires an operator-configured absolute `HOSTINGER_PM2_CLI` path, connects it only to the existing `/home/saytwist/.pm2` daemon, and validates the current `npm start` registration, working directory, `NODE_ENV=production`, and `PORT=3001` before any backup or migration. It restarts only the existing PM2 `saytwist` process, preserves its environment, and requires both health and readiness checks on port 3001 to pass. It leaves every other PM2 process untouched and never starts the Growth worker.
- Server-side `npm install` and `next build` are intentionally avoided to prevent process-limit spikes.

GitHub deploy workflow notes:

- PostgreSQL remains private at `127.0.0.1:5433`; Prisma status and deploy commands run only inside the authenticated VPS session using its existing `.env` configuration.
- The current release expects no pending migration. Any unexpected pending migration stops deployment before application files are replaced.
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

- Use `prisma migrate status` followed by `prisma migrate deploy` only through the protected VPS deployment script. Never run production migrations from a GitHub-hosted runner.
- Use only `/usr/lib/postgresql/18/bin/pg_dump` and `/usr/lib/postgresql/18/bin/pg_restore`, verify both report major version 18, and validate the custom-format backup before migration execution. The incompatible default PostgreSQL 16 tools must not be used.
- This release must find zero pending migrations. A future release containing a reviewed migration must update the explicit migration gate as part of that reviewed change.
- Never use `prisma migrate reset` in production.
- Seed only when explicitly needed:

```bash
npm run prisma:seed
```

- Keep backups/snapshots enabled at your DB provider.

---

## Auth and Subdomain Hardening Notes

- Auth is configured for trusted host deployments (`trustHost`) and secure cookies in production.
- Use HTTPS in production for proper secure session behavior.
- `NEXTAUTH_URL` must exactly match your production domain URL.
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
- Result sharing is lazy: the first action prepares the result image; a separate, user-initiated **Continue to Pinterest** action opens Pinterest without popup-blocking risk.

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

- SayTwist can auto-assign the top 3 featured translators from performance analytics.
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
- `.github/workflows/deploy-hostinger.yml`: validated artifact deployment with protected SSH-side backup, migration checks, PM2 restart, health checks, and application rollback

Required GitHub secrets for deploy workflow:

- `HOSTINGER_SSH_HOST`
- `HOSTINGER_SSH_USER`
- `HOSTINGER_SSH_PRIVATE_KEY`
- `HOSTINGER_SSH_PORT`
- `HOSTINGER_APP_PATH`

---

## Troubleshooting (Hostinger + local VPS PostgreSQL)

### App starts but auth fails

- Check `NEXTAUTH_URL` exactly matches production URL.
- Check `NEXTAUTH_SECRET` is present and stable.
- Ensure HTTPS is active on domain.

### Prisma connection errors

- Verify the server-only database configuration points to the local VPS PostgreSQL service.
- Confirm the local PostgreSQL service is listening on the expected loopback port and the app role has the required access.
- Use the protected deployment workflow for Prisma status/deploy so the private database URL never leaves the VPS.

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
