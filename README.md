# StylePort Platform

StylePort is a production-grade multi-translator discovery platform with:
- public translator discovery + translator runtime pages
- secure admin dashboard (CRUD for translators/categories/requests/ads/settings)
- OpenAI translation + AI draft generation
- quota protection + emergency shutdown + alert email flow
- request intake with captcha + anti-spam controls

This repository is **feature-complete** and this hardening pass is focused on **deployment and operational readiness**.

## Production Architecture (Hostinger target)

Recommended runtime for this project:
1. **Hostinger Node.js Web App** in hPanel
2. **Subdomain** on existing domain (example: `translators.yourdomain.com`)
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

- `APP_BASE_URL=https://translators.yourdomain.com`
- `NEXTAUTH_URL=https://translators.yourdomain.com`
- `NEXTAUTH_SECRET=<strong-random-secret>`
- `DATABASE_URL=<managed-postgres-connection>`
- `OPENAI_API_KEY=<openai-key>`
- `OPENAI_MODEL=<model>`
- `NEXT_PUBLIC_APP_NAME=StylePort`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<turnstile-site-key>`
- `TURNSTILE_SECRET_KEY=<turnstile-secret>`
- `IP_HASH_SECRET=<random-secret>`
- `ALERT_ADMIN_EMAIL=<ops-email>`
- `EMAIL_FROM=<resend-from-address>`
- `RESEND_API_KEY=<resend-key>`

Production validation is fail-fast for critical vars, so missing required values will stop startup.

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
2. Create subdomain, e.g. `translators.yourdomain.com`.
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
- `APP_BASE_URL=https://translators.yourdomain.com`
- `NEXTAUTH_URL=https://translators.yourdomain.com`
- `NEXTAUTH_SECRET=<strong random value>`

### 5. Deploy sequence
Run this order on production host:
```bash
npm ci
npm run validate:env:production
npm run prisma:generate
npm run prisma:deploy
npm run build
```
Then (or via app restart in hPanel):
```bash
npm run start:hostinger
```

If your Hostinger runtime uses restart files, run:
```bash
touch tmp/restart.txt
```

### 6. Post-deploy verification
Check:
1. `/api/healthz` returns ok
2. `/api/readyz` returns ready
3. public homepage `/` loads and search works
4. `/translators/[slug]` translates successfully
5. `/login` and `/admin` auth flow works
6. request form submission + captcha works
7. usage protection dashboard reflects expected state

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

### Request form blocked
- Validate Turnstile site/secret pair.
- Confirm production domain is registered in Turnstile config.

### Alert emails not sent
- Verify `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_ADMIN_EMAIL`.
- Check server logs for structured `email_alert_*` events.

---

## Operational Note

This pass keeps all existing business logic and UX behavior intact and focuses on production deployment hardening only.
