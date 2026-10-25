# AI Context and Living Documentation Protocol

This document exists so a future AI coding agent can resume the SayTwist Growth Agent without relying on chat history.

## Mandatory reading order

Before planning or coding any Growth task:

1. Read `docs/growth/README.md`.
2. Read `docs/growth/AI_CONTEXT.md`.
3. Read `docs/growth/DECISIONS.md`.
4. Read `docs/growth/ROADMAP.md`.
5. Read `docs/growth/IMPLEMENTATION_MAP.md`.
6. Read `docs/growth/DATA_MODEL.md`.
   For Phase 13, also read `docs/growth/PHASE13_RELEASE_QUALIFICATION.md` before release planning.
7. Read the remaining topic-specific Growth documents.
8. Inspect the current implementation and database schema; check Git status and branch before editing.

Do not infer missing product decisions from generic growth-marketing advice. If a material decision is unresolved and affects architecture, security, billing, Pinterest compliance, data retention, SEO or autonomous behavior, ask the user before implementing it.

## Living-document rule

The Growth documentation is part of the implementation.

A phase is not complete until:

- code and database changes are implemented;
- tests for that phase pass;
- the relevant Growth docs describe the implemented behavior;
- `ROADMAP.md` status is updated;
- new durable decisions are added to `DECISIONS.md`;
- unresolved material questions are explicitly recorded.

Documentation and implementation must not intentionally diverge.

## Change discipline

When behavior changes, update docs in the same work unit.

Examples:

- New agent action -> update `AGENT_AUTOMATION.md`.
- New Pinterest API behavior -> update `PINTEREST_INTEGRATION.md`.
- KPI or attribution change -> update `ANALYTICS_ATTRIBUTION.md`.
- New admin screen/setting -> update `ADMIN_REPORTING_COSTS.md`.
- Schema/worker change -> update `ARCHITECTURE.md`.
- Account strategy change -> update `ACCOUNT_STRATEGY.md`.
- Public `/ideas` behavior -> update `CONTENT_AND_IDEAS.md`.
- Phase scope/status -> update `ROADMAP.md`.
- Durable product/architecture choice -> update `DECISIONS.md`.

## Policy invariant

Never implement a workaround whose purpose is to disguise duplicate content, evade Pinterest anti-spam systems, hide automation, manufacture engagement, or coordinate multiple accounts to manipulate distribution.

If Pinterest policy or developer terms conflict with a desired feature, preserve the product goal where possible but change the implementation to a compliant workflow.

As of the planning baseline, Pinterest's developer guidelines require users to specifically choose each Pin that will be published by an app. Therefore "autopilot" means autonomous analysis, content generation, creative preparation, timing, queueing and recommendations, with a per-Pin publish approval gate unless Pinterest explicitly approves a more autonomous workflow for this application.

## Quality invariant

The agent should optimize for useful, original, high-intent content, not volume.

The system must permit the following daily decisions:

- create;
- improve;
- revive;
- experiment;
- wait;
- do nothing.

Volume targets are ceilings, not quotas.

## Operational invariant

The Growth system must not become a hard dependency for the core translator product.

Failure of Pinterest APIs, AI providers, report delivery, analytics synchronization or the Growth worker must not take down:

- translator pages;
- translation API;
- public browsing;
- authentication;
- existing admin functionality.

## Current known SayTwist context

- SayTwist is a Next.js application with Prisma/PostgreSQL.
- Production uses PostgreSQL 18 self-hosted on the VPS. SayTwist connects locally to `127.0.0.1:5433`, database `saytwist`, as application role `saytwist_app`. Growth shares this local PostgreSQL baseline and must keep its load bounded with scheduled jobs and bounded workers, never aggressive polling.
- Existing translator and Pinterest Pin image generation functionality already exists.
- Existing automatic Pin image generation is the initial control renderer ("Renderer V1").
- Growth UI belongs inside the existing admin as `/admin/growth`.
- Public editorial content belongs under `/ideas`.

Phase 1 audit findings and exact future module paths live in `IMPLEMENTATION_MAP.md`; schema, retention and state machines live in `DATA_MODEL.md`. These are mandatory reading before Growth work.

## Implemented foundation

Phase 2 foundation uses migration `20261005140000_growth_platform_foundation`, `lib/growth/*`, the one-shot `npm run growth:worker` command, and `/admin/growth`. Growth is disabled by default. No cron/PM2 entry exists, and no Pinterest, Ideas or attribution implementation exists. Future work must extend the job enum/handler registry and schema only in its assigned phase.

Phase 3 uses migration `20261005170000_growth_pinterest_integration`, `lib/growth/pinterest/*`, OAuth routes under `/api/admin/growth/pinterest`, and `/admin/growth/accounts`. It connects existing Pinterest accounts through API v5 Authorization Code OAuth, stores AES-256-GCM encrypted rotating credentials, and synchronizes account metadata and public boards through bounded jobs. The standalone worker loads Next `.env*` files before importing Growth modules, so `.env.local` production configuration needs no manual exports. Configuration status is server-only and safe to render because it excludes all secret values. Local Pinterest configuration errors are terminal jobs, never retry loops. Phase 3 live production read validation is complete: the main Business account connected and bounded account/board synchronization succeeded. The then-configured grant omitted `boards:write`, so that validation did not establish Create Pin readiness. Current OAuth requires `user_accounts:read`, `boards:read`, `boards:write`, `pins:read`, and `pins:write`; partial grants are `REAUTH_REQUIRED`.

Phase 4 is complete and live validated. It uses migrations `20261005210000_growth_pinterest_analytics` and `20261006010000_growth_pinterest_relevance`, bounded inventory/account/single-Pin analytics jobs, and `/admin/growth/analytics`. Production verified account analytics, 720 active inventory Pins, 221 active analytics-relevant Pins, a completed 221/221 detailed history backfill, `FRESH` analytics state, zero queued jobs, zero active jobs, and healthy handling under the observed 60 requests/60 seconds limit. It never uses the closed-beta multiple-Pin endpoint, never calls a Pinterest write endpoint, and contains no attribution, opportunity, Ideas, publication, scheduling, cron or PM2 work. Growth was disabled again after validation pending later scheduled/autonomous phases.

The media parser is tolerant of Pinterest's documented polymorphic image/video/mixed media while keeping Pin identity and page structure strict. Inventory keeps all account Pins for strategy and future board lifecycle work. Detailed Pin analytics is restricted to active Pins linking to exact configured owned hostnames: `saytwist.com`, `www.saytwist.com`, and `translator.whattypeof.com`. Existing inventory is reclassified locally; progress means eligible owned-domain Pins only; historical unrelated metrics are retained. The legacy queued pre-upgrade continuation live validated one-time self-preparation through the optional `relevancePrepared` marker and reconciled old all-Pin progress to eligible progress. Complete inventory is reused for 24 hours and page persistence uses a bounded parameterized bulk UPSERT. Phase 4 itself implemented no attribution.

Phase 5 is complete, production deployed, and intentionally not collecting. Migration `20261006150000_growth_attribution`, `lib/growth/attribution/*`, public landing/event routes, server-authoritative translation completion, and `/admin/growth/attribution`. Model `pinterest_organic_v1` preserves first and latest eligible Pinterest touches, uses a seven-day window refreshed by qualified landings, and freezes the latest eligible touch when the first trusted SUCCESS `TranslationLog` creates the session's single qualified conversion. Additional successful translations are attributed usage. Opaque `pin_ref` records and browser tokens use cryptographic randomness; only the session-token SHA-256 hash is stored. Attribution tables never store translation text, raw IP, IP hash, raw user agent, email, or authentication identity.

Public collection is double-gated by server-only `GROWTH_ATTRIBUTION_COLLECTION_ENABLED=true` and `GrowthSettings.attributionEnabled=true`. Both default false, the autonomous Growth kill switch is separate, and production collection is intentionally disabled pending explicit privacy/consent rollout approval. All 19 migrations through Phase 5 were deployed, the production build and health/ready checks passed, and validation confirmed no visitor attribution rows and no attribution cookie. Session/event detail defaults to 30/90 days; bounded manual retention cleanup preserves daily aggregates. Existing Pins without an issued `pin_ref` are not deterministically attributable. No fuzzy, Referer, or UTM-only attribution exists.

Phase 6 is production deployed and live validated in migration `20261006190000_growth_account_strategy`, `lib/growth/strategy/*`, job `ACCOUNT_STRATEGY_REVIEW`, and `/admin/growth/strategy`. Deterministic model `account_strategy_v1` uses the last 28 complete UTC days and always represents the three planned intent roles. Missing roles and disabled attribution remain explicit unavailable states, never fake zero performance. The monthly review is canonical per review month/model, bounded to three roles, 100 boards, 2,500 Pins, 84 account metric rows, 2,500 grouped Pin metric rows, and 64 KiB validated evidence. Board eligibility and account-count recommendations are advisory. Phase 6 uses no AI, calls no Pinterest API during review, mutates no Pinterest/account/board/Pin resource, and adds no scheduler, cron, or PM2 worker. The first production review for 2026-10 returned `COMPLETE_BASELINE_PORTFOLIO`, recommended three accounts at 60% confidence, and recorded the expected missing-role, incomplete-baseline, no-expansion-evidence, and attribution-not-collecting reasons. Growth was disabled again after validation.

Phase 7 is complete, production deployed, and live validated in migration `20261006220000_growth_opportunity_intelligence`, `lib/growth/opportunity/*`, job `OPPORTUNITY_INTELLIGENCE_ANALYSIS`, and `/admin/growth/opportunities`. The retained v1 production run documents structural `/translators/` route-token collapse; corrected production uses `opportunity_intelligence_v2`, `content_clustering_v2`, and `opportunity_scoring_v1`. Its live run considered 221 eligible Pins with `KNOWN` evidence and attribution `NOT_COLLECTING`, producing eight clusters, two opportunities, and no structural Translator cluster.

Phase 8 is production deployed and its decision/planning path is live validated. Migration `20261007010000_growth_translator_autopilot`, `lib/growth/translator/*`, jobs `TRANSLATOR_AUTOPILOT_DECIDE` and `TRANSLATOR_AUTOPILOT_EXECUTE`, and `/admin/growth/translators` implement the mandatory plan/execution split. The controlled test used the real Phase 7 `AMPLIFY_WINNER -> roleplay` opportunity (score 94, confidence 100%, evidence `KNOWN`, 35 distinct destinations, and multiple existing mapped Translators). It returned `WAIT_FOR_MORE_DATA` / `WAITING_DATA` with `MULTIPLE_TARGETS_AMBIGUOUS`, null `translatorId`, and null `executionJobId`; the opportunity moved to `DEFERRED`, no execute job was created, and the active Growth queue ended at 0 rows. Growth and attribution were disabled again. No Translator mutation or rollback was forced: the planner intentionally failed closed, so production status distinguishes live planning validation from the mutation path, which remains implementation validated by the 22/22 real PostgreSQL suite.

Phase 9 is complete — production deployed; live decision/planning safety path validated; no forced Idea mutation. Migration `20261007140000_growth_ideas`, `lib/growth/ideas/*`, one-shot `IDEA_AUTOPILOT_DECIDE`/`IDEA_AUTOPILOT_EXECUTE`, public `/ideas` routes, and `/admin/growth/ideas` implement separate taxonomy, deterministic planning/dedupe/quality gates, injectable generation, immutable versions, automatic publication after successful explicit execution, archive, and checksum-protected rollback. Ten Idea categories exist in production. The deployed safety hotfix uses `idea_autopilot_v2`, rejects superseded Opportunity Intelligence/clustering versions, and prevents generic clusters from creating or improving Ideas merely because of evidence volume. Public content is structured React output only, uses the existing translation API for at most one embedded Translator, and excludes unpublished/archived versions from reads and sitemap. Public `/ideas`, sitemap, homepage, and `ads.txt` smoke checks passed; the existing AdSense line remains `google.com, pub-7927856375186557, DIRECT, f08c47fec0942fa0`. Live validation used opportunity `cmux9ou7e0040a52kdu99upq2` (`AMPLIFY_WINNER`, `historical`, score 77, confidence 100, `KNOWN`) and returned `WAIT_FOR_MORE_DATA` / `WAITING_DATA` with `IDEA_GENERIC_TOPIC_INSUFFICIENT`, null `executionJobId`, and `DEFERRED` opportunity status. `IDEA_AUTOPILOT_DECIDE` succeeded on its first attempt; no execute job was created, zero Ideas were created, no live OpenAI generation was forced, and Growth was disabled again. Attribution remains disabled.

Phase 10 Creative Lab is COMPLETE — production deployed and live visual validation approved. Migration `20261008120000_growth_creative_lab`, `lib/growth/creative/*`, `CREATIVE_LAB_GENERATE`, immutable `GrowthAsset`/`GrowthPinCandidate` revisions, DRAFT `GrowthExperiment` definitions, generated-asset routing, and `/admin/growth/creative` implement the preparation boundary. Renderer V1 is the unchanged existing Translator share image; deterministic typography-led, editorial/list, conversation/chat, and minimal-statement renderers produce 1000×1500 PNGs with explicit line caps. `creative_similarity_v1` uses direct indexed lookups across all history for exact content and asset checksum, while intent-aware fuzzy comparison is capped at 100 recent candidates. The final transaction revalidates Growth, target, Idea block schema, account, experiment, variant, and cluster state before reuse or persistence. Content-addressed file publication is safe for concurrent identical writers, and uncertain database reference state preserves the file. Before → After uses the configured `gpt-image-2` full-image provider with one image unit, exact verified copy, and no deterministic text overlay; the accepted production Pin passed live visual validation. Automated tests still use fakes.

Phase 11 is production deployed and live publication validated. Two earlier Create Pin attempts ended `FAILED_TERMINAL` on HTTP 401 and both immutable chains remain evidence. After Standard Access and a complete grant were operator-confirmed, an individually approved real Pin published through Creative Lab, appeared on Pinterest, reached the intended destination, and finished `RECONCILED`. Direct success may complete that final state without a separate reconciliation job.

Phase 12 v1 and additive migration `20261015120000_growth_evergreen_learning` were deployed and production-validated on October 15, 2026. The immutable v1 run produced 355 `INSUFFICIENT_DATA` recommendations. Phase 12.1 v2 subsequently ran successfully with strict URL matching, `READY`-only metrics, Pin-ID deduplication, and retained provenance, but evidence remained `PARTIAL` because historical Pinterest dates are missing or `PROCESSING`. Phase 12.2 was deployed to production on October 17, 2026 (merge SHA `dc1f004023f3e4343ccd7e0d54122b2a978a0fbd`) with its guarded migration applied. Recovery PREVIEW verified 221 affected Pins across October 4–15, and a single-day October 4 PREVIEW verified 13 `PROCESSING` observations. No QUEUE or recovery worker was run yet. The provider reset-header parser was corrected in hotfix PR #5 (merged SHA `2102acb2dd86dd2a1b02d7479c6e90a6287e71b8`), pending separate production deployment. Recovery remains ADMIN-confirmed, GET-only, eight requests per worker execution; it changes no learning model and reprocesses no immutable run. Learning and recovery cannot write site content, auto-approve, publish, manage boards, run recurring work, or enable Growth/attribution.


**Production deployment authorization:** `main` push builds but does not deploy. A separate exact-SHA, manual-only Hostinger deployment preserves migration and rollback gates. To let the GitHub-connected assistant initiate each expressly approved code-only release without standalone CLI access, the `production-release-bridge.yml` GitHub issue-comment bridge (tracked by the production release runbook) validates owner-authored release requests and exact-SHA approval comments, confirms current `main`, and dispatches the existing guarded workflow with GitHub's short-lived token. This does not permit unapproved deployments, database migrations, Growth activation or Pinterest publication. Review each merged change and record real production acceptance separately from CI success.


Oct 17, 2026 Phase 12.2 live QA: The Oct 4 one-day recovery plan was queued for 13 PROCESSING observations. A quota probe reported 99 remaining with only four seconds until reset; the first worker correctly failed closed on RATE_LIMIT_RESET_EXPIRED before requesting Pin analytics. Recovery remains RUNNING with zero requests completed and one FAILED_RETRYABLE job attempt. Growth and attribution are disabled. The follow-up hotfix `hotfix/pinterest-recovery-expired-window-refresh` refreshes expired/stale quota with at most one authenticated read-only GET per worker execution, defers near-reset Pin requests and preserves the five-request reserve, eight-request cap, idempotent recovery tasks, and existing status semantics. Do not queue another recovery or change stored quota values; resume this approved job after the hotfix passes CI and is deployed. Phase 13 is held; the Google traffic outage since Oct 4 remains urgent after recovery QA.


Oct 17, 2026 follow-up: Twelve consecutive bounded Growth recovery worker invocations succeeded but all deferred with zero progress; recovery stayed RUNNING with 0/13 completed, Growth disabled afterward. Root cause is the overly conservative five-second minimum reset-window check introduced in the previous recovery hotfix. Pinterest's official rate-limit documentation uses `x-ratelimit-remaining: 99` and `x-ratelimit-reset: 1` as its NORMAL response example (`https://developers.pinterest.com/docs/reference/rate-limits/`). The short reset duration by itself must not block available quota. New hotfix branch `hotfix/pinterest-recovery-one-second-window` removes the minimum five-second window check while keeping the five-request reserve, strict actual expiry fail-closed logic, bounded single probe per execution, eight GET cap, immutable historical recovery tasks, no cron/recurrence, and disabled Growth between operator invocations. A guarded PostgreSQL test uses actual provider header format. Do not queue duplicate recovery or reset progress; review, test and approved deploy, then resume existing continuation with capped executions and no-progress detection.


## Phase 13 execution note (2026-10-18)

The operator explicitly chose to retain automatic SayTwist Translator/Ideas publication after existing validation gates, rather than adding a new human content-approval gate. Preserve all deterministic eligibility, quality, duplicate, idempotency and rollback rules. This decision does not waive the independent Pinterest per-Pin approval requirement. The October 2026 Google Search visibility decline and repeat AdSense low-value rejection raise content-quality risk; do not increase autonomous publishing volume or enable recurring production jobs until full Phase 14 security, content-quality and rollout gates pass.

Phase 12.2 recovery was deployed and a single existing plan completed 13/13 requests on 2026-10-17; do not represent that as 90-day historical completeness. Growth and attribution collection remain disabled.

Phase 13A begins with a read-only inventory at `/admin/growth/spend` using existing provider metadata. It is not a full spend ledger, budget enforcement or payment proof. Later work must implement durable accounting and obtain explicit daily/monthly budgets before paid-job automation is enabled. All phase docs must advance alongside implementation.

### Phase 13C delivery decision

User chose OpenWA to deliver a single daily WhatsApp Growth digest; no email delivery by default. The OpenWA v5 adapter and formatter are included in Phase 13's isolated branch, but no scheduled report or live WhatsApp account has been configured. Add a durable daily delivery state machine before wiring jobs to the provider, and never automatically retry when submission is uncertain. Sender and recipient account pairing is an operator-only task. Document and warn about unofficial WhatsApp Web account restrictions. See `OPENWA_RUNBOOK.md`.


## 2026-10-24 Phase 13C Telegram migration

The operator selected Telegram as the preferred Growth digest channel and abandoned WhatsApp/OpenWA after persistence and new-device pairing problems. The feature branch implements a disabled-by-default official Bot API adapter, a one-private-chat recipient restriction, sanitized error handling, no automatic retries and a plain-text digest; existing immutable archives and SENDING/SUBMITTED/OUTCOME_UNKNOWN database claims are retained. OPENWA_RUNBOOK.md is historical; use TELEGRAM_RUNBOOK.md. The service has not sent a Telegram message and has no schedule. No Growth, attribution, paid AI or Pinterest publication is enabled. Phase 13 still lacks enforcement and Phase 14 remains not started.


## 2026-10-24 Phase 13D image spend boundary

The feature branch now gates the real Creative Lab OpenAI image provider with `lib/growth/economics/image-admission.ts` and the existing serialized budget reservation service. It allows only model `gpt-image-2`, medium, portrait 1024x1536, bounded text prompt, one job key/one call, SDK maxRetries=0. A dated 30-cent reservation is deliberately pessimistic (official estimated output ~4.1 cents plus prompt input). It is not provider-reported actual spending. Replays/unknown prices are terminal; no image is requested before an admitted reservation. The existing database image/day, daily/monthly budget checks apply.

This is a *partial* economic hardening slice. Translator and Ideas text-generation provider calls are NOT YET covered. The report cost ledger and actual cost reconciliation remain unknown. No live API calls, production database migration, Growth enablement or Pinterest publication were performed. CI acceptance required before further phase work.


## 2026-10-24 Phase 13E model-priced text admission

The actual Growth Translator and Ideas OpenAI providers now use a budget preflight before each paid request: `lib/growth/economics/text-admission.ts`. Supported baseline is standard `gpt-4.1-mini`, bounded <=65,536 prompt bytes / <=4,200 completion tokens, reserving a conservative 20 cents per request; unknown models/price profiles are blocked. Source: https://developers.openai.com/api/docs/models/gpt-4.1-mini. A stable decision ID plus attempt 0/1 prevents reusing a reservation to make a second request, while original vs repair use separate reservations. The shared `lib/openai.ts` supports Growth-only per-call SDK maxRetries=0; Growth also supplies maximumAttemptsPerModel=1 and allowModelFallback=false. Ordinary translator user requests remain otherwise unchanged. Paid-call uncertainty retains its reservation and is terminal; do not auto-repair on network failure. Existing quality repair still requires a distinct bounded reservation.

No live OpenAI usage, admin spend settlement, content quota enforcement, staging deployment or Growth activation occurred. This is a feature-branch implementation and requires CI plus phase acceptance. Historic Phase 13D statement that text was not yet covered is superseded by this update; the complete economic ledger remains outstanding.


## 2026-10-24 Phase 13F transactional content quotas

Content mutation ceilings are now enforced in `lib/growth/economics/content-quotas.ts` from the actual version tables, while holding the `GrowthSettings` singleton row `FOR UPDATE` inside the same transaction as the public Translator/Ideas content change. Scope: CREATE Translator (1/UTC day), IMPROVE Translator (3/UTC day), CREATE Idea (2/UTC week beginning Monday). The existing per-decision mutation idempotency check runs before quota admission. Distinct active worker transactions serialize on the same settings lock. Quota-exhausted decisions become WAITING_DATA with no mutation. Version rollbacks remain separate recovery operations. No new schema is needed for the quota counter itself.

The quota gate is late and authoritative. A pre-generation early advisory quota guard can be added later to prevent paying for content ultimately blocked by a concurrent or already-full quota. Tests added for UTC windows and cap behavior; full concurrent disposable PostgreSQL acceptance still required. No production release/activation. Phase 13 is not complete.



## 2026-10-24 Phase 13G preflight and budget exposure admin

Added read-only preflightGrowthContentQuota before Translator and CREATE_IDEA AI generation, using the same version-row UTC accounting policy as the final locked mutation. The preflight avoids deterministic quota waste but DOES NOT replace transaction-level lock/validation. The final mutation still serializes on GrowthSettings FOR UPDATE. No external API costs were incurred.

The new lib/growth/economics/exposure.ts reads GrowthAiBudgetReservation daily/monthly sums, image counts, un-reconciled reservations and the last 20 rows using bounded local queries; /admin/growth/spend shows this separately from its historical AI usage inventory. Reserved amounts are conservative upper envelopes, not invoice spend, regardless of provider success, failure or uncertain outcome. Provider cost settlement remains incomplete. Disabled Growth, lack of Telegram recipient, lack of scheduling, and Phase 14 gating remain unchanged. Do not claim a completed ledger or production automation.



## Phase 13H admin archived-report readers, 2026-10-24

ADMIN-only route /admin/growth/reports lists at most 30 latest immutable archived UTC reports, and /admin/growth/reports/[reportId] shows the archived text and once-only delivery audit state. getArchivedGrowthReport validates growth-YYYYMMDD IDs before database access. Content is rendered as escaped React text, not executable HTML. These routes do not generate reports, send Telegram messages or enable a scheduler. Growth main admin now links the report list, and the original digest URL no longer points at a missing page. Full cost reporting, warning management, bot setup, scheduling and Phase 14 remain outstanding.



## Phase 13I immutable OpenAI request evidence, 2026-10-24

Feature branch Prisma + migration add enum `GrowthAiUsageOutcome` and immutable `GrowthAiUsageEvent` with FK/unique reservation link, DB CHECK constraints and trigger blocking UPDATE/DELETE. This is one event per actual provider-request reservation, no secrets, prompts or response body. Text providers record response ID and provider token counters when available; unknown outcomes have no fabricated usage. Image provider records image response evidence with count when known. Exposed separately in ADMIN spend dashboard through bounded local queries. Unknown remains unknown. All provider-call attempts were previously one-time reserved; evidence append failure blocks job completion and retains pessimistic exposure.

Text estimates are computed in integer microUSD only for exact dated standard `gpt-4.1-mini` pricing/version; they are NOT invoice-verified actual charges and may overestimate cached input tokens. Image cost is unpriced without a defensible usage-source accounting profile. Legacy Growth metadata and normal site translations are not rewritten. The formal provider-billing settlement mechanism remains outstanding, as do warnings management, production DB concurrency qualification, Telegram delivery and scheduler. No live provider calls, migration or Growth activation occurred.



## Phase 13J budget warning review (2026-10-24)

Created `lib/growth/economics/warnings.ts`, `/admin/growth/warnings` and a same-origin ADMIN-only POST transition route. It queries the latest 50 existing `AI_BUDGET_WARNING` activity events and derives OPEN / ACKNOWLEDGED / RESOLVED from immutable follow-up activities rather than mutable flags. Transitions hold a database row lock on the source warning so concurrent admin requests cannot append conflicting states. All mutations append actor-user audit events. Acknowledge and resolve are UI-only review actions, never budget/AI/payment actions.

No automated alert notifications, billing reconciliation, scheduler or Telegram send is implemented. Keep Growth disabled; qualify the new feature with CI and an isolated transactional database test before Phase 13 completion.


## 2026-10-24 Phase 13K isolated DB acceptance + opt-in reporting runner

`.github/workflows/growth-phase13-db.yml`, `scripts/test-growth-economics-db.sh` and `tests/growth-economics-persistence.integration.test.ts` validate actual disposable PostgreSQL reservations, concurrency, append-only usage trigger, warning locking and migrations. Test-only cleanup truncates immutable events solely after a guarded exact loopback database URL validation; no production delete capability is added.

`lib/growth/reporting/daily-runner.ts` + `workers/growth-report-runner.ts` implement one-shot previous-UTC-day archiving/delivery at or after 04:00 UTC, guarded by BOTH `GROWTH_DAILY_REPORT_SCHEDULE_ENABLED` and `TELEGRAM_REPORTS_ENABLED` (both default disabled). No timer/cron has been created. A confirmed already-submitted report is a no-op; SENDING/UNKNOWN is terminal, no resend. Running the CLI does not enable Growth or paid AI. Operator must approve and verify live Telegram private recipient delivery before scheduling, and verify billing source documents before recording any actual settlement.


## Phase 13L no invented billing actuals

`reconcileGrowthAiBudget` now fails closed with `VERIFIED_BILLING_EVIDENCE_REQUIRED` regardless of caller-supplied numbers. The immutable provider-response evidence gives estimation only; no verified invoice/project usage source has been connected. Do not reduce budget reservations, change the status to RECONCILED or assert actual cost until an approved verified-cost source and audit workflow is designed and tested. No invoice, billing account, live OpenAI provider request or production database was accessed.

## Phase 13M read-only Telegram private chat verification (2026-10-25)

Feature branch includes `lib/growth/reporting/provisioning.ts`, `pairing.ts`, `scripts/growth-telegram-verify.ts`, and `growth-telegram-discover.ts`. BotFather provisioning is manual and token must not enter repository, logs or chat. The discovery helper requires a fresh 16–32 hex code sent as `/start <code>` in an intended private Telegram chat; a single bounded getUpdates read locates only that exact message, never sends any bot message and writes the numeric chat ID to `~/.config/saytwist/telegram-private-chat-id` mode 0600. Verification checks getMe and private getChat without exposing identifiers, messages or tokens. Bot/token provision and real delivery **have not occurred**. Both report flags stay false; no timer. Phase 13 and Phase 14 remain in progress/not started respectively.

## Phase 13K additional concurrency coverage (2026-10-25)

The isolated Phase 13 PostgreSQL suite now proves delivery once-only behavior using simultaneous claim attempts and a mocked Telegram sender. It verifies both the submitted and OUTCOME_UNKNOWN states with actual database rows. The suite never contacts Telegram and cannot substitute for one manually confirmed private recipient live message. No deployment, bot creation or running schedule has been authorized.
\n## Phase 13N project-level cost snapshot preparation (2026-10-25)\n\nThe pure/test-injected, currently uncalled `provider-costs.ts` validates OpenAI organization Costs `GET` daily project/line-item response. The bounded read-only adapter rejects incomplete/mismatched/duplicate buckets, USD errors, loss of microUSD precision, bad credentials, pagination loops, and network failure without reporting sensitive values. It has no production caller, no configured Admin API key and makes no live network call during CI. Project totals are not individual Growth requests, and do not prove Growth attribution if regular translation uses the same OpenAI project. No current reconciled actual cost, budget slot release, database schema migration or operator billing approval is claimed. Next: decide dedicated project or defendable allocation, provenance retention/attestation and operator authorization; then staging security/migration review and controlled Telegram reception test.\n
## Phase 13O release-readiness security tests and staging checklist (2026-10-25)

`tests/growth-phase13-admin-boundaries.test.ts` adds isolated route/page authorization-gate coverage, including ADMIN check before report, spend and warning reads, plus same-origin/mass-assignment/session controls on warning audit transitions. It invokes no database or provider. `PHASE13_RELEASE_QUALIFICATION.md` is the explicit operator/staging/rollback protocol for PostgreSQL 18 rehearsal, UI accessibility, credential safety and Telegram receipt checks. No staging environment or real delivery was created by documentation or unit tests; the final Phase 13 exit requires operator participation.

## Phase 13P explicit one-time Telegram acceptance utility (2026-10-25)

The staging-only `lib/growth/reporting/acceptance.ts`, `scripts/growth-telegram-acceptance.ts` and `npm run growth:telegram:acceptance` add a separately gated opt-in test path for exactly one report. It requires three human-supplied explicit acceptance controls (enabled, isolated-staging marker, exact previous-day archive confirmation), schedule disabled and normal Telegram channel enabled. The same immutable report archive and sticky once-only PostgreSQL delivery claim are used; no new message transport or retry is implemented. CI stubs the archive/sender and proves default NOOP, bad configuration, wrong UTC day, wrong archive identity and no retry. Operator must still create the bot/verify private recipient, explicitly approve a single test and confirm receipt. This code is not a live send, migration, deployment or scheduling authorization.

## Phase 13Q database-immutable report archives (2026-10-25)

Additive migration `20261025150000_growth_daily_report_append_only` installs a PostgreSQL trigger that refuses UPDATE and DELETE on `GrowthDailyReport`; delivery status remains separate and mutable for durable claims. `archiveGrowthDailyReport` uses INSERT-first, catches only Prisma unique collision P2002 and reads the existing report, so concurrent archive generation still returns the first immutable snapshot without an ON CONFLICT UPDATE trigger. Dedicated disposable PostgreSQL 16 and 18 tests reject archive mutation/deletion while retaining the original digest; test cleanup uses TRUNCATE only in the exact guarded throwaway DB. This does not migrate production or deliver a Telegram message.

Follow-up coverage: `tests/growth-report-archive-immutability.test.ts` confirms INSERT-only successful archiving, unique P2002 collision fetching the persisted first-writer digest without UPDATE, and propagation of unrelated DB failures. This supplements the real PostgreSQL trigger tests; neither suite runs a provider request.

## Phase 13R dedicated provider project and Telegram owner-only delivery (2026-10-25)

The operator confirmed a new isolated OpenAI project will be created and no persistent staging site will be provisioned. `GROWTH_OPENAI_API_KEY` and `GROWTH_OPENAI_PROJECT_ID` are distinct, private, fail-closed inputs exclusively for Growth paid text/image/Creative Example calls. The normal translator `OPENAI_API_KEY` is unchanged. The model and project key must be verified in the provider dashboard before any real usage. Creative Example's formerly unreserved text rewrite is now bounded to one pinned `gpt-4.1-mini` request, with unique durable job-key admission, usage evidence, unknown outcome and no SDK retries or fallback. Unbound Creative Example paid work is blocked. Unit tests cover isolation and no fallback. Do not claim provider billed actual from a response estimate.

Telegram remains a username-discoverable bot, not an unfindable private account. The production server sends only to the exact configured private numeric ID; no inbound webhooks, cron or polling services exist. BotFather `/setjoingroups` must be Disabled; verification now rejects `getMe.can_join_groups` other than false. Pairing requires matching private chat and matching human sender IDs. The operator has created a bot, but pairing, recipient verification and live send have NOT happened. See `PHASE13_PRODUCTION_NO_STAGING.md`; do not mislabel a production server as isolated staging or merge directly into the automatic deployment branch without authorization.

## Phase 13S explicitly approved production message path (2026-10-25)

The single-send acceptance runner now supports production as an explicit separate mode after the no-staging operator decision, but guards against staging-label spoofing and requires an exact loopback production PostgreSQL target plus additional report-ID-bound approval. No bot token/chat ID or real message was used. Staging-mode invocations refuse the production DB. The user's initial request to operate directly in production does not itself authorize deployment or a report send; obtain separate operator signoff for each action. This does not change recurring reporting defaults (OFF) or actual billed cost settlement (unverified).
