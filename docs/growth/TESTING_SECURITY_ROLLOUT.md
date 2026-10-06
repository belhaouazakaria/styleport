# Testing, Security and Rollout

## 1. Testing layers

### Unit tests

Cover:

- opportunity scoring;
- KPI calculations;
- attribution;
- scheduling;
- duplicate detection;
- cost calculations;
- state transitions;
- policy gates;
- account eligibility.

### Integration tests

Cover:

- Prisma persistence;
- job idempotency;
- content versioning;
- OAuth callback validation;
- Pinterest adapter behavior with mocked API responses;
- analytics sync;
- publication reconciliation;
- report generation.

### End-to-end admin tests

Cover:

- account connect/disconnect;
- account health;
- opportunities;
- Pin candidate review;
- per-Pin approval;
- schedule visibility;
- cost settings;
- warnings;
- reports.

### Production smoke tests

Must avoid unintended Pinterest publication.

Use explicit test accounts/sandbox/trial capabilities until production publishing is deliberately enabled.

## 2. Security

Mandatory controls:

- CSRF-safe OAuth;
- least privilege;
- encrypted token storage;
- no secret logging;
- admin authorization on all Growth routes/actions;
- validation of redirect/callback parameters;
- safe HTML/content rendering;
- rate limiting where relevant;
- idempotency;
- audit logs;
- dependency/security review for new packages.

## 3. AI safety/quality controls

AI-created content passes deterministic validation before publication.

Check:

- required fields;
- prohibited duplicate titles/slugs;
- broken links;
- unsafe HTML;
- empty/thin output;
- unsupported claims where relevant;
- malformed metadata;
- content similarity;
- category validity.

The system should fail closed on malformed generated content.

## 4. Pinterest policy gate

Before a Pin reaches approval:

- destination matches claim;
- account intent fits;
- content is relevant;
- recent duplicate check passes;
- no deceptive redirect;
- no attempt to manipulate engagement/distribution;
- exact Pin is visible to admin.

Publication requires per-Pin approval under the planning-baseline Pinterest developer rules.

## 5. Cost safety

- pre-estimate expensive AI jobs where possible;
- record actual usage;
- honor configured hard limits;
- skip optional expensive steps when limits are reached;
- never retry expensive generations indefinitely.

## 6. Rollout modes

### Mode 0 — Disabled

No Growth jobs.

### Mode 1 — Observe

- analytics/attribution only;
- no content changes;
- no Pin candidates.

### Mode 2 — Recommend

- opportunities/decisions generated;
- no autonomous site content changes;
- no publication.

### Mode 3 — Create Drafts

- autonomous translator/Ideas drafts;
- Pin candidates;
- no live site content without configured allowance.

### Mode 4 — SayTwist Autopilot + Pinterest Approval

- autonomous SayTwist-side content actions per settings;
- Pin candidates automatically created;
- operator approves each specific Pin;
- approved Pins publish at learned times.

This is the intended initial production steady state.

### Future Mode 5 — Expanded Approved Pinterest Automation

Only if Pinterest explicitly permits/approves such a workflow for this app. Requires new documented decision and security/policy review.

## 7. Controlled rollout

Recommended sequence:

1. Connect one Pinterest account.
2. Backfill analytics.
3. Enable first-party attribution.
4. Run Observe mode.
5. Compare dashboard numbers to Pinterest UI.
6. Enable Recommend mode.
7. Evaluate decision quality.
8. Enable Draft mode.
9. Test content quality/rollback.
10. Enable Pin candidates with Renderer V1.
11. Approve/publish small controlled batch.
12. Validate API/publication/analytics loop.
13. Add second/third account.
14. Enable SayTwist Autopilot + Pinterest Approval.
15. Keep close monitoring for an observation period.
16. Expand volume only when quality and conversion justify it.

## 8. Rollback

Ability to:

- disable Growth globally;
- pause a connected account;
- stop publication jobs;
- stop AI generation;
- roll back translator/Ideas edits;
- reject/cancel Pin candidates;
- disconnect Pinterest credentials.

Pausing Growth must not affect the core application.

## Phase-specific controls

OAuth: cryptographically random single-use state tied to ADMIN session, exact redirect allowlist, least scopes, token expiry/refresh and authenticated encryption with key version in server-only secrets. Never log tokens or provider bodies containing them. Growth admin routes use the existing ADMIN session guard plus origin/CSRF validation for sensitive mutations: the browser Origin must exactly match server-side `APP_BASE_URL`, independently of nginx's internal listener URL. Zod validates inputs and durable rate limits apply where multi-process behavior matters. Growth content is structured and sanitized before React rendering; prohibit arbitrary HTML. If external images are later fetched, allowlist hosts, block private/link-local IPs and redirects, cap bytes/time/type. Attribution stores opaque session IDs, no raw text/IP; use consent and retention policy appropriate to served jurisdictions. Pin approval binds immutable revision/checksum and publication is idempotent with reconciliation after unknown API outcome. Append-only activity records actor, reason, state transition and correlation key. Worker uses least-privilege credentials, finite concurrency, kill switch and independent failure budget. Explicit hard spend caps stop expensive jobs; warnings otherwise recommend action. Growth failure must not propagate into translation/page requests.

Phase 2 tests should cover typed settings, kill switch, state guards, durable job claim/retry/idempotency and admin authorization on a disposable DB. Existing `RUN_EDITORIAL_DB_TESTS=1` suite is opt-in and must not be run against production. Later phases add OAuth/attribution/publication and rollback tests.

Phase 2 has focused Vitest coverage for strict settings, sensitive JSON filtering, deterministic credential-pattern redaction, same-origin mutation checks, disabled/empty/bounded worker behavior, kill-switch recheck, batch claim contract, idempotency conflicts, stale lease recovery, retry/terminal transitions, handler rejection, activity emission, admin API authorization and shell values.

The complete 15-migration history and real services were also verified from scratch on a disposable local PostgreSQL 18 database. Database scenarios cover enabled empty queue, disabled kill switch, successful no-op execution and activities, concurrent idempotent enqueue, two simultaneous `FOR UPDATE SKIP LOCKED` batch claimers, stale lease recovery, retry timing, terminal exhaustion, database enum rejection, lease ownership and concurrent singleton settings updates. `npm run test:growth-db` is deliberately opt-in: it requires `GROWTH_TEST_DATABASE_URL`, overrides `DATABASE_URL` only in that process, and the test refuses any host except loopback or any database name except `saytwist_growth_phase2_test`. The disposable database is dropped after the verification session; production and the shared `styleport` development database are never test targets.

Persisted error text is bounded and redacts the concrete credential forms handled here: PostgreSQL URLs, authorization/Bearer values, API keys, access/refresh tokens, passwords, secrets, database URLs and cookie headers. Structured payload/activity filtering removes sensitive key names recursively. This is deterministic pattern coverage, not a claim of generic secret detection.

Production uses the existing PostgreSQL 18 instance self-hosted on the VPS; SayTwist connects locally at `127.0.0.1:5433` to database `saytwist` as application role `saytwist_app`. Test and rollout plans must protect that shared database with bounded concurrency, explicit scheduling and finite retry behavior. Never use production for test fixtures, load testing, or idle polling.

Phase 3 ordinary tests mock Pinterest HTTP and cover AES-GCM round trips/tamper failure, exact production/Sandbox bases, timeout signals, response validation, HTTP classification, OAuth state binding/expiry/replay, Basic token exchange, fixed redirects, admin guards and disconnect confirmation. They also verify safe configuration-status serialization, invalid encryption-key handling, terminal classification for local configuration errors, and a child-process worker bootstrap that loads Next `.env*` files before configuration/credential use. `npm run test:growth-pinterest-db` requires `GROWTH_PINTEREST_TEST_DATABASE_URL` and refuses every target except loopback `saytwist_growth_phase3_test`. It verifies account/role uniqueness, ciphertext persistence, serialized refresh rotation, full/partial board sync semantics, disconnect blocking and sync-job idempotency. Production Trial-access validation completed successfully: OAuth connected the main Business account in the production environment with all required scopes, the bounded worker reported five successes and no failures, account and board sync succeeded, and 18 boards were observed for that validation run. No Pinterest resource was created or modified. Growth was disabled again after validation and remains disabled until scheduled execution is ready in later phases.

Phase 4 ordinary tests mock official account, top-Pin, single-Pin and Pin-list responses; validate metric/date contracts, zero/missing rows, malformed/unsupported metrics, 401/403/429/5xx and `Retry-After`; and test the same-origin enqueue route. `npm run test:growth-analytics-db` requires `GROWTH_ANALYTICS_TEST_DATABASE_URL`, forces `DATABASE_URL` to match, and refuses every host/database except loopback `saytwist_growth_phase4_test`. It covers Pin uniqueness/upsert, complete and partial inventory semantics, bookmark loops, account/Pin daily UPSERT corrections, backfill progress, job idempotency/continuation, outbound ranking, date aggregation and zero-impression rates. Apply every migration from scratch with `prisma migrate deploy`, verify status, run this suite, then drop the disposable database.

Phase 4 production validation completed successfully. Account analytics and Pin inventory worked; 720 active Pins were inventoried and 221 active Pins were classified analytics-relevant across `saytwist.com`, `www.saytwist.com`, and `translator.whattypeof.com`. Detailed history completed 221/221, analytics state reached `FRESH`, and the queue ended with zero queued and zero active jobs. The observed Pinterest organic analytics limit was 60 requests per 60 seconds, and rate-limit handling remained healthy. Migration `20261006010000_growth_pinterest_relevance` and the bounded bulk inventory/relevance path were live validated. The legacy queued pre-upgrade Pin analytics continuation self-prepared through the optional `relevancePrepared` mechanism and reconciled prior all-Pin progress to eligible owned-domain Pin progress. Complete inventory intentionally remains broader than analytics eligibility, and historical unrelated Pin analytics rows were retained. No Pinterest Pin was created, edited or deleted, and no write API was used. Growth was disabled again after validation pending later scheduled/autonomous phases.

The first live attempt returned valid account analytics and stored 50 Pins before a later inventory page failed the former narrow media parser. The single terminal parser failure retained in history is evidence from that pre-fix run; it is not current, active or retryable. Regression fixtures now cover single image, missing optional copy, multiple images, video, multiple videos, mixed media, future fields, unsafe/no preview, null optionals, bookmark/final pages, missing Pin ID and malformed outer items. The real PostgreSQL suite recreates the resume case: 50 first-page Pins persist, a later request fails, a new explicit sync reuses the bookmark, a polymorphic page succeeds, UPSERT prevents duplicates, and deactivation occurs only on complete inventory. Parser errors expose only bounded response names, structural paths and Zod issue codes; tests assert response contents are absent.

`npm run test:growth-relevance-db` accepts only loopback `saytwist_growth_phase4_relevance_test`. It applies all migrations from scratch and verifies default domains, 250-row page UPSERT/repeat/update behavior, preservation of detailed analytics fields, eligibility persistence, local reclassification, eligible progress reconciliation, zero-eligible completion, duplicate-chain prevention, the 24-hour fresh-inventory shortcut, partial/stale behavior, settings changes during a prepared chain, and one-time self-preparation of an old 720-Pin continuation. The suite drops its disposable database afterward.

Phase 5 ordinary tests cover opaque ref/token format, canonical deterministic URLs including approved legacy-host conversion to `saytwist.com`, exact UTM policy, unsafe destination rejection, fail-safe environment parsing, dual-gate no-op, seven-day window-bound cookie attributes, token hashing, bot/prefetch/origin filtering, strict public/admin routes, admin authorization, existing-Pin ref reuse, translator view/input deduplication, ordinary-traffic zero-wait behavior and the bounded landing-before-translation race. Translation regression tests prove attribution runs only after a persisted SUCCESS log and that attribution failure cannot change a successful response; blocked, failed or unpersisted successes cannot count.

`npm run test:growth-attribution-db` requires `GROWTH_ATTRIBUTION_TEST_DATABASE_URL`, forces `DATABASE_URL` to match, enables the environment gate only in that process, and refuses every target except loopback `saytwist_growth_phase5_attribution_test`. From a clean migration history it verifies eligible-Pin ref issuance/reuse and URL output, valid landing/session establishment, idempotent replay, one landing-session aggregate across multiple active-window touches, expired-session rollover to a fresh token/journey, translator view/input, trusted completion, one QPC per session, secondary attributed usage, frozen historical assignment, invalid campaign/ref semantics, both disabled gates, concurrent completion/QPC aggregates, and session cleanup with event/aggregate preservation. The disposable database must be dropped after verification.

Production rollout after Phase 5 keeps `GROWTH_ATTRIBUTION_COLLECTION_ENABLED=false` and `GrowthSettings.attributionEnabled=false`. This guarantees no new attribution cookie, session or event collection until privacy/consent rollout is explicitly approved. Enabling later requires an intentional server configuration change plus ADMIN setting, policy review, a controlled test ref, cookie verification and dashboard validation. Growth remains disabled for scheduled/autonomous execution; no cron or PM2 Growth worker exists.
