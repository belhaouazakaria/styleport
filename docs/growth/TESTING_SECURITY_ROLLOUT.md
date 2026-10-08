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


## Phase 6 account strategy validation

Ordinary Phase 6 tests cover all three roles with partial connectivity, healthy/reauth/stale/missing analytics states, explicit attribution-disabled/QPC-unavailable semantics, deterministic alignment and confidence, conservative board eligibility, inactive/private/reauth boards, 28-complete-UTC-day windows, BigInt-safe ratios, concentration warnings, baseline-incomplete recommendations, denial of a fake fourth-account recommendation, bounded evidence schemas, admin authorization/same-origin enforcement, three-role rendering, board limits, secret absence, handler registration and absence of Pinterest mutation controls.

`npm run test:growth-strategy-db` requires `GROWTH_STRATEGY_TEST_DATABASE_URL`, forces `DATABASE_URL` to match, and refuses every target except loopback `saytwist_growth_phase6_strategy_test`. From a clean migration history it verifies one connected main role plus two explicit unconnected roles, all-three weak evidence, fresh Pinterest metrics while attribution is not collecting, one-Pin concentration, canonical monthly rerun behavior, unavailable metrics for missing roles, bounded activity evidence, and Growth-disabled worker behavior. The disposable database must be dropped afterward.

Phase 6 rollout keeps Growth disabled and attribution collection intentionally disabled. The strategy page may calculate a current read-only snapshot; only an explicit ADMIN same-origin action enqueues persistence. Stale data produces a refresh recommendation rather than an automatic Pinterest call. No production execution, Pinterest mutation, account/board automation, AI dependency, scheduler, cron, or PM2 Growth worker is part of Phase 6.

Phase 6 was subsequently production deployed and live validated. Migration `20261006190000_growth_account_strategy`, the production build, and health/ready checks succeeded. The first `2026-10` review completed as `COMPLETE_BASELINE_PORTFOLIO`, recommended three accounts at 60% confidence, and recorded `ATTRIBUTION_NOT_COLLECTING`, `ROLE_NOT_CONNECTED`, `BASELINE_PORTFOLIO_INCOMPLETE`, and `NO_EXPANSION_EVIDENCE`. Growth was disabled again after validation; attribution collection remained disabled.

## Phase 7 opportunity intelligence validation and rollout

Ordinary tests cover complete-UTC-day windows, canonical Translator URL mapping, boilerplate removal, stable order-independent clustering, one-off exclusion, BigInt aggregation, winner/rising/fatigue thresholds, observation minimums, score renormalization without conversion, partial/stale confidence penalties, no-cost state, null trend behavior, migration additivity, handler registration, ADMIN/same-origin enqueue, and bounded report behavior. The opt-in `npm run test:growth-opportunity-db` requires matching `GROWTH_OPPORTUNITY_TEST_DATABASE_URL`/`DATABASE_URL` and refuses every target except loopback database `saytwist_growth_phase7_opportunity_test`. It covers durable membership/evidence, daily persistence idempotency, and enqueue idempotency. Phase 2–6 compatibility and the full migration chain must be checked on that disposable database, then the database must be dropped.

Phase 7 is production deployed and live validated. Corrected validation used `opportunity_intelligence_v2`, `content_clustering_v2`, and `opportunity_scoring_v1`; considered 221 eligible Pins under the 500-Pin cap with `KNOWN` evidence and attribution `NOT_COLLECTING`; and produced eight deterministic clusters, two opportunities, and two WINNER signals at 85% average confidence. No `translator` or `translators` structural cluster existed. The top opportunities were `AMPLIFY_WINNER` for `roleplay` at score 94/confidence 100% and for `historical` at score 77/confidence 100%. The v1 run remains historical audit evidence of the structural `/translators/` route-token collapse. Growth was disabled again after validation and attribution remained disabled. No Pinterest mutation, AI call, content mutation, scheduler, cron, or persistent Growth worker was introduced.


### Phase 7 hardening PostgreSQL matrix

The real Phase 7 PostgreSQL suite names and independently verifies A–H: (A) multiple meaningful sustained Pins create winner signals and a topic opportunity; (B) one viral Pin creates its winner signal but concentration blocks cluster expansion; (C) recent multi-signal growth persists rising signals/opportunity; (D) previously meaningful multi-signal decline persists fatigue signals/opportunity; (E) one-destination demand with content depth persists an inventory gap; (F) disabled attribution remains unavailable and emits no conversion opportunity; (G) same-date/model rerun creates no duplicate run, signal, or opportunity; and (H) disabled Growth leaves the daily job pending and persists no analysis. All scenarios run only against loopback `saytwist_growth_phase7_opportunity_test`.


### Phase 7 clustering v2 correction validation

Regression tests cover structural route exclusion, centralized generic vocabulary, the 60% document-frequency ceiling on corpora of at least ten Pins, category preference, translator slug evidence, unknown-destination terminal fallback, order independence, no-singleton behavior, a 500-Pin live-like corpus, same-day v1/v2 coexistence, v2 enqueue/execution idempotency, deterministic latest-run ordering, and fatigue precedence. Corrected production validation succeeded, so Phase 7 is `Complete — production deployed and live validated`.

## Phase 8 Translator Autopilot validation and rollout

Ordinary tests cover create/improve/wait/no-action planning, fatigue and winner conservatism, generic evidence, exact/near/related/archived dedupe, active/inactive/unknown/ambiguous categories, quality blockers, aggregate repair tokens, canonical managed snapshots/checksums, operational-field exclusion, share-image change detection, strict jobs, ADMIN/same-origin routes, rollback checksum preconditions, and rejection of client-supplied snapshots.

`npm run test:growth-translator-db` requires `GROWTH_TRANSLATOR_TEST_DATABASE_URL`, forces `DATABASE_URL` to match, and refuses every target except loopback `saytwist_growth_phase8_translator_test`. From all 22 migrations it verifies A–P: create, idempotency, near-duplicate redirect, improve, optimistic concurrency, invalid generation, category safety, rollback, rollback no-op, initial kill switch, fake AI boundary, post-generation kill switch, nested concurrency, category invalidation, unsafe historical-category rollback, and post-commit reconciliation without duplicate mutation. Additional real-DB cases cover lifecycle closure, pre-generation/editorial/category concurrency, late duplicate/decision/opportunity revalidation, and inactive activation readiness.

Security boundaries treat stored Pinterest text as untrusted prompt data; cap evidence/output/snapshots; exclude credentials, PII, comments and TranslationLog text; reject AI category/Translator IDs; keep network calls outside transactions; lock and checksum before improvement/rollback; replace nested rows transactionally; use unique decision/action/version keys against races; keep snapshots admin-only; and import no Pinterest transport. Phase 8 is production deployed but remains explicitly/manual invoked after live planning validation. The real Phase 7 roleplay opportunity returned `WAIT_FOR_MORE_DATA` / `WAITING_DATA` with `MULTIPLE_TARGETS_AMBIGUOUS`, moved to `DEFERRED`, created no execute job, and left 0 active jobs. Growth and attribution were disabled again. No Translator mutation or rollback was forced; those paths remain implementation validated by the 22/22 real PostgreSQL suite. There is no recurring scheduler, cron, PM2 Growth process, Pinterest mutation, or attribution change.

## Phase 9 Ideas validation and rollout

Ordinary tests cover strict jobs and structured blocks, deterministic planning thresholds, taxonomy safety, title/slug/category/cluster/list-item dedupe, quality and 96 KiB limits, numeric-title counts, active Translator references, material checksum changes, handler registration, public draft/archive filtering, structured rendering, ADMIN authorization, and same-origin action enforcement. Generation uses injected fakes; no test makes a live OpenAI call.

`npm run test:growth-ideas-db` requires `GROWTH_IDEAS_TEST_DATABASE_URL`, forces `DATABASE_URL` to match, and refuses every target except loopback `saytwist_growth_phase9_ideas_test`. From all 23 migrations it verifies A–P: seeded taxonomy, create persistence/publication, idempotent retry, duplicate redirect, improve/versioning, optimistic concurrency, invalid generation, category/reference safety, archive, rollback, rollback no-op, initial and post-generation kill switches, late duplicate/decision/opportunity revalidation, and job/lifecycle closure. Phase 2–8 real PostgreSQL compatibility suites also pass against separately migrated disposable loopback databases.

Security checks reject raw HTML, prompt/placeholder residue, unsafe links, unknown block types, inactive or unknown Translator/category references, oversized snapshots, excessive CTAs/embeds, duplicate list content, and stale checksums. Public routes expose only current published non-archived versions; dynamic reads avoid stale unpublished page output. Rollback creates a new validated version, and archive preserves history. Phase 9 is production deployed; its live decision/planning safety path is validated, with no forced Idea mutation. Production smoke checks passed for `/ideas`, sitemap, homepage, and `ads.txt`, while Growth and attribution remain disabled.
Security checks reject raw HTML, prompt/placeholder residue, unsafe links, unknown block types, inactive or unknown Translator/category references, oversized snapshots, excessive CTAs/embeds, duplicate list content, and stale checksums. Public routes expose only current published non-archived versions; dynamic reads avoid stale unpublished page output. Rollback creates a new validated version, and archive preserves history. Phase 9 is production deployed; its live decision/planning safety path is validated, with no forced Idea mutation. Production smoke checks passed for `/ideas`, sitemap, homepage, and `ads.txt`, while Growth and attribution remain disabled.

Targeted closure coverage also verifies stale Translator/Idea execution leases repair `EXECUTING` decisions and opportunities transactionally, retry without duplicate mutations, and terminate when attempts are exhausted. Phase 9 database tests require active public categories, reject archived rollback, enforce current-version ownership in PostgreSQL, retain aggregate AI usage after failed attempts, use current-version SEO, and fail closed on corrupt stored block arrays. Planner and database coverage rejects superseded opportunity model versions and proves generic labels cannot create or improve Ideas regardless of evidence volume.

## Phase 10 Creative Lab validation and rollout boundary

Focused ordinary tests cover the renderer registry and control metadata, deterministic PNG reproducibility, controlled archetypes, copy/job/experiment bounds, exact/near/related/distinct and cross-account similarity, default-off AI, the one-image budget, malicious asset paths, handler registration, ADMIN authorization, same-origin enforcement, and the absence of Phase 11 status/action semantics.

`npm run test:growth-creative-db` requires `GROWTH_CREATIVE_TEST_DATABASE_URL`, forces `DATABASE_URL` to match, and refuses every host/database except loopback `saytwist_growth_phase10_creative_test`. From all 24 migrations it covers A–R: schema/check constraints, Translator control materialization, immutable checksum/dimensions, retry idempotency, exact/near duplicate behavior, static rendering, published Idea eligibility, inactive/unpublished rejection, destination CHECK enforcement, DRAFT experiment association, AI disabled state, explicit fake-provider success, one-image ceiling, null unknown price, Growth kill switch, late target invalidation, orphan cleanup with referenced-asset preservation, and cross-account exact duplicate deferral. The disposable database is dropped after validation.

Security is server authoritative: candidate inputs contain controlled IDs/enums only; copy and JSON are bounded; no HTML/provider request body is accepted or logged; target/account/experiment eligibility is read from PostgreSQL; files are constrained to checksum filenames inside dedicated storage; PNG signature, dimensions, and byte cap are enforced; Growth is rechecked under a row lock; target state is revalidated after rendering; and persistence failure removes only a newly created unreferenced file. Admin reads are bounded and expose no credentials or raw provider payloads.

Phase 10 rollout status is **Complete — implementation validated; not production deployed**. Validation uses no production access, migration, live OpenAI/image request, or Pinterest write. Growth and attribution remain disabled. There is no approval, scheduling, publishing, autonomous recurrence, cron, or persistent Growth worker; Phase 11 owns those capabilities.
