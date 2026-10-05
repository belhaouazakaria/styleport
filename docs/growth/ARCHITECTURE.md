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
├── PostgreSQL
├── existing asset storage
├── Pinterest API
├── AI provider(s)
└── notification provider(s)
```

Growth failures must not make the web application unavailable.

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
