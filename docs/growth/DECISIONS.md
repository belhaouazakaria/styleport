# Decision Log

Durable product/architecture decisions for the SayTwist Growth Agent.

Do not delete old decisions when superseded. Mark them superseded and add the replacement.

## D-001 — Growth stays inside SayTwist admin

**Status:** Accepted

Use `/admin/growth` instead of a separate Growth subdomain/app.

A separate worker/process is allowed and expected.

## D-002 — `/ideas` is mandatory

**Status:** Accepted

The Growth system includes an editorial/inspiration surface under `/ideas`. It is not treated as an optional generic blog.

## D-003 — Initial Pinterest portfolio is three intent-driven publications

**Status:** Accepted

Initial strategy:

- SayTwist -> utility/discovery
- SayTwist Ideas -> inspiration
- SayTwist Playground -> entertainment

Do not initially split accounts into narrow categories such as "Work" solely because translators exist for that category.

## D-004 — Account count is data-driven after launch

**Status:** Accepted

Start with three accounts. The agent reviews the portfolio monthly and recommends expansion/repositioning only when evidence supports it.

The agent never creates Pinterest accounts automatically.

## D-005 — Primary optimization target is qualified conversion

**Status:** Accepted

Outbound clicks are important, but the system optimizes toward Pinterest-attributed successful translations.

## D-006 — Full SayTwist-side autopilot

**Status:** Accepted

The agent may autonomously create/edit translators and Ideas content, generate creative candidates, select accounts/boards/times, revive content and run permitted experiments, subject to configured limits, quality gates, versioning and rollback.

## D-007 — Pinterest publication requires specific Pin approval

**Status:** Accepted due to current external policy constraint

Current Pinterest developer guidelines require the end user to choose each Pin that will be published/scheduled through an app.

Therefore the initial production mode is:
- autonomous candidate generation;
- exact Pin shown in admin;
- explicit per-Pin approval;
- system publishes the approved Pin at the chosen/recommended time.

This decision may change only if Pinterest explicitly permits/approves a different automation workflow for this application.

## D-008 — Official Pinterest API only

**Status:** Accepted

No browser posting bot, password bot, cookie automation or anti-spam evasion.

## D-009 — Existing Pin renderer is V1 control

**Status:** Accepted

The current automatic translator Pin image generator is retained and measured as the baseline control before new visual systems are judged.

## D-010 — Static images only initially

**Status:** Accepted

Do not implement video Pin generation in the initial roadmap.

## D-011 — Agent decides recommended publishing volume

**Status:** Accepted

The agent chooses recommended volume based on account maturity/performance within admin-configured ceilings.

## D-012 — AI budget is flexible and visible

**Status:** Accepted

No fixed budget is locked at planning time.

Admin gets spend reporting and settings to reduce/increase workload and impose hard ceilings.

## D-013 — Warning-first account behavior

**Status:** Accepted

For performance/policy-risk signals, notify the operator with evidence and recommended action rather than autonomously disabling accounts.

Mechanical failures may stop individual jobs naturally.

## D-014 — Daily report is concise executive digest

**Status:** Accepted

One recipient. Include:
- main performance;
- breakout content;
- actions completed;
- AI spend;
- important warning(s);
- tomorrow's plan.

Full detail remains in `/admin/growth`.

## D-015 — WhatsApp desired, not assumed free

**Status:** Accepted

Implement notification provider abstraction. Verify current WhatsApp Business Platform cost/requirements during implementation and provide email fallback.

## D-016 — "Do nothing" is a valid agent outcome

**Status:** Accepted

The agent must not manufacture content purely to satisfy a daily quota.

## D-017 — Do not create fake subdomains for Pinterest account claims

**Status:** Accepted

Main SayTwist should claim the root domain. Satellite accounts are authentic editorial publications, not separate fake properties created to work around platform constraints.

## D-018 — Living documentation is mandatory

**Status:** Accepted

Growth docs are part of the source of truth. Relevant documents must be updated whenever implementation changes durable behavior.

## D-019 — Worldwide English, US-first initial optimization

**Status:** Accepted

Target English-speaking users worldwide. Initially optimize US scheduling, experiments, trend interpretation and Pinterest tests; replace geographic assumptions with first-party performance as evidence grows.

## D-020 — Existing claimed domain and accounts

**Status:** Accepted

The main SayTwist Pinterest account already claims `saytwist.com`. Additional accounts already exist and will later be rebranded SayTwist Ideas and SayTwist Playground. No new Pinterest account creation is required for launch. The agent never creates an account.

## D-021 — Attribution proposal for Phase 5

**Status:** Proposed implementation default

Seven-day configurable/versioned return window; retain first and last Pinterest touches and use last eligible Pinterest touch for the primary KPI. Count one session with a trusted SUCCESS completion once. Validate against live behavior and privacy requirements during Phase 5.

## D-022 — Production database topology

**Status:** Accepted

Production uses PostgreSQL 18 self-hosted on the VPS. SayTwist connects locally on `127.0.0.1:5433` to database `saytwist` as application role `saytwist_app`.

Growth is designed around the existing local PostgreSQL production architecture and shares that instance/database unless a later durable architecture decision changes it. External managed database assumptions, including Neon, are not part of the current production baseline. Growth jobs must keep PostgreSQL load bounded and must not use aggressive polling.

## D-023 — Phase 2 uses a dedicated disabled-by-default Growth foundation

**Status:** Accepted and implemented

Use dedicated `GrowthSettings`, `GrowthJob`, `GrowthActivity` and `GrowthWorkerHeartbeat` tables. Growth defaults to disabled. Workers run only through explicit bounded invocation, claim one bounded batch atomically with PostgreSQL row locking, cap retries and exit when disabled or empty. Attempts increment on committed claim; stale recovery does not increment, and exhausted leases/failures become terminal. A stable heartbeat row represents each configured worker identity while a random invocation ID fences heartbeat updates and job transitions. Required unique idempotency keys identify a logical job for its entire lifetime. Phase 2 exposes no generic job creation API and registers only the internal `FOUNDATION_NOOP` handler.

## D-024 — Phase 3 Pinterest connection boundary

**Status:** Accepted, implemented and live validated

Use Pinterest API v5 Authorization Code OAuth for existing accounts. Request exactly `user_accounts:read`, `boards:read`, `pins:read` and `pins:write`. OAuth state is a ten-minute, hashed, admin-bound database record consumed atomically once. Credentials use versioned AES-256-GCM envelopes under `GROWTH_CREDENTIAL_ENCRYPTION_KEY`; continuous refresh rotation replaces access and refresh credentials together while holding an account row lock.

Exactly one connected account may hold each SayTwist publication role, and a Pinterest account ID is globally unique. Disconnect erases local ciphertext, releases the active-role slot, cancels pending Phase 3 sync work and retains non-secret identity/audit history. Pinterest documents no suitable application token-revocation endpoint for this flow, so Phase 3 does not invent one. Account and public-board reads are the only Pinterest resource operations in this phase.

Production Trial-access validation connected the main SayTwist Business account with the complete required scope set and successfully synchronized account metadata and boards through the bounded worker. Growth remains disabled after validation until later phases establish scheduled execution.

## D-025 — Standalone Growth workers load Next environment files before service imports

**Status:** Accepted and implemented

`npm run growth:worker` is a bounded standalone process. Its bootstrap uses `@next/env` before dynamically importing Growth/Pinterest modules, so production obtains `.env.production.local`, `.env.local`, `.env.production` and `.env` with explicit process variables taking precedence. Pinterest configuration status is calculated server-side from one required-name list and exposes only safe operational state. Missing or invalid local configuration is terminal for a claimed sync job because retrying cannot repair server configuration.

## Open implementation checks

1. Whether the remaining existing Pinterest accounts are eligible to connect with the required scopes when their roles are activated.
2. Persistent image storage path, host scheduler and PM2 process list before any worker is deployed.
3. WhatsApp provider/setup, current pricing and eligibility; email fallback remains required.
4. Attribution consent and retention details across served jurisdictions before collection starts.
