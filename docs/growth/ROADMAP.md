# Growth Agent Roadmap

**Total planned phases: 14**

Status values:
- Not started
- In progress
- Blocked
- Complete

## Phase 1 — Growth specification and policy architecture

**Status:** Not started

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

**Status:** Not started

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

## Phase 3 — Pinterest integration

**Status:** Not started

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

## Phase 4 — Analytics ingestion

**Status:** Not started

Deliver:
- Pin/account sync;
- metric snapshots;
- historical backfill within API limits;
- top Pin reporting;
- analytics freshness/health;
- baseline admin charts/tables.

Exit:
- analytics match Pinterest source within understood tolerances.

## Phase 5 — SayTwist attribution

**Status:** Not started

Deliver:
- Pin refs/UTM strategy;
- landing events;
- translator completion events;
- embedded translation events;
- attribution model/version;
- qualified conversion KPI.

Exit:
- test Pin/session can be traced to completed translation.

## Phase 6 — Account Strategy Agent

**Status:** Not started

Deliver:
- intent-driven account model;
- portfolio health;
- board/account eligibility;
- monthly Account Opportunity Review;
- account-count recommendation logic.

Exit:
- agent can explain why three accounts are/are not currently appropriate.

## Phase 7 — Opportunity Intelligence

**Status:** Not started

Deliver:
- winner/rising/fatigue detection;
- topic/content clustering;
- inventory gaps;
- opportunity scoring;
- confidence/sample thresholds;
- optional TrendProvider abstraction.

Exit:
- opportunities are generated from real measurable evidence.

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
