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

The existing editorial worker shows transactional claiming and retry patterns, but has a periodic DB poll. Growth uses host-scheduled explicit enqueueing and bounded `--once` execution, with due-at jobs, lease/heartbeat while active, idempotency, exponential capped retry, terminal state, kill switch and quota stop. Actual host scheduler and PM2 state require deployment verification; no cron is configured by this phase.

## Phase 3 Pinterest adapter

`lib/growth/pinterest/*` owns all API v5 access. Configuration selects exactly the production or Sandbox base. OAuth state is durable for multi-process replay safety. Credentials are excluded from admin reads; refresh uses `SELECT ... FOR UPDATE`, one bounded token call, full access/refresh token replacement and a credential-version increment.

The adapter does not retry HTTP internally. It uses ten-second abort signals, validates important JSON, captures `x-ratelimit-*`, honors `Retry-After` through bounded job scheduling, and classifies 401/403/404/429/5xx. Board sync caps at ten pages and 1,000 boards, rejects bookmark loops, and commits only after a complete fetch.
