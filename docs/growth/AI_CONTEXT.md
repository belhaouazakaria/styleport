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

Phase 3 uses migration `20261005170000_growth_pinterest_integration`, `lib/growth/pinterest/*`, OAuth routes under `/api/admin/growth/pinterest`, and `/admin/growth/accounts`. It connects existing Pinterest accounts through API v5 Authorization Code OAuth, stores AES-256-GCM encrypted rotating credentials, and synchronizes account metadata and public boards through bounded jobs. The standalone worker loads Next `.env*` files before importing Growth modules, so `.env.local` production configuration needs no manual exports. Configuration status is server-only and safe to render because it excludes all secret values. Local Pinterest configuration errors are terminal jobs, never retry loops. Phase 3 live production validation is complete: the main Business account connected with all required scopes, and bounded account/board synchronization succeeded.

Phase 4 is complete and live validated. It uses migrations `20261005210000_growth_pinterest_analytics` and `20261006010000_growth_pinterest_relevance`, bounded inventory/account/single-Pin analytics jobs, and `/admin/growth/analytics`. Production verified account analytics, 720 active inventory Pins, 221 active analytics-relevant Pins, a completed 221/221 detailed history backfill, `FRESH` analytics state, zero queued jobs, zero active jobs, and healthy handling under the observed 60 requests/60 seconds limit. It never uses the closed-beta multiple-Pin endpoint, never calls a Pinterest write endpoint, and contains no attribution, opportunity, Ideas, publication, scheduling, cron or PM2 work. Growth was disabled again after validation pending later scheduled/autonomous phases.

The media parser is tolerant of Pinterest's documented polymorphic image/video/mixed media while keeping Pin identity and page structure strict. Inventory keeps all account Pins for strategy and future board lifecycle work. Detailed Pin analytics is restricted to active Pins linking to exact configured owned hostnames: `saytwist.com`, `www.saytwist.com`, and `translator.whattypeof.com`. Existing inventory is reclassified locally; progress means eligible owned-domain Pins only; historical unrelated metrics are retained. The legacy queued pre-upgrade continuation live validated one-time self-preparation through the optional `relevancePrepared` marker and reconciled old all-Pin progress to eligible progress. Complete inventory is reused for 24 hours and page persistence uses a bounded parameterized bulk UPSERT. Phase 4 itself implemented no attribution.

Phase 5 is complete, production deployed, and intentionally not collecting. Migration `20261006150000_growth_attribution`, `lib/growth/attribution/*`, public landing/event routes, server-authoritative translation completion, and `/admin/growth/attribution`. Model `pinterest_organic_v1` preserves first and latest eligible Pinterest touches, uses a seven-day window refreshed by qualified landings, and freezes the latest eligible touch when the first trusted SUCCESS `TranslationLog` creates the session's single qualified conversion. Additional successful translations are attributed usage. Opaque `pin_ref` records and browser tokens use cryptographic randomness; only the session-token SHA-256 hash is stored. Attribution tables never store translation text, raw IP, IP hash, raw user agent, email, or authentication identity.

Public collection is double-gated by server-only `GROWTH_ATTRIBUTION_COLLECTION_ENABLED=true` and `GrowthSettings.attributionEnabled=true`. Both default false, the autonomous Growth kill switch is separate, and production collection is intentionally disabled pending explicit privacy/consent rollout approval. All 19 migrations through Phase 5 were deployed, the production build and health/ready checks passed, and validation confirmed no visitor attribution rows and no attribution cookie. Session/event detail defaults to 30/90 days; bounded manual retention cleanup preserves daily aggregates. Existing Pins without an issued `pin_ref` are not deterministically attributable. No fuzzy, Referer, or UTM-only attribution exists.

Phase 6 is production deployed and live validated in migration `20261006190000_growth_account_strategy`, `lib/growth/strategy/*`, job `ACCOUNT_STRATEGY_REVIEW`, and `/admin/growth/strategy`. Deterministic model `account_strategy_v1` uses the last 28 complete UTC days and always represents the three planned intent roles. Missing roles and disabled attribution remain explicit unavailable states, never fake zero performance. The monthly review is canonical per review month/model, bounded to three roles, 100 boards, 2,500 Pins, 84 account metric rows, 2,500 grouped Pin metric rows, and 64 KiB validated evidence. Board eligibility and account-count recommendations are advisory. Phase 6 uses no AI, calls no Pinterest API during review, mutates no Pinterest/account/board/Pin resource, and adds no scheduler, cron, or PM2 worker. The first production review for 2026-10 returned `COMPLETE_BASELINE_PORTFOLIO`, recommended three accounts at 60% confidence, and recorded the expected missing-role, incomplete-baseline, no-expansion-evidence, and attribution-not-collecting reasons. Growth was disabled again after validation.

Phase 7 is complete, production deployed, and live validated in migration `20261006220000_growth_opportunity_intelligence`, `lib/growth/opportunity/*`, job `OPPORTUNITY_INTELLIGENCE_ANALYSIS`, and `/admin/growth/opportunities`. The retained v1 production run documents structural `/translators/` route-token collapse; corrected production uses `opportunity_intelligence_v2`, `content_clustering_v2`, and `opportunity_scoring_v1`. Its live run considered 221 eligible Pins with `KNOWN` evidence and attribution `NOT_COLLECTING`, producing eight clusters, two opportunities, and no structural Translator cluster.

Phase 8 is production deployed and its decision/planning path is live validated. Migration `20261007010000_growth_translator_autopilot`, `lib/growth/translator/*`, jobs `TRANSLATOR_AUTOPILOT_DECIDE` and `TRANSLATOR_AUTOPILOT_EXECUTE`, and `/admin/growth/translators` implement the mandatory plan/execution split. The controlled test used the real Phase 7 `AMPLIFY_WINNER -> roleplay` opportunity (score 94, confidence 100%, evidence `KNOWN`, 35 distinct destinations, and multiple existing mapped Translators). It returned `WAIT_FOR_MORE_DATA` / `WAITING_DATA` with `MULTIPLE_TARGETS_AMBIGUOUS`, null `translatorId`, and null `executionJobId`; the opportunity moved to `DEFERRED`, no execute job was created, and the active Growth queue ended at 0 rows. Growth and attribution were disabled again. No Translator mutation or rollback was forced: the planner intentionally failed closed, so production status distinguishes live planning validation from the mutation path, which remains implementation validated by the 22/22 real PostgreSQL suite.

Phase 9 is complete with implementation validation and is not deployed to production. Migration `20261007140000_growth_ideas`, `lib/growth/ideas/*`, one-shot `IDEA_AUTOPILOT_DECIDE`/`IDEA_AUTOPILOT_EXECUTE`, public `/ideas` routes, and `/admin/growth/ideas` implement separate taxonomy, deterministic planning/dedupe/quality gates, injectable generation, immutable versions, automatic publication after successful explicit execution, archive, and checksum-protected rollback. Public content is structured React output only, uses the existing translation API for at most one embedded Translator, and excludes unpublished/archived versions from reads and sitemap. The isolated PostgreSQL A–P suite passed from all 23 migrations, with no live AI, Pinterest, attribution, production, schedule, cron, permanent worker, or Phase 10 action. Phase 10 — Creative Lab — is next.
