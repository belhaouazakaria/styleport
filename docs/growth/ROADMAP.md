# Growth Agent Roadmap

**Total planned phases: 14**

Status values:

- Not started
- In progress
- Blocked
- Complete

## Phase 1 — Growth specification and policy architecture

**Status:** Complete (documentation/specification only)

Deliver:

- living docs finalized against current repo;
- unresolved product questions recorded;
- KPI definitions;
- state machines;
- Pinterest compliance gates;
- data-retention/privacy decisions;
- implementation conventions.

Exit:

- docs match accepted product scope;
- no material architecture blocker remains.

## Phase 2 — Growth platform foundation

**Status:** Complete

Deliver:

- core Growth schema;
- job/state infrastructure;
- audit/decision entities;
- `/admin/growth` shell;
- settings foundation;
- worker process architecture;
- feature kill switch.

Exit:

- foundation tests pass;
- core app remains unaffected when worker is down.

Implemented in migration `20261005140000_growth_platform_foundation` and `lib/growth/*`. Growth defaults to disabled; `/admin/growth` remains readable, and `npm run growth:worker` performs one bounded run then exits. Unit coverage and an opt-in disposable PostgreSQL 18 suite verify state, security, idempotency, real concurrent batch claiming, retry limits, lease ownership/recovery, singleton settings, bounded heartbeat storage, audit records and the admin shell. The complete migration history applies from scratch. No Phase 3+ integration is included.

## Phase 3 — Pinterest integration

**Status:** Complete

Deliver:

- developer app setup guidance;
- OAuth;
- encrypted credentials;
- multiple business account connections;
- board sync;
- API adapter;
- Trial/Sandbox-safe test flow;
- access-tier handling.

Exit:

- at least one account can connect and sync safely.

Implemented in migration `20261005170000_growth_pinterest_integration`, `lib/growth/pinterest/*`, `/api/admin/growth/pinterest/*`, and `/admin/growth/accounts`. Mocked HTTP/OAuth tests and disposable PostgreSQL tests pass. Production validation completed with Pinterest Trial access: the main SayTwist Business account connected through OAuth with the scope set then used for reads, account synchronization succeeded, and a bounded worker completed account and board synchronization successfully. Phase 11 later identified that this grant omitted `boards:write`; Phase 3 read validation remains valid, but it did not validate Create Pin authorization. Growth was disabled again after validation and remains disabled until later phases make scheduled execution ready.

## Phase 4 — Analytics ingestion

**Status:** COMPLETE / LIVE VALIDATED

Deliver:

- Pin/account sync;
- metric snapshots;
- historical backfill within API limits;
- top Pin reporting;
- analytics freshness/health;
- baseline admin charts/tables.

Exit:

- analytics match Pinterest source within understood tolerances.

Implemented in additive migrations `20261005210000_growth_pinterest_analytics` and `20261006010000_growth_pinterest_relevance`, `lib/growth/pinterest/analytics*`, the existing Pinterest API adapter/job worker, and `/admin/growth/analytics`. Production validation verified account analytics, a complete inventory of 720 active Pins, 221 active analytics-relevant Pins across the configured owned domains, a completed 221/221 detailed history backfill, `FRESH` analytics state, and zero queued or active jobs under the observed 60 requests/60 seconds organic limit. The legacy queued pre-upgrade continuation self-prepared through the optional `relevancePrepared` mechanism and reconciled old all-Pin progress to eligible owned-domain Pin semantics. Inventory deliberately remains broader than analytics eligibility and retains unrelated Pins for strategy and future Phase 6/11 board lifecycle work; historical unrelated Pin analytics rows were retained. No Pinterest resource was created, edited or deleted, and no write API was used. Growth was disabled again after validation pending later scheduled/autonomous phases. Phase 4 itself added no attribution, publishing, scheduling, Ideas, board management, cron or PM2 Growth worker.

## Phase 5 — SayTwist attribution

**Status:** COMPLETE / PRODUCTION DEPLOYED / COLLECTION INTENTIONALLY DISABLED

Deliver:

- Pin refs/UTM strategy;
- landing events;
- translator completion events;
- embedded translation events;
- attribution model/version;
- qualified conversion KPI.

Exit:

- test Pin/session can be traced to completed translation.

Implemented in additive migration `20261006150000_growth_attribution`, `lib/growth/attribution/*`, `/api/growth/attribution/*`, the trusted `/api/translate` SUCCESS path, translator instrumentation, and `/admin/growth/attribution`. The `pinterest_organic_v1` contract uses issued opaque refs, hashed first-party session tokens, a seven-day latest-qualified-landing window, preserved first/latest touches, frozen last-touch primary assignment, one QPC per session, deduplicated secondary completions, 30/90-day detail retention, and long-lived daily aggregates. Collection requires both the false-by-default server environment gate and the false-by-default Growth setting; production collection remains intentionally disabled. Migration `20261006150000_growth_attribution` is deployed and all 19 migrations were current; production build and health/ready checks passed with both gates false, no visitor attribution rows, and no attribution cookie. No Pinterest write, existing Pin edit, attribution guess for old Pins, cron, or PM2 Growth worker was added.

## Phase 6 — Account Strategy Agent

**Status:** Complete (production deployed and live validated)

Deliver:

- intent-driven account model;
- portfolio health;
- board/account eligibility;
- monthly Account Opportunity Review;
- account-count recommendation logic.

Exit:

- agent can explain why three accounts are/are not currently appropriate.

Production deployed and live validated with migration `20261006190000_growth_account_strategy`; build and health/ready checks passed. The first production review for `2026-10` returned `COMPLETE_BASELINE_PORTFOLIO`, recommended three accounts at 60% confidence, and recorded `ATTRIBUTION_NOT_COLLECTING`, `ROLE_NOT_CONNECTED`, `BASELINE_PORTFOLIO_INCOMPLETE`, and `NO_EXPANSION_EVIDENCE`. Implemented in deterministic `lib/growth/strategy/*`, bounded `ACCOUNT_STRATEGY_REVIEW`, and `/admin/growth/strategy`. Model `account_strategy_v1` evaluates the last 28 complete UTC days, always represents the three user-intent roles, and distinguishes missing/unavailable evidence from zero. Health, readiness, intent alignment, board eligibility, portfolio recommendation, deterministic confidence, and Pin concentration are explainable. Monthly reviews are canonical per month/model and write bounded activity. Because attribution collection is intentionally disabled, QPC remains unavailable and confidence is limited. V1 cannot recommend a fourth account because `account_strategy_v1` does not consume the durable cluster/content-depth evidence now implemented separately in Phase 7. No Pinterest/API mutation, account/board/Pin automation, AI, autonomous recurrence, cron, or PM2 Growth worker was added.

## Phase 7 — Opportunity Intelligence

**Status:** Complete — production deployed and live validated

Deliver:

- winner/rising/fatigue detection;
- topic/content clustering;
- inventory gaps;
- opportunity scoring;
- confidence/sample thresholds;
- optional TrendProvider abstraction.

Exit:

- opportunities are generated from real measurable evidence.

Implemented in additive migration `20261006220000_growth_opportunity_intelligence`, deterministic `lib/growth/opportunity/*`, bounded `OPPORTUNITY_INTELLIGENCE_ANALYSIS`, and `/admin/growth/opportunities`. The initial production `opportunity_intelligence_v1` / `content_clustering_v1` run is retained as historical audit evidence after exposing structural `/translators/` route-token collapse. The corrected production models are `opportunity_intelligence_v2`, `content_clustering_v2`, and unchanged `opportunity_scoring_v1`. Corrected live analysis considered 221 eligible Pins under the 500-Pin cap with `KNOWN` evidence and attribution `NOT_COLLECTING`; it produced eight deterministic clusters, two opportunities, and two WINNER Pin signals at 85% average confidence. Winner examples were Freaky Translator in `funny` and Cold Hearted, Cunning And Manipulative Translator in `roleplay`. The top opportunities were `AMPLIFY_WINNER` for `roleplay` at score 94/confidence 100% and for `historical` at score 77/confidence 100%. No `translator` or `translators` structural cluster remained. Growth and attribution were disabled again after validation. No Pinterest call or mutation, AI call, content mutation, publishing, Ideas, Translator mutation, creative generation, scheduling, cron, or persistent Growth worker was added.

## Phase 8 — Translator Autopilot

**Status:** Complete — production deployed; live decision/planning path validated

Deliver:

- create/improve translator actions;
- deduplication;
- quality validation;
- version history;
- rollback;
- safe category handling.

Exit:

- autonomous translator actions are reproducible, auditable and reversible.

Implemented in additive migration `20261007010000_growth_translator_autopilot`, `lib/growth/translator/*`, one-shot jobs, and `/admin/growth/translators`. `translator_autopilot_v1` separates deterministic planning from mutation; dedupe, category, and quality gates are server authoritative. After AI returns, execution rechecks Growth enabled state plus decision, opportunity, target checksum, category, quality, and duplicate authorization. Outcomes close the opportunity as `ACTIONED`, `DEFERRED`, `DISMISSED`, `FAILED_RETRYABLE`, or `FAILED_TERMINAL`. New Translators remain inactive and require complete validated content plus synchronized share-image state before manual activation. Managed snapshots/checksums exclude operational and share-image state; slug/name are immutable identity checks. Rollback requires a current checksum and currently safe historical categories. Share-image refresh is post-commit, durable, visible, and independently retryable without duplicate mutation. The real PostgreSQL suite passed 22/22, covering A–P plus lifecycle, activation, concurrency, and late-revalidation cases. Production validation used the real Phase 7 `AMPLIFY_WINNER -> roleplay` opportunity (score 94, confidence 100%, evidence `KNOWN`, 35 distinct destinations, and multiple existing mapped Translators) and correctly returned `WAIT_FOR_MORE_DATA` / `WAITING_DATA` with `MULTIPLE_TARGETS_AMBIGUOUS`; the opportunity became `DEFERRED`, no Translator or execute job was selected, and the active queue ended at 0 rows. Growth and attribution were disabled again. Mutation and rollback remain implementation validated and were not forced in production. Phase 8 added no Pinterest call/mutation, Ideas/content-creative work, attribution enablement, recurrence, scheduler, cron, or permanent Growth worker.

## Phase 9 — SayTwist Ideas

**Status:** Complete — production deployed; live decision/planning safety path validated; no forced Idea mutation

Deliver:

- `/ideas` content model;
- categories/taxonomy;
- public index/detail UX;
- SEO;
- internal linking;
- contextual translator CTA/embedded use;
- AI generation/quality gates;
- versioning.

Exit:

- Ideas content provides standalone user value and measurable conversions.

Implemented in additive migration `20261007140000_growth_ideas`, `lib/growth/ideas/*`, one-shot jobs `IDEA_AUTOPILOT_DECIDE` and `IDEA_AUTOPILOT_EXECUTE`, public `/ideas` and `/ideas/[slug]`, and ADMIN `/admin/growth/ideas`. Ideas use a separate seeded taxonomy with 10 production categories, strict structured blocks, immutable bounded versions/checksums, contextual Translator references, and at most one embedded Translator through the existing translation API. Public reads expose only published, non-archived current versions and the sitemap includes only those URLs. The production safety hotfix deployed `idea_autopilot_v2`, which rejects superseded Opportunity Intelligence/clustering versions and prevents generic clusters from creating or improving Ideas merely because of evidence volume. Public `/ideas`, sitemap, homepage, and `ads.txt` smoke checks passed; the existing AdSense line remains `google.com, pub-7927856375186557, DIRECT, f08c47fec0942fa0`. Live validation used current-v2 opportunity `cmux9ou7e0040a52kdu99upq2` (`AMPLIFY_WINNER`, `historical`, score 77, confidence 100, evidence `KNOWN`) and returned `WAIT_FOR_MORE_DATA` / `WAITING_DATA` with `IDEA_GENERIC_TOPIC_INSUFFICIENT`, null `executionJobId`, and `DEFERRED` opportunity status. `IDEA_AUTOPILOT_DECIDE` succeeded on the first attempt; no `IDEA_AUTOPILOT_EXECUTE` job was created, zero Ideas were created, no live OpenAI generation was forced, Growth was disabled again, and attribution remained disabled.

## Phase 10 — Creative Lab

**Status:** COMPLETE — production deployed and live visual validation approved

Deliver:

- existing Pin generator integrated as Renderer V1/control;
- static creative archetypes;
- template/version metadata;
- duplicate/similarity controls;
- experiments;
- AI image cost controls.

Exit:

- creative performance is attributable to renderer/template/archetype.

Implemented in additive migration `20261008120000_growth_creative_lab`, `lib/growth/creative/*`, bounded one-shot job `CREATIVE_LAB_GENERATE`, generated-asset serving, and ADMIN `/admin/growth/creative`. `GrowthAsset`, `GrowthPinCandidate`, and `GrowthExperiment` persist immutable asset bytes/checksums, candidate revisions, exact creative metadata, similarity results, and bounded DRAFT experiment definitions. Eligible destinations are active non-archived Translators and published current Ideas in active categories.

The exact Translator share-image generator remains Renderer V1 control (`v1-control`, `share_image_v1`, `translator-share-control-v1`); the adapter materializes its existing 1000×1500 PNG without changing the established renderer. Deterministic 1000×1500 static implementations cover typography-led, editorial/list, conversation/chat, and minimal-statement, with deterministic line caps that keep maximum valid copy inside each layout. `creative_similarity_v1` uses direct indexed lookups across all candidates for exact content hashes and asset checksums, while fuzzy comparison remains bounded to 100 recent candidates. Near duplication requires strong title similarity plus the same destination or equivalent normalized topic; renderer/template/archetype differences are retained in bounded flags. Exact retry for the same candidate context reuses the candidate; exact matches in another context and near matches are retained as `DEFERRED`; safe novel candidates stop at `READY`.

Before → After now uses full-image AI generation through `gpt-image-2`: the model receives exact verified BEFORE/AFTER copy, exact style-aware CTA and domain, and controls the complete composition and typography. New full-AI candidates receive no deterministic text overlay. The accepted production Pin completed live visual validation, so Phase 10 is **COMPLETE — production deployed and live visual validation approved**. Historical hybrid candidates remain readable.

Phase 10 added no approval, scheduling, publication, Pinterest write, recurring enqueue, cron, or persistent Growth worker.

## Phase 11 — Scheduling and Publishing Engine

**Status:** Complete — production deployed and live publication validated

Deliver:

- exploration/exploitation timing;
- publication queue;
- per-Pin admin approval;
- approved scheduling;
- idempotent Pinterest publishing;
- retries/reconciliation;
- rate-limit handling.

Exit:

- a specifically approved Pin can publish once at the intended time and reconcile correctly.

Implemented in migration `20261009120000_growth_pin_publishing`, `lib/growth/publishing/*`, the existing Pinterest v5 adapter and bounded worker, ADMIN same-origin approval/rejection/cancellation routes, and the Creative Lab publication controls. Each exact Pin requires individual ADMIN approval of its immutable candidate/asset/account/board/time snapshot. `publication_timing_v1` recommends bounded America/New_York cold-start or deterministic explore/exploit windows. A future `pinterest_organic_v1` attribution ref is issued before publication. Pinterest Create Pin is attempted once; safe 429 responses retry, while ambiguous outcomes transition to bounded read-only reconciliation and never blind retry Create Pin.

The two earlier HTTP 401 attempts and their immutable publication/approval/ref/job chains remain historical evidence. After the operator confirmed Standard Access and a complete grant, a specifically approved real Pin published through Creative Lab, appeared on Pinterest, reached its intended destination, and finished `RECONCILED`. Direct Create Pin success legitimately advances `PUBLISHED -> RECONCILED` in the same bounded job; a separate reconcile job is required only for ambiguous outcomes. No provider IDs or timestamps are added here because they were not supplied as documentation evidence. Growth remains disabled and no production cron or persistent worker is enabled.

## Phase 12 — Evergreen and Learning Engine

The additive migration includes `GrowthSettings.evergreenCooldownDays`, bounded to 14–180 days with a conservative 45-day default and editable only through the existing audited ADMIN settings path.

**Status:** Phase 12 v1 and Phase 12.1 v2 production-validated; Phase 12.2 deployed and bounded recovery validated (13/13 requests COMPLETED on 2026-10-17). Existing v2 evidence gaps remain distinct from recovery-job completion.

Deliver:

- evergreen revival;
- fatigue detection;
- learned scheduling improvements;
- creative rotation;
- experiment learning;
- feedback into opportunity scores.

Exit:

- system demonstrates closed-loop adaptation without duplicate flooding.

Migration `20261015120000_growth_evergreen_learning` adds immutable `GrowthLearningRun` evidence, per-destination recommendations, account-specific learned windows, and experiment evaluations. `evergreen_learning_v1` returns only `REVIVE`, `WAIT`, `SKIP`, or `INSUFFICIENT_DATA`; it requires a public destination, fresh analytics, at least 14 observed days, 500 impressions, 10 outbound clicks, a 45-day default cooldown, no active equivalent, no strong fatigue/account issue, and a supported meaningfully different creative. Conversion remains null when attribution is unavailable or no qualified evidence row exists.

`learned_scheduler_v1` extends, but does not replace, `publication_timing_v1`. It retains America/New_York cold start until an account/hour has at least four Pins and 1,000 impressions, then uses deterministic bounded explore/exploit recommendations with collision checks. Approved snapshots are never mutated. Experiment findings require mature variants and remain `INCONCLUSIVE` without a material exposure-normalized difference. `opportunity_feedback_v1` stores bounded adjustments beside the original Phase 7 scores and never rewrites them. `/admin/growth/learning` exposes evidence, explicit evaluate/prepare actions, and audited start/pause/resume/request-analysis/finalize experiment transitions without allocating traffic. Preparation only queues a new Creative Lab candidate, which still requires individual approval. No recurrence, production worker, content write, automatic approval, or Pinterest publication is enabled.

Phase 12 v1 was deployed and production-validated on October 15, 2026; its immutable run produced 355 `INSUFFICIENT_DATA` recommendations. Phase 12.1 v2 then ran successfully with bounded, deduplicated legacy evidence but remained `PARTIAL` because older observations were missing or `PROCESSING`. Phase 12.2 adds an undeployed explicit recovery workflow for those gaps. It changes no learning model version, creates no recurring work, performs no Pinterest write, and leaves Growth and attribution disabled.

## Phase 13 — Economics, Admin and Reporting

**Status:** In progress — Phase 13A usage inventory, Phase 13B budget reservations, Phase 13C archived reports and opt-in Telegram delivery implemented on feature branch; full paid-call enforcement, quotas, scheduling and live validation remain outstanding.

Deliver:

- full AI cost ledger;
- intensity/budget controls;
- complete Growth dashboards;
- warnings/recommended actions;
- report archive;
- Telegram Bot API as preferred single-recipient notification provider;
- optional future email fallback;
- concise executive daily digest.

Exit:

- operator can understand performance, spend and recommended actions from admin/report.

## Phase 14 — Autopilot qualification and production rollout

**Status:** Not started

Deliver:

- full end-to-end tests;
- failure drills;
- security review;
- Pinterest policy review;
- controlled production rollout;
- monitoring thresholds;
- operational runbook;
- final documentation synchronization.

Exit:

- production steady state is `SayTwist Autopilot + Pinterest per-Pin approval`, unless Pinterest explicitly approves a more autonomous publication mode.

## Phase completion rule

No phase is complete until:

- implementation passes required tests;
- docs are synchronized;
- ROADMAP status is updated;
- DECISIONS includes new durable choices;
- deployment/rollback instructions exist where relevant.

### Phase 1 exit and Phase 2 implementation contract

Phase 1 produces only documentation. `IMPLEMENTATION_MAP.md` and `DATA_MODEL.md` are the technical baseline. Phase 2 may implement **only** Growth Prisma foundation/migrations, domain state types, disabled feature flag and kill switch, persistent job foundation, `/admin/growth` shell, typed settings foundation, append-only audit/activity foundation, bounded worker skeleton and meaningful tests. Phase 2 must not connect Pinterest, build `/ideas` pages, autonomously create translators, publish Pins, ingest analytics, implement attribution or generate new creative systems. Deployed DB/storage/scheduler assumptions must be verified before production rollout; they do not block a host-neutral foundation.

### Phase 13 accepted controls and implementation boundary (2026-10-18)

The operator accepted a $2/day and $30/month Growth AI budget, 3 AI images/day, 1 new Translator/day, 3 Translator improvements/day, 2 new Ideas/week, one repair attempt, and 70%/90% budget alerts. Phase 13A is a read-only usage inventory; Phase 13B adds database-backed approved settings with a clear **not yet enforced** admin label. A complete durable ledger, atomic cost reservations, usage pricing, enforcement of content quotas, warnings, delivery and report archive remain required before the Phase 13 completion gate. No production worker or paid autonomy may be turned on based only on these settings.

### Phase 13B implementation progress

An additive AI reservation table and serialized admission service exist on the feature branch. The policy is fail-closed for unknown-priced requests; UTC 70%/90% warnings and image/day accounting are implemented in the reservation service. This is **not wired to paid provider calls yet**, and content-action quotas/report delivery remain unfinished. No claim of hard-spend enforcement is valid before provider integration, verified pricing, and concurrent database tests.

### Phase 13C — WhatsApp delivery preference and adapter

The operator selected OpenWA (self-hosted v5 Easy API) for one WhatsApp daily report recipient. An opt-in, local-only adapter and deterministic digest formatter exist on the feature branch with mock transport tests. **Not yet live:** report snapshot/archive, durable delivery state, a daily job/schedule, sender device pairing, recipient confirmation, and an actual test send. Keep Growth and report sending disabled until operator setup and Phase 14 rollout gates. OpenWA's unpaid send flow applies to **existing chats**; this unofficial WhatsApp Web client can cause account restrictions.


### Phase 13C reporting persistence status (2026-10-18)

The operator confirmed availability of a dedicated WhatsApp **sender** number for OpenWA. Its value is intentionally excluded from Git; the operator has now confirmed a distinct personal recipient privately, also excluded from Git. The existing chat and OpenWA sender pairing still require verification. Implemented on the feature branch: source-backed UTC daily report snapshot/archive and one-attempt delivery state with a database claim before the external OpenWA call. No recurring enqueuer, report admin preview/reconciliation, production sender pairing or real WhatsApp message exists yet. Phase 13 is still **in progress**, and Phase 14 has not started.


### 2026-10-24 — Telegram replaces WhatsApp report transport

The operator abandoned OpenWA and the whatsapp-web.js fallback after session persistence and VPS device-linking failures. Telegram Bot API is now the chosen daily digest provider. The feature branch contains a fixed-host HTTPS adapter, private one-recipient chat validation, server-only credentials, bounded once-only sends, and durable archived report delivery. New delivery rows are labeled TELEGRAM, while old OpenWA history is retained unchanged. The older WhatsApp Phase 13 notes are historical only.

This does NOT enable reporting, schedule a job, send messages, enable attribution, start Growth AI, or satisfy Phase 13 or 14 gates. Operator bot/chat setup, authorized delivery test, full provider-priced usage/cost enforcement, content quotas, warnings UI and controlled production qualification remain required. See TELEGRAM_RUNBOOK.md.


### Phase 13D — one-attempt image provider budget admission (2026-10-24)

On the feature branch, the production OpenAI Creative Lab image provider now reserves a conservative **30 USD cents** through the existing PostgreSQL-serialized Growth budget service **before** its exact `gpt-image-2` / `1024x1536` / `medium` request. The bounded <=7,000-byte text-only prompt uses a dated, fixed OpenAI pricing envelope; unrecognized models, job IDs, prompt sizes or request shapes fail closed. The job-specific reservation key is immutable and may not be reused to authorize a second paid request. The OpenAI SDK automatic retry setting is explicitly 0. This does **not** modify injected test providers or deterministic renderers.

Pessimistic reservations remain counted whether a provider call succeeds, fails, or has ambiguous outcome. **30 cents is not actual spending.** The current provider response does not furnish a verified billed amount; do not reconcile to a fabricated charge. Separate provider usage/cost ledger and exact settlement remain outstanding. Text generation still uses the legacy helper and is **not yet admitted under the Growth spend budget**. Other content-action daily/weekly caps remain unimplemented. Keep Growth disabled; Phase 13/14 are incomplete.


### Phase 13E — Growth text AI admission (2026-10-24)

Supersedes the earlier Phase 13D statement that text was uncovered. The feature branch now guards the **real** Translator and Ideas OpenAI generation providers with one durable budget reservation per decision/attempt, before the API call. Only standard-priced `gpt-4.1-mini` with bounded <=65,536 UTF-8 prompt bytes and <=4,200 output tokens has a dated conservative 20-cent ceiling. Other models or sizes fail closed. The request is pinned to one model, one application-level attempt, and OpenAI SDK maxRetries=0. The existing one explicit repair attempt requires its **own distinct reservation** and can occur only after a successfully returned but invalid content draft, not after a potentially billed network failure.

These reserved ceilings are budget exposure, **not actual invoice amounts**. The pricing registry must be reverified when model/rates change. The shared ordinary SayTwist translation helper retains its prior retry/fallback behavior unless called with the explicit Growth options. Production Growth remains disabled.

**Still not complete:** actual billed provider-cost append-only ledger, reconciliation/settlement, transactional content mutations caps (1 new translator/day, 3 improvements/day, 2 Ideas/week), database concurrency proof, warnings/admin report UX, Telegram setup/live delivery, scheduled recurrence and Phase 14 qualification.


### Phase 13F — transactional content mutation ceilings (2026-10-24)

The feature branch now checks configured content caps under the same PostgreSQL `GrowthSettings` singleton `FOR UPDATE` lock and transaction as the final approved Growth mutation, with counters from immutable version records. The initial accepted limits are 1 new Translator/UTC day, 3 Translator improvement versions/UTC day, and 2 new Ideas/UTC Monday-start calendar week. Idempotently reused existing mutations exit before quota admission, and rollover boundaries are UTC. A limit blocks the content mutation and leaves a waiting-data decision; the agent does not manufacture extra work to fill quotas. Rollback operations remain outside creation/improvement counters, preserving operator recovery options.

The transaction lock ensures competing workers cannot both observe the same remaining slot while applying new content. **Remaining:** avoid unnecessary AI expense by adding a nonauthoritative early quota check before generation; validate with real concurrent PostgreSQL tests and production schema migration. The full append-only actual-cost ledger/settlement, warning/report admin UX, Telegram provisioning and controlled delivery, scheduling, monitoring, phase acceptance and Phase 14 remain unfinished. Keep Growth and attribution off.



### Phase 13G — advisory quota preflight and read-only reservation exposure (2026-10-24)

Before a paid Translator or Ideas create/generation request, the worker performs a read-only **advisory preflight** using the same UTC content quota policy as the final mutation. An exhausted cap blocks before calling the AI provider. The preflight is intentionally not a concurrency guarantee: the authoritative recheck remains under the singleton GrowthSettings PostgreSQL FOR UPDATE lock in the final content-write transaction. Existing genuine model response reservations remain counted, including rejected downstream changes. Fail closed for missing/disabled Growth settings.

The ADMIN /admin/growth/spend screen now shows conservative USD-cent **budget reservation exposure** for the current UTC day/calendar month, image reservations, unreconciled attempts, and a bounded recent list with pricing profile/status. This is read-only local evidence, with **no provider query and no new charge**, and it explicitly labels ceilings as not actual billed costs. The original historical metadata inventory remains separate. The accounting view is limited to Phase 13 reservations, not unrelated site translation usage.

Next required before completion: append-only provider-attempt ledger with actual vs estimated/unknown costs, secure verified settlement and reconciliation workflows, disposable-PostgreSQL concurrency/failure qualification, warning lifecycle and admin management, Telegram recipient setup and live opt-in delivery, report scheduler and Phase 14 controlled rollout. Growth, attribution and outbound report sending remain disabled.



### Phase 13H — ADMIN daily report archive views (2026-10-24)

ADMIN-only read-only pages now provide the latest 30 immutable daily report summaries at `/admin/growth/reports` and individual digest previews at `/admin/growth/reports/growth-YYYYMMDD`. This fixes the destination URL used by archived daily digest messages. The detail page displays UTC archive creation, report version, source digest text, delivery channel/status, attempted/submitted timestamps and provider message ID when known. Provider API acceptance is explicitly not called recipient delivery/reading. Unknown outcomes are not automatically resent.

The archive reader performs bounded PostgreSQL selects after requiring the established ADMIN gate; the page does not generate reports, create delivery rows, call the Telegram API, or modify Growth. It does not provide a manual send/resend button. Phase 13 cost ledger and settlement, warning lifecycle, operator bot/recipient setup, daily schedule, concurrency qualification and Phase 14 remain release blockers.



### Phase 13I — immutable provider-response evidence (2026-10-24)

A new `GrowthAiUsageEvent` table is added on the feature branch, uniquely linked 1:1 to each pessimistic `GrowthAiBudgetReservation`. PostgreSQL check constraints and UPDATE/DELETE triggers make each evidence row append-only and reject incompatible unknown-outcome payloads. Actual Growth Translator, Ideas and Creative Lab OpenAI paths now attempt to append one `RESPONSE_RECEIVED` event after a provider response (before draft parsing and image processing), or `OUTCOME_UNKNOWN` after ambiguous provider/network failure. Failed ledger writes block completion without releasing the reservation. Normal public translator requests are unaffected.

For a bounded `gpt-4.1-mini` text response, when the provider returns complete usage, the ledger also records a conservative **standard uncached-rate estimate in integer micro-USD**, tagged implicitly by the original reservation's immutable pricing profile. No response/usage means unknown, not zero. Image API responses record count evidence when known; their cost estimate remains null unless defensible modality-specific usage is available. No API response has been invoiced or settled by this feature. The ADMIN Growth spend page distinguishes per-request evidence, estimated cost and conservative budget reservation; none is called actual billed spend.

**Not yet complete:** trusted provider-invoice reconciliation and append-only settlement audit; concurrent disposable PostgreSQL integration tests, warning acknowledgment/lifecycle controls, Telegram bot/private recipient and authorized delivery, scheduler, security/rollout review. Enabling production Growth or merging PR #15 remains prohibited.



### Phase 13J — auditable admin budget warning lifecycle (2026-10-24)

The already emitted immutable `GrowthActivity` alerts at 70%/90% budget reservation thresholds are now manageable at `/admin/growth/warnings`. A bounded read-only list computes `OPEN -> ACKNOWLEDGED -> RESOLVED` from additional append-only `GrowthActivity` transitions. Only ADMIN-authenticated same-origin POST requests may change these states, with source event locking and actor-user audit provenance. Acknowledgment must precede resolution; duplicate acknowledgments are idempotent. Original alerts and cost reservations are neither rewritten nor deleted.

Warnings are about **conservative reserved exposure**, not provider-invoiced actual costs. Acknowledgment/resolution is informational only: it does not increase budgets, release reservations, restart Growth, send a message or imply the financial risk has passed. No background notification or scheduled Telegram transport was enabled. The full trusted invoice settlement/reconciliation workflow, real PostgreSQL contention drills, operator bot recipient setup, scheduled report delivery, security review and Phase 14 acceptance are still required.
