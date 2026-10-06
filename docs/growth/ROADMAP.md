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

Implemented in migration `20261005170000_growth_pinterest_integration`, `lib/growth/pinterest/*`, `/api/admin/growth/pinterest/*`, and `/admin/growth/accounts`. Mocked HTTP/OAuth tests and disposable PostgreSQL tests pass. Production validation completed with Pinterest Trial access: the main SayTwist Business account connected through OAuth with the complete required scope set, account synchronization succeeded, and a bounded worker completed account and board synchronization successfully. Growth was disabled again after validation and remains disabled until later phases make scheduled execution ready.

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

Production deployed and live validated with migration `20261006190000_growth_account_strategy`; build and health/ready checks passed. The first production review for `2026-10` returned `COMPLETE_BASELINE_PORTFOLIO`, recommended three accounts at 60% confidence, and recorded `ATTRIBUTION_NOT_COLLECTING`, `ROLE_NOT_CONNECTED`, `BASELINE_PORTFOLIO_INCOMPLETE`, and `NO_EXPANSION_EVIDENCE`. Implemented in deterministic `lib/growth/strategy/*`, bounded `ACCOUNT_STRATEGY_REVIEW`, and `/admin/growth/strategy`. Model `account_strategy_v1` evaluates the last 28 complete UTC days, always represents the three user-intent roles, and distinguishes missing/unavailable evidence from zero. Health, readiness, intent alignment, board eligibility, portfolio recommendation, deterministic confidence, and Pin concentration are explainable. Monthly reviews are canonical per month/model and write bounded activity. Because attribution collection is intentionally disabled, QPC remains unavailable and confidence is limited. V1 cannot recommend a fourth account because `account_strategy_v1` does not consume the durable cluster/content-depth evidence now implemented separately in Phase 7. No Pinterest/API mutation, account/board/Pin automation, AI, autonomous recurrence, cron, or PM2 Growth worker was added. Phase 8 is next.

## Phase 7 — Opportunity Intelligence

**Status:** Complete (implementation validated; production not yet deployed)

Deliver:
- winner/rising/fatigue detection;
- topic/content clustering;
- inventory gaps;
- opportunity scoring;
- confidence/sample thresholds;
- optional TrendProvider abstraction.

Exit:
- opportunities are generated from real measurable evidence.

Implemented in additive migration `20261006220000_growth_opportunity_intelligence`, deterministic `lib/growth/opportunity/*`, bounded `OPPORTUNITY_INTELLIGENCE_ANALYSIS`, and `/admin/growth/opportunities`. Models `opportunity_intelligence_v1`, `opportunity_scoring_v1`, and `content_clustering_v1` use the last 28 complete UTC days, recent/previous seven-day comparisons, four weekly buckets, and no AI. Analysis reads at most 500 active analytics-eligible Pins plus bounded local metrics, account state, latest strategy state, Translator/category metadata, and attribution aggregates only when collection is enabled. It persists Pin-level winner/rising/fatigue signals separately from stable clusters, explicit capped membership snapshots, immutable daily analysis runs, and ranked advisory cluster opportunities. Viral Pins remain visible, while contributor-depth and concentration rules prevent one outlier from proving a topic. Missing QPC is unavailable rather than zero; conversion-specific types are emitted only while attribution is collecting. No Pinterest call or mutation, publishing, Ideas, Translator mutation, creative generation, scheduling, cron, or PM2 Growth worker was added. Growth and attribution collection remain disabled. Phase 8 is next and covers Translator Autopilot.

## Phase 8 — Translator Autopilot

**Status:** Not started

Deliver:
- create/improve translator actions;
- deduplication;
- quality validation;
- version history;
- rollback;
- safe category handling.

Exit:
- autonomous translator actions are reproducible, auditable and reversible.

## Phase 9 — SayTwist Ideas

**Status:** Not started

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

## Phase 10 — Creative Lab

**Status:** Not started

Deliver:
- existing Pin generator integrated as Renderer V1/control;
- static creative archetypes;
- template/version metadata;
- duplicate/similarity controls;
- experiments;
- AI image cost controls.

Exit:
- creative performance is attributable to renderer/template/archetype.

## Phase 11 — Scheduling and Publishing Engine

**Status:** Not started

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

## Phase 12 — Evergreen and Learning Engine

**Status:** Not started

Deliver:
- evergreen revival;
- fatigue detection;
- learned scheduling improvements;
- creative rotation;
- experiment learning;
- feedback into opportunity scores.

Exit:
- system demonstrates closed-loop adaptation without duplicate flooding.

## Phase 13 — Economics, Admin and Reporting

**Status:** Not started

Deliver:
- full AI cost ledger;
- intensity/budget controls;
- complete Growth dashboards;
- warnings/recommended actions;
- report archive;
- WhatsApp provider if viable;
- email fallback;
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
