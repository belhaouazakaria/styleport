# Technical Architecture

## 1. Architectural direction

Growth is part of the SayTwist application and database, with a separately runnable Growth worker/process.

Conceptual layout:

```text
saytwist.com
├── public translator/product surfaces
├── /ideas
└── /admin/growth

Processes
├── SayTwist web
└── SayTwist Growth worker

Infrastructure
├── PostgreSQL 18 (self-hosted on the VPS; existing `saytwist` database)
├── existing asset storage
├── Pinterest API
├── AI provider(s)
└── notification provider(s)
```

Growth failures must not make the web application unavailable.

Production SayTwist connects locally to PostgreSQL at `127.0.0.1:5433` as application role `saytwist_app`. Growth shares this existing local database architecture unless a later durable decision changes it. Persistent scheduled jobs and bounded workers are required to protect database capacity; Growth must not introduce aggressive always-on polling.

## 2. Component boundaries

### Growth domain service

Owns:

- opportunities;
- decisions;
- plans;
- experiments;
- account strategy;
- scheduling logic;
- revival logic.

### Pinterest adapter

Owns:

- OAuth;
- account metadata;
- boards;
- Pins;
- publishing;
- analytics;
- rate-limit/error translation.

### Attribution service

Owns:

- Pin refs;
- first-party landing/conversion events;
- conversion attribution;
- KPI aggregation.

### Content service integration

Owns Growth-triggered:

- translator creation/update;
- Ideas creation/update;
- internal links;
- version history.

### Creative service

Owns:

- Renderer V1 integration;
- future templates;
- generated assets;
- creative metadata;
- similarity checks.

### Cost ledger

Owns AI usage/cost records.

### Reporting service

Owns:

- daily report materialization;
- notification delivery;
- report archive.

## 3. Jobs

Growth operations must use persistent jobs rather than in-request long-running work.

Representative jobs:

- `pinterest_sync_accounts`
- `pinterest_sync_pins`
- `pinterest_sync_analytics`
- `growth_daily_analysis`
- `growth_opportunity_score`
- `growth_create_translator`
- `growth_improve_translator`
- `growth_create_idea`
- `growth_generate_pin_candidate`
- `growth_schedule_approved_pin`
- `growth_publish_pin`
- `growth_reconcile_publication`
- `growth_daily_report`
- `growth_monthly_account_review`

The exact job mechanism should align with SayTwist's existing stack and operational constraints.

## 4. Scheduling

Separate:

- analysis schedule;
- analytics sync schedule;
- content-generation schedule;
- approved Pin publication schedule;
- daily report schedule;
- monthly account review.

Do not use constant aggressive polling.

Prefer explicit scheduled jobs/cron-driven enqueueing and bounded workers.

### Phase 2 concrete job runtime

The implemented command is `npm run growth:worker`. It performs one bounded run and exits: read the kill switch, promote at most one configured batch of due retries, recover at most one configured batch of stale leases, claim and process no more than the configured batch size, then record completion status. The configured batch defaults to 5 and cannot exceed 25. There is no `setInterval`, sleep loop, cron entry or PM2 process.

Each invocation claims its configured batch with one PostgreSQL statement in one transaction: a bounded, ordered candidate CTE selects eligible rows with `FOR UPDATE SKIP LOCKED`, then an `UPDATE ... RETURNING` writes claim ownership, lease timestamps and attempt counts before commit. Eligibility is `PENDING`, `runAfter <= CURRENT_TIMESTAMP`, and `attemptCount < maxAttempts`; ordering is `runAfter`, then `createdAt`, and the `(status, runAfter)` index supports the queue prefix. `JOB_CLAIMED` activities are written in that transaction. There is no per-job claim query loop.

An attempt is consumed when a claim commits, before the handler starts. A crash after claim therefore consumes one attempt. Stale recovery clears ownership and returns the same job to `PENDING` only when `attemptCount < maxAttempts`; recovery itself does not increment, and the next claim consumes the next attempt. At the attempt limit, failure or stale recovery becomes `FAILED_TERMINAL`, so `maxAttempts=3` permits at most three claims/executions. The default is 3 and the database/service upper bound is 5. Worker state changes compare job ID, expected state and a unique per-invocation lease owner. Retryable failure uses capped exponential backoff from 30 seconds to 30 minutes. Due retry rows are promoted only during an explicit bounded invocation.

`GrowthWorkerHeartbeat` is a bounded status view: the stable configured worker ID is its primary key and repeated invocations upsert that row. A random invocation ID fences updates so an older overlapping invocation cannot overwrite the newer invocation's status. Job and `GrowthActivity` rows retain history; heartbeat rows do not represent invocation history and no idle heartbeat loop exists.

## 5. Suggested data entities

Final names may change, but the semantic model should cover:

### Pinterest connection

`GrowthPinterestAccount`

- id
- pinterestAccountId
- role/intent
- displayName
- status
- encrypted credential reference
- scopes
- token metadata
- connection health
- createdAt/updatedAt

### Board

`GrowthPinterestBoard`

- accountId
- pinterestBoardId
- name
- status
- synced metadata

### Pin candidate

`GrowthPinCandidate`

- accountId
- boardId
- content/destination reference
- title
- description
- image asset
- renderer/template metadata
- attribution reference
- recommendedPublishAt
- approval state
- similarity score/flags

### Publication

`GrowthPinPublication`

- candidateId
- pinterestPinId
- approvedAt
- scheduledAt
- publishedAt
- state
- attempts
- idempotency key
- API result/error

### Metric snapshot

`GrowthPinMetricSnapshot`

- publication/pin ID
- snapshot date/time
- metric values
- source
- completeness

### Attribution event

`GrowthAttributionEvent`

- opaque visitor/session reference
- Pin ref
- event type
- translator/content reference
- timestamp
- attribution version

### Content cluster

`GrowthContentCluster`

- topic/name
- status
- feature vector/tags
- related translators
- related Ideas pages
- performance aggregates

### Opportunity

`GrowthOpportunity`

- cluster
- opportunity type
- evidence
- score
- confidence
- proposed action
- state

### Decision

`GrowthDecision`

- opportunity
- decision type
- structured reasons
- expected metrics
- estimated cost
- created resources
- measured outcome

### Experiment

`GrowthExperiment`

- hypothesis
- dimension
- variants
- primary KPI
- status
- result

### AI cost

`GrowthAiUsage`

- provider/model
- job/decision
- tokens/units
- cost
- related content/account

### Warning

`GrowthWarning`

- severity
- category
- evidence
- recommendation
- state

### Report

`GrowthReport`

- date
- summary
- KPI snapshot
- actions
- spend
- warnings
- planned next actions
- delivery state

## 6. Content versioning

Autonomous changes to translators and Ideas content need version history.

Store enough data to:

- identify agent/user;
- see before/after;
- restore prior version;
- link change to decision/job.

## 7. Idempotency

Mandatory for:

- Pinterest publishing;
- analytics ingestion;
- report delivery;
- scheduled Growth runs;
- AI content assembly where retries could duplicate records.

## 8. Credentials and secrets

Never store secrets in:

- Git;
- public API responses;
- logs;
- analytics events.

Use environment/secret storage and encrypted database fields where appropriate.

## 9. Observability

Track:

- worker heartbeat;
- job queue depth;
- job failures;
- external API latency/errors;
- Pinterest sync freshness;
- cost ledger freshness;
- attribution pipeline freshness;
- report delivery status.

Expose meaningful health in `/admin/growth`.

## 10. Scalability

Design so a future social platform can be added through adapters without rewriting the Growth domain.

Do not make generic abstractions so broad that Pinterest implementation becomes unnecessarily complex. Pinterest-first, adapter-ready.

## Repository-grounded target architecture

`IMPLEMENTATION_MAP.md` is the canonical file-level audit and reuse matrix. `DATA_MODEL.md` is the exact proposed schema/state contract. Growth domain modules belong in `lib/growth/*`; web routes in `app/(admin)/admin/growth`, `app/api/admin/growth`, and `app/(public)/ideas`; UI in `components/admin/growth` and `components/public/ideas`; bounded process in `workers/growth-worker.ts`; explicit scheduled enqueue/run scripts in `scripts/`; Prisma additions in schema and timestamped migrations in future phases. Split Pinterest adapter, analytics ingest, attribution, cluster/opportunity engine, translator adapter, Ideas service, creative/V1 adapter, schedule/publish service, cost ledger, report providers and job runtime by responsibility. Core translation and public reads must never synchronously depend on Growth health.

The existing editorial worker shows transactional claiming and retry patterns, but has a periodic DB poll. Growth uses host-scheduled explicit enqueueing and bounded `--once` execution, with due-at jobs, lease/heartbeat while active, idempotency, exponential capped retry, terminal state, kill switch and quota stop. Before the standalone worker imports Growth modules, it loads Next environment files with `@next/env`; this preserves Next-style production configuration without manual exports. Actual host scheduler and PM2 state require deployment verification; no cron is configured by this phase.

## Phase 3 Pinterest adapter

`lib/growth/pinterest/*` owns all API v5 access. Configuration selects exactly the production or Sandbox base. Its server-side status projection contains only configured state, missing variable names and selected environment; app secrets, encryption keys and OAuth credentials are never included. OAuth state is durable for multi-process replay safety. Credentials are excluded from admin reads; refresh uses `SELECT ... FOR UPDATE`, one bounded token call, full access/refresh token replacement and a credential-version increment. Missing or invalid local Pinterest configuration is terminal for a sync job because it cannot recover through a remote retry.

The adapter does not retry HTTP internally. It uses ten-second abort signals, validates important JSON, captures `x-ratelimit-*`, honors `Retry-After` through bounded job scheduling, and classifies 401/403/404/429/5xx. Board sync caps at ten pages and 1,000 boards, rejects bookmark loops, and commits only after a complete fetch.

## Phase 4 analytics ingestion

The existing adapter now owns all Phase 4 reads. `analytics-contract.ts` centralizes the five accepted metric identifiers, UTC date validation, the 90-day initial range, seven-day correction window and per-job budgets. `analytics.ts` persists inventory and daily rows through idempotent UPSERTs, stores resumable inventory/backfill state, and creates namespaced continuation jobs. It performs no live calls in a page render. `reporting.ts` uses bounded PostgreSQL aggregates, a grouped top-50 Pin query and one metadata query, avoiding per-row database lookups.

The complete account inventory and detailed analytics working set are separate. `GrowthPinterestPin.analyticsEligible` is derived from its stored destination and the versioned singleton `ownedDomains`; exact parsed hostnames only are accepted. Reclassification reads only Pin IDs/destinations, clears eligibility once, restores eligible IDs in chunks of 250, and recomputes processed/total from active eligible rows. Inventory pages use one parameterized PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` for at most 250 Pins. A completed inventory remains fresh for 24 hours; an explicit sync during that window performs local reclassification and queues account plus eligible Pin analytics, while a partial or stale inventory is reconciled first. Pin job payloads mark prepared chains; continuations read current persisted eligibility without repeating full-account reclassification. A pre-upgrade job without the marker self-prepares once and creates only marked continuations.

Inventory jobs read at most three 250-Pin pages per invocation, ten pages/2,500 Pins per complete scan, and mark unseen Pins inactive only after completion. Pin jobs read at most eight individual Pins per invocation. Account analytics uses one daily request and one top-50 request when rate-limit headroom remains. A header-reported remaining budget of five or less ends further calls in that job. The closed-beta multiple-Pin endpoint is not implemented.

## Phase 5 first-party attribution

`lib/growth/attribution/*` separates configuration, contracts, traffic defense, ref lifecycle, URL construction, session/event persistence, retention and reporting. `GrowthAttributionRef` is future-compatible: its Pin relation is nullable, destination path is independent, and an issued ref remains stable when a later publication gains an external Pin. Existing-Pin issuance requires `isActive=true`, `analyticsEligible=true`, and a canonical same-origin destination. It performs no Pinterest call.

Public collection is double-gated. Server-only `GROWTH_ATTRIBUTION_COLLECTION_ENABLED` defaults false, and singleton `GrowthSettings.attributionEnabled` defaults false. Both must be true; `GrowthSettings.enabled` continues to control autonomous worker execution only. Disabled requests return a safe no-op before ref/session/event persistence and set no cookie. Public endpoints accept bounded JSON, enforce the canonical browser Origin, use strict Zod contracts, transient IP-based rate limiting without persisting IP/hash, and reject HEAD/prefetch/known-bot traffic.

The cookie contains only 256-bit random URL-safe data and uses HttpOnly, SameSite=Lax, Path=/, production Secure and a Max-Age equal to the configured attribution window. PostgreSQL stores only SHA-256. The 30-day database session-detail retention is independent of the seven-day default browser/window lifetime. Unknown or expired browser-supplied tokens are rotated rather than adopted, preventing fixation; a later qualified landing creates a new session rather than reviving retained expired detail. A valid landing within an active session preserves first touch, updates latest touch, refreshes the server-timestamped window/cookie, and records an idempotent event. Client view/input events resolve the active translator by slug and never carry text, lengths, database IDs or arbitrary metadata.

After core generation succeeds, `/api/translate` must first persist the SUCCESS `TranslationLog`. It then hashes the cookie token and records completion best-effort. The completion transaction locks the session row, verifies the window, deduplicates by TranslationLog/event key, freezes the current latest ref/log/translator on the first conversion, and increments the ref/translator daily aggregate. The row lock and uniqueness constraints prevent two simultaneous successes from creating two primaries. Attribution failure is caught after the trusted log and cannot change translation output or status.

Session detail defaults to 30 days and event detail to 90 days. Event-to-session deletion is `SET NULL`; aggregate rows are independent of session/event deletion. The landing-session aggregate increments once when a new qualified attribution session is created, not for every landing event, so QCR uses unique qualified sessions. Event uniqueness and aggregate mutation share the transaction. `ATTRIBUTION_RETENTION_CLEANUP` deletes at most 500 expired detail rows per explicit bounded run and has no scheduler, cron or persistent worker. Admin reporting reads aggregate rows in bounded 7/30-day windows and never scans all TranslationLog rows.


## Phase 6 deterministic account strategy

`lib/growth/strategy/*` is separate from Pinterest transport and evaluates persisted local evidence only. `account_strategy_v1` fixes the three intent roles and uses the last 28 complete UTC days. Queries are bounded to three active-role accounts, 100 boards, 2,500 active Pins, 84 account daily rows and 2,500 grouped eligible-Pin metric rows. OAuth ciphertext is not selected. BigInt counters remain BigInt through aggregation; percentages use integer scaled division, return unavailable on a zero denominator, and only convert the bounded percentage result to Number.

The strategy contracts distinguish `KNOWN`, `UNKNOWN`, `INSUFFICIENT_DATA`, and `NOT_APPLICABLE`. Unconnected roles have no fabricated metrics. When either attribution collection gate is false, capability remains available but collection is `NOT_COLLECTING`; QPC is unavailable and confidence is reduced. Full Pin inventory informs account/board composition, while detailed performance is limited to eligible owned-domain Pins.

Intent alignment uses deterministic destination-path and stored metadata rules, with explicit insufficient-data thresholds. Board eligibility is advisory and requires usable connection/auth state, active/public metadata, and acceptable role alignment; it performs no Pinterest mutation. Portfolio logic protects against top-Pin concentration and cannot recommend a fourth account in v1 because `account_strategy_v1` does not consume the separately persisted Phase 7 cluster, distinct-concept and content-depth evidence.

`GrowthAccountStrategyReview` stores one canonical bounded review per review month/model version. `ACCOUNT_STRATEGY_REVIEW` uses a period/version idempotency key, local reads, an UPSERT, and a compact activity event. The existing disabled-by-default one-shot worker and kill switch apply. The admin enqueue route is ADMIN/same-origin and supplies no arbitrary model or evidence. No AI, scheduler, cron, PM2 worker, external API call, account action, board action, or Pin action is introduced.

## Phase 7 deterministic opportunity intelligence

`lib/growth/opportunity/*` is a local evidence boundary. It never imports Pinterest transport or OpenAI. A daily bounded worker analysis reads at most 500 active analytics-eligible Pins and their last 28 complete UTC days of persisted metrics, plus safe account analytics state, canonical Translator/category metadata, the existing strategy baseline, and attribution aggregates only when collection is enabled. Recent and previous seven-day windows support velocity; four weekly buckets require sustainable activity. Full synchronized inventory remains broader and is retained for account and board strategy.

Historical `content_clustering_v1` tokenized full destination paths and was retained after live validation exposed structural route-token collapse. Current `content_clustering_v2` never tokenizes route structure for recognized translator URLs, prefers resolved Translator/category metadata and slug tokens, and applies deterministic document-frequency filtering. `opportunity_intelligence_v2` permits a corrected same-day run while retaining v1. It classifies winner, rising, fatigue, and inventory-gap evidence only after explicit minimum observations and volume. `opportunity_scoring_v1` records bounded 0–100 components and duplication, concentration, and evidence-risk penalties. When QPC is unavailable, conversion is absent and remaining weights are renormalized. A `TrendProvider` interface permits a later provider; `NullTrendProvider` is the only implementation and performs no call.

Immutable daily runs own cluster snapshots, capped membership, and opportunities. Stable cluster identity is versioned separately. The daily job and analysis-row unique key make repeated enqueue/execution idempotent; closed historical opportunities are never reopened. The admin report reads at most 50 opportunities and 50 snapshots. No autonomous recurrence is configured.


### Phase 7 signal and opportunity separation

`GrowthPinSignal` records what persisted Pin metrics show: `WINNER`, `RISING`, or `FATIGUE`, with strong/cautious strength, confidence, evidence quality, strict metric evidence, and a date/model/Pin/type dedupe key. Signals are capped at 1,500 per run and admin reads at 50. A single sustained Pin may be a winner even when unclustered or highly concentrated.

Cluster opportunities are a separate qualification step. Winner and rising opportunities require multiple meaningful contributors and reject clusters above 80% top-Pin outbound concentration. Inventory gaps require multi-Pin depth. Fatigue opportunities require strong multi-signal fatigue and multiple previously meaningful contributors. Stale data suppresses rising/fatigue opportunity creation; missing recent observations never imply decline. This preserves viral-outlier visibility without treating one Pin as proof of a niche.
