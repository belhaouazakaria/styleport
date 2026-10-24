# Admin, Reporting and Cost Controls

## 1. Admin location

Use the existing SayTwist admin.

Primary route:

`/admin/growth`

Do not create a separate Growth subdomain for the initial system.

Reasons:

- shared authentication;
- shared database;
- shared translator/content model;
- shared settings/secrets;
- fewer deployment/security boundaries;
- easier operator workflow.

The worker may be a separate process without becoming a separate web product.

## 2. Growth navigation

Recommended sections:

- Overview
- Opportunities
- Accounts
- Pins
- Analytics
- Content
- Schedule
- Experiments
- Agent Activity
- AI Spend
- Reports
- Warnings
- Settings

## 3. Overview

Top-level cards:

- qualified Pinterest conversions;
- Pinterest landing sessions;
- outbound clicks;
- outbound CTR;
- saves;
- impressions;
- Pins published;
- Pins awaiting approval;
- translators created/updated;
- Ideas pages created/updated;
- AI spend today/month;
- AI cost per qualified conversion;
- system health.

Include deltas versus an appropriate comparison period.

## 4. Agent Activity

Show an auditable decision log:

- what the agent decided;
- action type;
- topic;
- evidence summary;
- confidence;
- estimated value;
- estimated cost;
- actual cost;
- resources created/changed;
- outcome when available.

Do not display hidden model chain-of-thought. Store structured reasons/evidence instead.

## 5. Opportunities

Opportunity cards should show:

- opportunity title;
- content cluster;
- evidence;
- recommended action;
- target account;
- destination type;
- confidence;
- expected value;
- expected spend;
- state.

## 6. Pin approval queue

Because current Pinterest developer rules require the user to choose each Pin to publish, the admin needs an efficient approval workflow.

Each card shows:

- exact image;
- Pin title/description;
- destination;
- account;
- board;
- topic;
- intended posting time;
- reason/evidence;
- duplicate/similarity status;
- estimated role in experiment.

Actions:

- Approve this Pin
- Edit
- Regenerate
- Reject
- Defer

Scheduling happens only after explicit approval of the specific Pin.

## 7. AI spend ledger

Record per AI operation:

- provider;
- model;
- request/job;
- tokens/input/output where available;
- image generation usage;
- estimated or actual monetary cost;
- account;
- translator;
- Ideas page;
- Pin;
- decision ID;
- timestamp.

Aggregate by:

- today;
- week;
- month;
- feature;
- model;
- account;
- content cluster.

## 8. Cost settings

Support:

- daily AI spend ceiling;
- monthly AI spend ceiling;
- generated-image ceiling;
- new translators/day;
- translator edits/day;
- Ideas pages/week;
- Pin candidates/account/day;
- research depth;
- model preference;
- growth intensity preset.

Presets should translate into explicit settings visible to the admin.

## 9. Reporting

One daily executive digest is sent to one configured recipient.

Preferred shape:

**SayTwist Growth · <date>**

- Pinterest visits and delta
- qualified translator uses and delta
- breakout topic/Pin
- Pins published/approved
- translators/Ideas created
- AI spend
- one or two important warnings
- tomorrow's plan

Then:

`Open full Growth Report -> /admin/growth/reports/<id>`

Avoid sending every Pin/action in the message.

## 10. Notification providers

Use an abstraction:

- WhatsApp
- Email
- future providers

WhatsApp is desired, but do not assume it is free.

During implementation:
- verify current WhatsApp Business Platform requirements/pricing;
- configure one recipient;
- use approved templates where required;
- provide email fallback;
- record delivery status.

## 11. Warnings

Warnings do not automatically disable an account unless the user explicitly configures such a rule.

Examples:

- outbound CTR drop;
- qualified conversion drop;
- repeated publishing failures;
- Pinterest auth expiration;
- API warning/rejection;
- unusual account performance;
- high content similarity;
- AI spend acceleration;
- broken attribution;
- stale analytics.

Each warning includes:

- severity;
- evidence;
- recommended action;
- affected resources;
- status;
- admin resolution notes.

## 12. Settings safety

Dangerous/high-impact settings should require deliberate confirmation:

- disconnect Pinterest account;
- clear analytics;
- change attribution definition;
- large spend-limit increase;
- enable a newly approved publishing mode;
- delete Growth history.

## Screen action contract

| Screen | Primary data and actions | High-impact action / access |
|---|---|---|
| Overview | KPI, freshness, health; drill down | ADMIN read |
| Opportunities | evidence/score; defer, dismiss, inspect | ADMIN decisions |
| Accounts | connection, boards, health; reconnect, recommend | connect/disconnect requires ADMIN confirmation |
| Pins | exact image/copy/URL/account/board/time/evidence/similarity; approve, edit, regenerate, reject, defer | approval and publication settings: ADMIN, audited |
| Analytics | Pin and conversion series; filter/export | ADMIN read; export privacy review |
| Content | translators/Ideas, versions; inspect/rollback | rollback ADMIN, audited |
| Schedule | due jobs and approved Pins; defer/cancel | cancel ADMIN, audited |
| Experiments | hypothesis/variants/results; pause/stop | ADMIN, audited |
| Agent Activity | decisions, transitions, errors; inspect | ADMIN read |
| AI Spend | daily/monthly/model/feature and cost per QPC; tune intensity | limit increases ADMIN confirmation |
| Reports | archive/delivery; resend | resend ADMIN, idempotent |
| Warnings | evidence/recommendation; acknowledge/snooze/resolve | ADMIN, no automatic performance account shutdown |
| Settings | kill switch, limits, attribution model, report channel | ADMIN, versioned/audited |

Every AI call records provider/model, tokens or image units, estimated and actual cost when available, pricing version, job/decision/account/translator/Idea/Pin links. Unknown prices are unpriced, never represented as free. Daily/monthly aggregates and cost per QPC use matching windows. The concise digest has one recipient through a provider interface, with WhatsApp if feasible and email fallback. No fixed budget is assumed.

## Phase 2 admin implementation

`/admin/growth` is implemented inside the existing admin shell and navigation. It shows kill-switch state, queued/claimed/running/retryable/terminal job counts, oldest runnable job, latest bounded worker execution, recent structured activity, Phase 4 Pinterest analytics facts, and the safe Phase 5 attribution gate state. `GET /api/admin/growth` returns the same authenticated status. `PUT /api/admin/growth/settings` updates `enabled`, `intensity`, `workerBatchSize`, normalized `ownedDomains`, and bounded attribution enabled/window/retention fields; it uses the ADMIN guard, same-origin validation, strict Zod input and an audited transactional update. The server environment gate is shown only as a boolean and cannot be changed from the UI. Phase 13 cost/report controls remain unimplemented.

Phase 3 adds `/admin/growth/accounts`. It renders three publication-role slots, Sandbox/Production state, configuration readiness, connected identity, scopes, token expiry metadata, sync health, board count and discovered boards. Actions change role, enqueue bounded sync, reconnect through OAuth, or deliberately disconnect. Tokens, ciphertext, app secret and encryption key are never selected for display.

Phase 4 adds `/admin/growth/analytics`. It selects a connected account and 7/30/90-day range, optionally filters Pins by title/ID, shows whole-account totals and a daily table, and returns at most 50 currently eligible Pins ordered by outbound clicks. The UI separately labels inventoried Pins, analytics-relevant Pins, and eligible processed/total progress, and discloses that account totals may include unrelated history. The table includes safe `pinimg.com` previews, resolved board, validated HTTP(S) destination, publish time, core metrics, derived outbound CTR and last sync. The page reads only local PostgreSQL. Its same-origin ADMIN action enqueues bounded work and never waits for backfill or calls Pinterest in the request.

Phase 5 adds `/admin/growth/attribution`. It supports 7/30-day bounded aggregate views for valid Pinterest landing sessions, attributed trusted translations, one-per-session QPC and conversion rate, plus up to 20 ref/Pin/translator dimensions and latest ingest. It shows the environment and database gate separately, fixed model version, window and 30/90 retention policy. An ADMIN same-origin tool issues/reuses one stable active ref for an active analytics-eligible existing Pin and generates a clearly labeled test destination URL; it does not update Pinterest or claim the old Pin contains that URL. A second action enqueues idempotent bounded retention cleanup. The page states that old Pins without `pin_ref` are outside deterministic first-party attribution and that Pinterest outbound clicks are not SayTwist sessions.


## Phase 6 account strategy admin

`/admin/growth/strategy` is an ADMIN-only read surface over bounded local PostgreSQL queries. It shows the three planned roles even when unconnected, portfolio counts/readiness/recommendation/confidence, explicit evidence-quality warnings, recent Pinterest evidence, intent alignment, attribution as `NOT_COLLECTING` with QPC unavailable, up to 100 synchronized boards with advisory eligibility/reasons, and the latest durable monthly review. No credential ciphertext or decrypted token is selected or rendered.

`POST /api/admin/growth/strategy/reviews` requires ADMIN plus the existing exact same-origin check. It accepts no arbitrary strategy parameters and only enqueues the current period/version bounded job. The action cannot enable attribution, call Pinterest, change a role, or mutate an account, board, or Pin.

## Phase 7 opportunity intelligence admin

`/admin/growth/opportunities` is ADMIN-only and server-rendered from local persisted rows. It displays the latest evidence window and quality, Pin cap usage, cluster and opportunity counts, attribution collection state, a bounded Pin-signal table for winner/rising/fatigue observations, and a separate ranked cluster-opportunity table with score/confidence/type/status. A viral Pin remains visible even when concentration or insufficient content depth prevents a cluster opportunity. The POST route requires ADMIN and same origin and only enqueues the daily idempotent job. It cannot change status, publish, call Pinterest, or mutate accounts, boards, Pins, Translators, Ideas, or creatives. Analysis and report queries have fixed caps.

Phase 7 has no AI or external trend cost. Opportunity evidence records cost as `NOT_APPLICABLE`; `NullTrendProvider` makes no request. This must change through a later versioned decision before any paid provider contributes evidence.


### Phase 7 version visibility

The opportunity dashboard orders runs by analysis date, completion time, creation time, and ID, then shows intelligence, clustering, and scoring versions. A corrected v2 same-day run therefore becomes current without hiding or deleting historical v1 evidence.

Production validation confirmed the dashboard's current run as `opportunity_intelligence_v2` / `content_clustering_v2` / `opportunity_scoring_v1`: `KNOWN` evidence, 221 eligible Pins under the 500-Pin cap, eight clusters, two opportunities, attribution `NOT_COLLECTING`, and no structural `translator` or `translators` cluster. The original v1 run remains visible as historical audit evidence.

## Phase 8 Translator Autopilot admin

`/admin/growth/translators` is an ADMIN-only bounded report. It displays model version, unplanned eligible opportunities, at most 50 recent decisions, and at most 50 content versions. Decision rows distinguish decision status, source-opportunity status, whether a Translator mutation exists, and whether the target is inactive or publicly active. Version rows show durable share-image synchronization state and warn when reconciliation is pending; full prompt snapshots remain server-side/admin-only.

The decision and rollback POST routes require ADMIN and exact same origin. The decision route accepts only an opportunity ID. The rollback route accepts a stored target-version ID plus the server-rendered current checksum; it rejects stale pages and never accepts snapshot/category content. No bulk activation control exists. Provider/model, aggregate tokens, bounded response IDs, and attempt count cover initial generation plus repair, while monetary cost remains unknown rather than invented because Phase 13 cost accounting is not implemented.

## Phase 9 Ideas administration

`/admin/growth/ideas` is ADMIN-only and reads bounded local rows. It shows the separate Ideas taxonomy, eligible OPEN opportunity queue, recent Ideas, publication/archive status, current version/checksum, structured current content, and version history. Same-origin ADMIN actions may enqueue one deterministic decision, archive an Idea, or roll back to a selected immutable version with the current checksum as an optimistic-concurrency precondition. Client-supplied content, category IDs, Translator IDs, snapshots, decision outcomes, and publication state are not accepted.

Provider usage aggregates metadata across the initial generation and at most one repair for the existing Growth cost boundary. Tests use an injectable fake and make no live OpenAI call. Phase 9 adds no daily report delivery, recurrence, budget automation, Pinterest mutation, or production scheduler.

## Phase 10 Creative Lab administration and image cost boundary

`/admin/growth/creative` is ADMIN-only and reads bounded local rows: at most 50 recent immutable candidates with image, status, destination, renderer/template/archetype, patterns/treatment, similarity version/result, optional experiment variant, asset checksum/dimensions/bytes/generation kind, and AI provider/model/cost status; plus at most 100 eligible Translators, 100 eligible Ideas, 20 connected accounts, and 25 DRAFT experiments. It exposes no credentials or provider request/response body.

The two exact same-origin POST actions may enqueue one strict `CREATIVE_LAB_GENERATE` job or create one bounded DRAFT experiment. They accept no arbitrary copy, HTML, path, renderer code, provider prompt, outcome, approval, schedule, or publication state. The page provides no approval or Pinterest action.

Deterministic and reused assets have no AI charge. Full-image AI generation is wired in production through the configured model and remains capped at one image unit per job. The reserved boundary is capped at one image unit per job. The asset records bounded provider/model/response metadata, `aiImageUnits=1`, and estimated cost only when the provider supplied it. Unknown cost remains `NULL` and appears as cost unknown. Phase 13 still owns a complete spend ledger, aggregation, budget controls, and reports.

## Phase 12 learning administration

The main Growth settings form exposes the evergreen cooldown as a bounded 14–180-day ADMIN setting (45 days by default); changes use the existing strict same-origin settings route and activity audit.

`/admin/growth/learning` shows the latest run freshness/model versions, `REVIVE`/`WAIT`/`SKIP`/`INSUFFICIENT_DATA` recommendations with confidence and reasons, exposure-normalized performance comparisons, versioned opportunity feedback proposals, account-specific learned windows, and experiment findings including explicit inconclusive states. Actions are explicit evaluation, creative preparation, and audited start/pause/resume/request-analysis/finalize experiment transitions. Preparation can incur the normal Creative Lab image cost only after server-side revalidation; none of these actions approves or publishes. Experiment start requires READY materially distinct variants, and finalization requires a retained post-request evaluation. Phase 12 adds no paid provider or complete cost ledger.


## Phase 13A: read-only historical AI usage inventory (2026-10-18)

The new ADMIN route `/admin/growth/spend` reports 7/30-day existing provider usage evidence from `GrowthDecision`, `GrowthIdeaVersion`, and AI-kind `GrowthAsset`. It deduplicates text operation metadata copied into Idea versions by decision ID or provider response ID, distinguishes unknown token quantities from recorded counts, shows image units, preserves unknown prices, and discloses a 2,000-row-per-source cap.

**This is not the Phase 13 full ledger or actual spend.** Historic model token prices are not inferred and planned `GrowthDecision.estimatedCost` is not a charge. Only existing estimated AI image costs are separately displayed and clearly labeled estimated. The route performs no paid API requests or content mutation.

Remaining before Phase 13 completion: append-only idempotent cost entries created on every provider call (including failed/billed requests and repair attempts); versioned priced-vs-unpriced actual/estimated semantics; atomic daily/monthly reservation and hard-cap enforcement; budget admin settings, audit confirmation and monitoring; full reports/archive, warning lifecycle, digest generation, and delivery provider. Obtain explicit numeric budgets and channel/recipient configuration before activating spend or delivery gates. Keep Growth/attribution disabled until production qualification.

## Approved Phase 13 operating limits

Configuration in `GrowthSettings`, migration `20261018120000_growth_economics_limits`: `aiDailyBudgetCents=200`, `aiMonthlyBudgetCents=3000`, `aiImagesPerDayCap=3`, `translatorCreatesPerDayCap=1`, `translatorUpdatesPerDayCap=3`, `ideaCreatesPerWeekCap=2`. Thresholds: 70% and 90% warnings. USD cents, UTC daily/calendar monthly buckets and weekly calendar boundaries (to be finalized alongside enforcement). Hard limits must be enforced with transactional reservations before provider requests or public content mutations; settings persistence alone does **not** enforce them.

The admin currently displays these values as **configuration only**. Until ledger/pricing admission and full content quota gates are implemented and tested, production automation must remain disabled. Paid usage from unrelated normal translation is explicitly outside the Growth ledger/budgets.

### Phase 13B financial admission foundation

The isolated Phase 13 branch includes `lib/growth/economics/budget-policy.ts` and `reservations.ts`, backed by `GrowthAiBudgetReservation`. The policy rejects unknown prices and invalid amounts, checks **both** UTC daily and monthly limits, and recognizes 70%/90% warning crossings. Database admission serializes on the existing `GrowthSettings` row, counts image reservations, persists one immutable request reservation, and retains the upper bound for accounting after reconciliation. This is deliberately pessimistic.

Provider interception and an authenticated/versioned model pricing source are still required before real paid work. In particular, OpenAI model fallbacks and SDK retries must not make extra paid requests behind one reservation. Content-action quotas must be checked transactionally at the apply boundary. The AI usage inventory remains **historical partial metadata**, not a full paid-usage ledger. Phase 13 is not complete.

### OpenWA WhatsApp delivery selection

Operator decision: daily executive reports should go to a **single recipient through OpenWA**, not an email-first report. `lib/growth/reporting/openwa.ts` implements the opt-in v5 HTTP transport to `127.0.0.1` only, validates one `@c.us` chat recipient, requires `X-API-Key`, checks live session readiness, and never retries unknown send outcomes. `lib/growth/reporting/digest.ts` formats a conservative summary that labels uncollected conversion metrics and unpriced AI spend as unavailable.

This transport is not yet connected to a durable report archive, once-per-day job or production schedule. Do not claim WhatsApp reports are operational before the recipient initiates a chat, the sender device is paired, and a controlled test proves submission. OpenWA is unofficial and may be restricted by WhatsApp/Meta. No automatic email fallback or multiple recipients. See `OPENWA_RUNBOOK.md`.


## 2026-10-24 Phase 13C transport supersession

Earlier WhatsApp provider sections in this specification are superseded. Telegram Bot API is now the preferred one-recipient provider, with email a possible future fallback. The feature branch uses a provider-independent plain-text digest and archived UTC daily reports, fixed-host HTTPS Telegram submission, opt-in server-only bot token/private chat ID, and durable one-attempt delivery claims. A successfully returned Telegram message ID means API submission, not recipient read confirmation.

No Telegram bot has been provisioned through this feature, no message was sent, and no recurrence or production activation is enabled. Actual AI provider-cost interception, settlement, content quotas, warning lifecycle, reports UI, operator confirmation and rollout remain open. See TELEGRAM_RUNBOOK.md.


### Phase 13D image spending safeguard — partial, not complete

The opt-in Growth Creative Lab OpenAI image provider has a strict **30-cent per-request upper-bound reservation**, recorded before its fixed `gpt-image-2` medium 1024x1536 call. The conservative allowance is counted toward both USD daily/monthly budgets and the 3-images/day reservation cap. Failed and ambiguous attempts retain their budget reservations; no automatic retry is allowed. Unknown model prices/shapes fail closed.

This is not a statement of actual billed cost, a reconciled ledger, or complete spend enforcement. **Text provider calls and content mutation quotas still require integration**, plus independent database concurrency tests, report/admin reconciliation and release gates. Until the entire boundary is qualified, keep Growth and recurring sending disabled.
