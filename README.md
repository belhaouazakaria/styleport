# StylePort Platform

StylePort is a production-ready multi-translator discovery platform.

It includes:
- Public translator catalog with category filters, search autosuggest, featured modules, and pagination
- Public “Request a translator” flow with anti-spam protection
- Dynamic translator pages driven by database configuration
- Secure admin dashboard for translators, categories, requests, settings, analytics, and monetization placements
- Auth.js credentials auth with admin route protection
- Prisma + PostgreSQL data layer
- Server-side OpenAI translation pipeline with usage/cost logging
- Server-side usage protection guardrails with emergency shutdown + alerting

## Core Features

### Public Experience
- `/` as primary discovery homepage
- Search + autosuggest (`name`, `slug`, `description`, `category`)
- Category chips and query-param filters (`q`, `category`, `page`)
- Featured translators section
- Paginated translator cards (mobile-first)
- Translator detail pages at `/translators/[slug]`
- Public request modal for submitting new translator ideas
- No-results request handoff from search/autosuggest with prefilled idea
- Server-side captcha verification and honeypot anti-spam checks
- Simplified translator UX:
  - two-panel layout
  - copy action in source panel
  - copy action in output panel
  - speak translated output (browser TTS when supported)
  - translate / regenerate / clear controls
  - optional swap and optional mode selector from translator config
  - keyboard shortcut (`Ctrl/Cmd + Enter`)

### Admin Experience
- `/login`, `/admin` with role-protected access
- `/admin/translators` CRUD + duplicate + archive/unarchive + hard delete
- `/admin/translators/ai/new` one-prompt AI translator creation flow
- `/admin/categories` CRUD + archive/unarchive + hard delete
- `/admin/requests` review queue with filters, status updates, AI draft generation, and create-from-draft action
- `/admin/ads` CRUD + targeting and provider controls
- `/admin/settings` for branding, discovery, model defaults, monetization toggles
- `/admin/logs` and `/admin` overview analytics

### Analytics + Cost Tracking
Each translation log captures:
- translator, status, mode
- input/output lengths
- model used
- prompt/completion/total tokens when available
- estimated cost via centralized pricing config
- latency and timestamp

### Usage Protection + Emergency Guardrails
- Per-IP quotas enforced on translation calls only:
  - requests per minute
  - requests per hour
  - requests per UTC day
- Global daily token cap (UTC-day aggregate across all translators)
- Automatic emergency shutdown when cap is reached (fail-closed)
- One alert email per shutdown event via Resend
- Admin recovery flow with manual re-enable (no automatic midnight unlock)
- Blocked attempts logged as `TranslationStatus.BLOCKED` with reason codes:
  - `IP_MINUTE_LIMIT`
  - `IP_HOUR_LIMIT`
  - `IP_DAY_LIMIT`
  - `EMERGENCY_SHUTDOWN`
  - `GLOBAL_TOKEN_CAP_REACHED`

### Monetization Readiness
- Ad placement model + admin management
- Global ads on/off setting
- Placement targeting by page/device/category
- AdSense slot and custom snippet support
- Reusable ad slot renderer

## Stack
- Next.js 16 App Router + TypeScript
- Tailwind CSS v4
- Auth.js (`next-auth`) + Prisma Adapter
- Prisma ORM + PostgreSQL
- OpenAI Node SDK (server-side)
- Zod validation
- Vitest + Testing Library

## Environment Variables

Use `.env.example`:

```env
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NEXT_PUBLIC_APP_NAME=StylePort
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=ChangeMe123!
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
USAGE_PROTECTION_ENABLED=true
IP_RATE_LIMIT_PER_MINUTE=5
IP_RATE_LIMIT_PER_HOUR=50
IP_RATE_LIMIT_PER_DAY=200
GLOBAL_DAILY_TOKEN_CAP=200000
AUTO_EMERGENCY_SHUTDOWN_ENABLED=true
TRUST_PROXY_HEADERS=true
IP_HASH_SECRET=
ALERT_ADMIN_EMAIL=
EMAIL_FROM=
RESEND_API_KEY=
```

Notes:
- Keep `OPENAI_API_KEY` server-side only.
- Set a strong `NEXTAUTH_SECRET`.
- Change seeded admin credentials after first login.
- For production request submissions, configure both Turnstile keys.
- Set `IP_HASH_SECRET` in production so stored IP identifiers are salted hashes.
- Set `EMAIL_FROM` and `RESEND_API_KEY` to enable shutdown alert delivery.

## Local Setup

1. Install:

```bash
npm install
```

2. Generate Prisma client:

```bash
npm run prisma:generate
```

3. Run migrations:

```bash
npm run prisma:migrate
```

4. Seed database:

```bash
npm run prisma:seed
```

5. Start dev server:

```bash
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

## Admin Bootstrap
- Email: `admin@example.com` (or `ADMIN_SEED_EMAIL`)
- Password: `ChangeMe123!` (or `ADMIN_SEED_PASSWORD`)
- Login URL: `/login`

## Prisma Models
- `User`, `Account`, `Session`, `VerificationToken`
- `Translator`, `TranslationMode`, `TranslatorExample`
- `Category`, `TranslatorCategory`
- `TranslationLog`
- `TranslatorRequest`
- `AdPlacement`
- `AppSetting`
- `UsageProtectionState`
- `UsageProtectionEvent`

## API Contracts

### `POST /api/translate`

Request:

```json
{
  "text": "Rewrite this sentence",
  "translatorSlug": "regal-rewrite",
  "modeKey": "classic"
}
```

### `POST /api/translator-requests`

Request:

```json
{
  "requestedName": "Startup Pitch Polisher",
  "description": "Rewrite rough startup pitches into concise investor-ready language.",
  "exampleInput": "we build ai for stores",
  "requesterEmail": "founder@example.com",
  "honeypot": "",
  "turnstileToken": "token"
}
```

### `POST /api/admin/translators/ai-draft`

Request:

```json
{
  "brief": "A translator that turns rough support replies into calm and professional responses while preserving intent."
}
```

Success:

```json
{
  "ok": true,
  "requestId": "..."
}
```

Success:

```json
{
  "ok": true,
  "result": "..."
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR|TOO_LONG|RATE_LIMITED|NOT_FOUND|INACTIVE_TRANSLATOR|UPSTREAM_ERROR|BAD_REQUEST|MODEL_UNAVAILABLE",
    "message": "..."
  }
}
```

Protection-related error responses:
- `RATE_LIMITED` with user-facing minute/hour/day limit messages
- `TRANSLATION_UNAVAILABLE` when emergency shutdown is active

### Admin APIs
- `GET/POST /api/admin/translators`
- `GET/PATCH/DELETE /api/admin/translators/[id]`
- `POST /api/admin/translators/[id]/duplicate`
- `POST /api/admin/translators/[id]/toggle-active`
- `POST /api/admin/translators/ai-draft`
- `GET/POST /api/admin/categories`
- `GET/PATCH/DELETE /api/admin/categories/[id]`
- `GET /api/admin/requests`
- `GET/PATCH /api/admin/requests/[id]`
- `POST /api/admin/requests/[id]/generate-draft`
- `POST /api/admin/requests/[id]/create-translator`
- `GET/POST /api/admin/ads`
- `GET/PATCH/DELETE /api/admin/ads/[id]`
- `GET /api/admin/models`
- `GET /api/admin/analytics`
- `GET/PUT /api/admin/settings`
- `GET/PUT /api/admin/usage-protection`
- `POST /api/admin/usage-protection/re-enable`

All admin endpoints require authenticated `ADMIN` role.

## Scripts
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run test`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:deploy`
- `npm run prisma:seed`
- `npm run prisma:studio`

## Deployment

### Vercel + Postgres (Neon/Supabase/Vercel Postgres)
1. Provision PostgreSQL and set `DATABASE_URL`.
2. Set all environment variables.
3. Run deploy migrations:

```bash
npm run prisma:deploy
```

4. Seed once:

```bash
npm run prisma:seed
```

5. Deploy app.

## Security Notes
- Server-side OpenAI calls only
- Auth.js middleware + server permission checks
- Password hashing with bcrypt
- Zod validation on all mutation endpoints
- Archive-first deletion flow + explicit hard delete
- Translation abuse protection is server-side only (no captcha on translate flow)
- IP usage tracking is stored as salted hash (`ipHash`) rather than raw address

## Usage Protection Operations

### Daily Counter Policy
- Quotas and token cap use UTC-day boundaries.
- Emergency state does not auto-clear at day rollover.
- Admin must manually re-enable translation from `/admin/usage-protection`.

### Alert Flow
1. Global token cap is reached.
2. Platform enters emergency shutdown (`translationsEnabled=false`).
3. `UsageProtectionEvent` is created.
4. Alert email is sent once for that event (deduped by `alertSentAt`).

### Recovery
1. Open `/admin/usage-protection`.
2. Review reason, counters, and alert status.
3. Click `Manually Re-enable`.
4. System logs a `MANUAL_REENABLE` event and resumes translation.
# styleport
