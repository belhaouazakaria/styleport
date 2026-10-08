# Decision Log

Durable product/architecture decisions for the SayTwist Growth Agent.

Do not delete old decisions when superseded. Mark them superseded and add the replacement.

## D-001 — Growth stays inside SayTwist admin

**Status:** Accepted

Use `/admin/growth` instead of a separate Growth subdomain/app.

A separate worker/process is allowed and expected.

## D-002 — `/ideas` is mandatory

**Status:** Accepted

The Growth system includes an editorial/inspiration surface under `/ideas`. It is not treated as an optional generic blog.

## D-003 — Initial Pinterest portfolio is three intent-driven publications

**Status:** Accepted

Initial strategy:

- SayTwist -> utility/discovery
- SayTwist Ideas -> inspiration
- SayTwist Playground -> entertainment

Do not initially split accounts into narrow categories such as "Work" solely because translators exist for that category.

## D-004 — Account count is data-driven after launch

**Status:** Accepted

Start with three accounts. The agent reviews the portfolio monthly and recommends expansion/repositioning only when evidence supports it.

The agent never creates Pinterest accounts automatically.

## D-005 — Primary optimization target is qualified conversion

**Status:** Accepted

Outbound clicks are important, but the system optimizes toward Pinterest-attributed successful translations.

## D-006 — Full SayTwist-side autopilot

**Status:** Accepted

The agent may autonomously create/edit translators and Ideas content, generate creative candidates, select accounts/boards/times, revive content and run permitted experiments, subject to configured limits, quality gates, versioning and rollback.

## D-007 — Pinterest publication requires specific Pin approval

**Status:** Accepted due to current external policy constraint

Current Pinterest developer guidelines require the end user to choose each Pin that will be published/scheduled through an app.

Therefore the initial production mode is:

- autonomous candidate generation;
- exact Pin shown in admin;
- explicit per-Pin approval;
- system publishes the approved Pin at the chosen/recommended time.

This decision may change only if Pinterest explicitly permits/approves a different automation workflow for this application.

## D-008 — Official Pinterest API only

**Status:** Accepted

No browser posting bot, password bot, cookie automation or anti-spam evasion.

## D-009 — Existing Pin renderer is V1 control

**Status:** Accepted

The current automatic translator Pin image generator is retained and measured as the baseline control before new visual systems are judged.

## D-010 — Static images only initially

**Status:** Accepted

Do not implement video Pin generation in the initial roadmap.

## D-011 — Agent decides recommended publishing volume

**Status:** Accepted

The agent chooses recommended volume based on account maturity/performance within admin-configured ceilings.

## D-012 — AI budget is flexible and visible

**Status:** Accepted

No fixed budget is locked at planning time.

Admin gets spend reporting and settings to reduce/increase workload and impose hard ceilings.

## D-013 — Warning-first account behavior

**Status:** Accepted

For performance/policy-risk signals, notify the operator with evidence and recommended action rather than autonomously disabling accounts.

Mechanical failures may stop individual jobs naturally.

## D-014 — Daily report is concise executive digest

**Status:** Accepted

One recipient. Include:

- main performance;
- breakout content;
- actions completed;
- AI spend;
- important warning(s);
- tomorrow's plan.

Full detail remains in `/admin/growth`.

## D-015 — WhatsApp desired, not assumed free

**Status:** Accepted

Implement notification provider abstraction. Verify current WhatsApp Business Platform cost/requirements during implementation and provide email fallback.

## D-016 — "Do nothing" is a valid agent outcome

**Status:** Accepted

The agent must not manufacture content purely to satisfy a daily quota.

## D-017 — Do not create fake subdomains for Pinterest account claims

**Status:** Accepted

Main SayTwist should claim the root domain. Satellite accounts are authentic editorial publications, not separate fake properties created to work around platform constraints.

## D-018 — Living documentation is mandatory

**Status:** Accepted

Growth docs are part of the source of truth. Relevant documents must be updated whenever implementation changes durable behavior.

## D-019 — Worldwide English, US-first initial optimization

**Status:** Accepted

Target English-speaking users worldwide. Initially optimize US scheduling, experiments, trend interpretation and Pinterest tests; replace geographic assumptions with first-party performance as evidence grows.

## D-020 — Existing claimed domain and accounts

**Status:** Accepted

The main SayTwist Pinterest account already claims `saytwist.com`. Additional accounts already exist and will later be rebranded SayTwist Ideas and SayTwist Playground. No new Pinterest account creation is required for launch. The agent never creates an account.

## D-021 — Phase 5 first-party Pinterest attribution contract

**Status:** Accepted and implemented

Use version `pinterest_organic_v1` with a configurable seven-day window from the latest qualified Pinterest landing. Preserve first and latest eligible touches. At the first trusted SUCCESS `TranslationLog`, assign the session's single Qualified Pinterest Conversion to its current latest eligible ref and freeze the ref, log, translator and conversion time; later landings never rewrite that historical assignment. Later successful translations are deduplicated attributed usage.

Only an active issued opaque `pin_ref` with exact Pinterest organic UTM source/medium and compatible same-origin destination creates a qualified landing. UTM or Referer alone never proves attribution. Store only a SHA-256 browser-token hash server-side; never place ref, UTM or internal IDs in the HttpOnly, SameSite=Lax cookie. Attribution rows store no translation input/output, raw IP, IP hash, raw user agent, email or authentication identity.

Collection requires both server-only `GROWTH_ATTRIBUTION_COLLECTION_ENABLED=true` and `GrowthSettings.attributionEnabled=true`; both default false and the autonomous Growth kill switch is separate. Production keeps the server gate false pending explicit privacy/consent rollout approval. The browser cookie expires with the attribution window, seven days by default; 30-day session detail retention is separate. A later qualified landing after expiry creates a fresh session/token and can earn its own QPC without reviving the retained journey. The landing-session KPI counts unique qualified sessions rather than every landing event. Session/event detail defaults to 30/90 days, while idempotent daily landing, attributed-translation and QPC aggregates survive bounded cleanup. Existing Pins without `pin_ref` remain outside deterministic first-party attribution. Existing-Pin ref issuance reuses the active ref; a revoked ref remains revoked and issuance fails rather than silently reactivating or multiplying refs.

## D-022 — Production database topology

**Status:** Accepted

Production uses PostgreSQL 18 self-hosted on the VPS. SayTwist connects locally on `127.0.0.1:5433` to database `saytwist` as application role `saytwist_app`.

Growth is designed around the existing local PostgreSQL production architecture and shares that instance/database unless a later durable architecture decision changes it. External managed database assumptions, including Neon, are not part of the current production baseline. Growth jobs must keep PostgreSQL load bounded and must not use aggressive polling.

## D-023 — Phase 2 uses a dedicated disabled-by-default Growth foundation

**Status:** Accepted and implemented

Use dedicated `GrowthSettings`, `GrowthJob`, `GrowthActivity` and `GrowthWorkerHeartbeat` tables. Growth defaults to disabled. Workers run only through explicit bounded invocation, claim one bounded batch atomically with PostgreSQL row locking, cap retries and exit when disabled or empty. Attempts increment on committed claim; stale recovery does not increment, and exhausted leases/failures become terminal. A stable heartbeat row represents each configured worker identity while a random invocation ID fences heartbeat updates and job transitions. Required unique idempotency keys identify a logical job for its entire lifetime. Phase 2 exposes no generic job creation API and registers only the internal `FOUNDATION_NOOP` handler.

## D-024 — Phase 3 Pinterest connection boundary

**Status:** Accepted, implemented and live validated

Use Pinterest API v5 Authorization Code OAuth for existing accounts. Request exactly `user_accounts:read`, `boards:read`, `pins:read` and `pins:write`. OAuth state is a ten-minute, hashed, admin-bound database record consumed atomically once. Credentials use versioned AES-256-GCM envelopes under `GROWTH_CREDENTIAL_ENCRYPTION_KEY`; continuous refresh rotation replaces access and refresh credentials together while holding an account row lock.

Exactly one connected account may hold each SayTwist publication role, and a Pinterest account ID is globally unique. Disconnect erases local ciphertext, releases the active-role slot, cancels pending Phase 3 sync work and retains non-secret identity/audit history. Pinterest documents no suitable application token-revocation endpoint for this flow, so Phase 3 does not invent one. Account and public-board reads are the only Pinterest resource operations in this phase.

Production Trial-access validation connected the main SayTwist Business account with the complete required scope set and successfully synchronized account metadata and boards through the bounded worker. Growth remains disabled after validation until later phases establish scheduled execution.

## D-025 — Standalone Growth workers load Next environment files before service imports

**Status:** Accepted and implemented

`npm run growth:worker` is a bounded standalone process. Its bootstrap uses `@next/env` before dynamically importing Growth/Pinterest modules, so production obtains `.env.production.local`, `.env.local`, `.env.production` and `.env` with explicit process variables taking precedence. Pinterest configuration status is calculated server-side from one required-name list and exposes only safe operational state. Missing or invalid local configuration is terminal for a claimed sync job because retrying cannot repair server configuration.

## D-026 — Phase 4 uses daily organic history and bounded single-Pin reads

**Status:** Accepted, implemented and live validated

Persist Pinterest-specific account and Pin daily `BigInt` metrics with deterministic account/date and Pin/date UPSERT keys. Initial backfill requests 90 inclusive UTC dates; incremental retrieval refreshes seven inclusive dates so settling data can be corrected. Inventory and detailed Pin work resume through existing persistent jobs with fixed request/page/Pin caps. Outbound clicks are the default Pinterest-side ranking metric, but Phase 4 creates no winner, viral, opportunity or conversion classification.

Use official `GET /pins`, user-account analytics/top Pins, and individual Pin analytics. Do not call or depend on the closed-beta multiple-Pin analytics endpoint. Do not store rolling/lifetime `pin_metrics` as daily history. Growth stays disabled and no scheduler is added until a later rollout decision.

Production validation completed the eligible detailed history backfill at 221/221, reached `FRESH`, and ended with zero queued and zero active jobs under the observed 60 requests/60 seconds organic analytics limit. This validates the bounded read design; it does not add attribution, publishing, scheduling or autonomous execution.

## D-027 — Complete Pinterest inventory with owned-domain detailed analytics

**Status:** Accepted, implemented and live validated

Keep a lightweight inventory of every Pin in the connected account, including unrelated and legacy content, because account strategy and future Phase 6/11 board lifecycle work require a complete view. Do not implement board management in Phase 4. Restrict expensive individual Pin analytics to active Pins whose parsed destination hostname exactly matches the ADMIN-configurable `GrowthSettings.ownedDomains`. Defaults are `saytwist.com`, `www.saytwist.com`, and `translator.whattypeof.com`. Do not follow redirects or make destination requests. Account-level analytics continues to cover the entire Pinterest account and is labeled accordingly.

Persist `analyticsEligible`, retain metric history when eligibility changes, and calculate backfill total/processed from active eligible Pins only. Normalize configured hostnames to lowercase, trim whitespace, and remove duplicates before persistence. Reclassify stored inventory on explicit analytics sync, settings change, full inventory completion, or one-time preparation of an unmarked pre-upgrade Pin job. Mark prepared Pin roots and continuations in their JSON payload so each eight-Pin continuation directly uses current persisted eligibility without repeating the full scan. A complete inventory is fresh for 24 hours; reuse it during that window, but fetch/resume inventory when absent, stale, or partial. Persist each Pinterest page with one bounded parameterized PostgreSQL bulk UPSERT. Keep the worker one-shot and bounded; add no cron, PM2 worker, polling, attribution, publishing, or board-management behavior.

Production validation accepted this boundary with 720 active Pins retained in complete inventory and 221 active Pins eligible for detailed analytics across the configured owned domains. The pre-upgrade queued continuation successfully self-prepared through the optional `relevancePrepared` mechanism, converting old all-Pin progress to eligible-Pin progress. Full inventory remains intentionally broader than analytics eligibility, and historical unrelated metrics remain retained.

## Open implementation checks

1. Whether the remaining existing Pinterest accounts are eligible to connect with the required scopes when their roles are activated.
2. Persistent image storage path, host scheduler and PM2 process list before any worker is deployed.
3. WhatsApp provider/setup, current pricing and eligibility; email fallback remains required.
4. Attribution consent and retention details across served jurisdictions before collection starts.

## D-028 — Phase 6 uses deterministic advisory account strategy

**Status:** Accepted, implemented and live validated

Use application-controlled `account_strategy_v1` over the last 28 complete UTC days. Always evaluate the three planned user-intent roles: SayTwist/utility, SayTwist Ideas/inspiration, and SayTwist Playground/entertainment and shareability. A role may be unconnected without being failed or zero-performing. Evidence quality must remain explicit, and disabled attribution means QPC measurement is unavailable rather than zero.

Account health uses persisted connection/scopes/credential state, sync and analytics freshness, inventory, observation length and board coverage. Alignment uses bounded deterministic destination and stored metadata evidence; it is separate from Phase 7 deterministic clustering. Board eligibility is advisory and cannot mutate Pinterest. Confidence uses documented deterministic deductions, including missing/weak roles, alignment gaps, unavailable attribution and high top-Pin concentration.

Persist one canonical `GrowthAccountStrategyReview` per review month/model version with strict bounded evidence. A manual ADMIN same-origin action may enqueue one bounded local `ACCOUNT_STRATEGY_REVIEW` using a period/version idempotency key. Completion UPSERTs the review and writes compact `GrowthActivity`. Growth remains disabled by default. V1 never selects `RECOMMEND_NEW_ACCOUNT` because sustained cluster, concept-depth and comparative expansion evidence belongs to Phase 7. No AI, Pinterest API call, account/role/board/Pin mutation, automatic recurrence, cron, or PM2 Growth worker is allowed in Phase 6.


## D-029 — Phase 7 uses deterministic, bounded local opportunity intelligence

**Status:** Accepted; superseded in production by D-031 after the retained v1 audit run

Use application-controlled versions `opportunity_intelligence_v1`, `opportunity_scoring_v1`, and `content_clustering_v1`. Each daily run uses the last 28 complete UTC days ending yesterday, compares recent and previous seven-day windows, and records four weekly activity buckets. It reads at most 500 active analytics-eligible Pins and bounded locally persisted account, board, Pin metric, analytics-state, strategy, Translator/category, and enabled-attribution evidence. It makes no Pinterest request and uses no AI. A `TrendProvider` boundary exists, but Phase 7 installs only `NullTrendProvider`.

Persist one immutable analysis run per UTC date/model, stable lexical clusters, bounded explicit membership snapshots, aggregate/concentration evidence, and immutable scored opportunities. Opportunity status changes never reopen old daily evidence. Winner, rising, fatigue, and inventory-gap types require documented minimum volume and sustainability. Conversion-specific types require live attribution collection; disabled attribution means unavailable, never zero. Missing conversion is removed from scoring weights. Cost is `NOT_APPLICABLE`. Full Pinterest inventory remains broader than analytics eligibility.

The manual ADMIN same-origin action only enqueues the daily idempotent job `opportunity-intelligence:opportunity_intelligence_v1:YYYY-MM-DD`. No recurring enqueue, Pinterest or Translator mutation, Ideas creation, creative generation, publishing, scheduling, cron, or PM2 Growth worker is part of Phase 7. Growth and attribution collection remain disabled pending later rollout decisions. Phase 8 was subsequently defined by D-032.


## D-030 — Phase 7 separates Pin signals from cluster opportunities

**Status:** Accepted, implemented, production deployed, and live validated

Persist deterministic Pin observations separately from advisory cluster opportunities. One sustained Pin may produce a winner signal, including a viral outlier, but winner/rising expansion requires at least two meaningful contributors and rejects top-Pin outbound concentration above 80%. Inventory gaps retain multi-Pin/content-depth requirements. Rising combines absolute recent volume, reach or outbound movement, and non-contradictory CTR/save-rate evidence. Fatigue requires previously meaningful performance, complete recent/prior observations, concurrent reach and outbound decline, and quality evidence; improving CTR makes it cautious and prevents cluster opportunity qualification. Stale evidence suppresses rising/fatigue opportunities. No signal directly authorizes content or publication work.


## D-031 — Retain Phase 7 clustering v1 and correct with versioned v2

**Status:** Accepted, production deployed, and live validated

The initial production `content_clustering_v1` analysis included raw destination-path tokens. Because every known Translator URL contains `/translators/:slug`, the structural `translators` token collapsed 221 eligible Pins into one false cluster. Keep the v1 job, run, cluster, signal, and opportunity rows unchanged as historical audit evidence.

Use `content_clustering_v2` with `opportunity_intelligence_v2` and unchanged `opportunity_scoring_v1`. Recognized Translator destinations use resolved Translator name, slug tokens, primary category, legacy category, title, and description without route segments. Unknown destinations may use only normalized terminal path content. Centralized generic vocabulary includes `style/styles` because these words describe the SayTwist corpus broadly rather than a useful opportunity niche. For corpora of at least ten Pins, reject candidate tokens appearing in more than 60% of documents; require document frequency of at least two, prefer sufficiently specific category evidence, then choose by source trust, lower document frequency, and lexical tie-break.

The new intelligence version permits a same-date v2 run beside v1 and changes the job key to `opportunity-intelligence:opportunity_intelligence_v2:YYYY-MM-DD`. Dashboard ordering prefers later completion/creation on the same date and displays all model versions. Strong fatigue suppresses `AMPLIFY_WINNER` and `EXPLORE_RISING_TOPIC` for that cluster/run while preserving underlying Pin signals; `FILL_INVENTORY_GAP` may coexist.

Corrected production validation accepted v2 as the current model. With `KNOWN` evidence and attribution `NOT_COLLECTING`, the run considered 221 eligible Pins under the 500-Pin cap and produced eight deterministic clusters, two opportunities, and two WINNER signals at 85% average confidence. No structural `translator` or `translators` cluster existed. The winner examples were Freaky Translator in `funny` and Cold Hearted, Cunning And Manipulative Translator in `roleplay`; the leading opportunities were `AMPLIFY_WINNER` for `roleplay` at score 94/confidence 100% and for `historical` at score 77/confidence 100%. Growth and attribution were disabled again afterward. The run made no Pinterest mutation, AI call, content mutation, or autonomous scheduling change.

## D-032 — Phase 8 separates deterministic Translator authorization from generated execution

**Status:** Accepted, production deployed, and live decision/planning path validated; Translator mutation/rollback remain implementation validated

Use application-controlled `translator_autopilot_v1`, `translator_quality_v1`, `translator_dedupe_v1`, and `translator_snapshot_v1`. One decision job maps one eligible Phase 7 opportunity to `CREATE_TRANSLATOR`, `IMPROVE_TRANSLATOR`, `WAIT_FOR_MORE_DATA`, or `NO_ACTION`; a separate execution job performs generation and at most one Translator mutation. AI never decides whether mutation is permitted and never supplies trusted category or Translator IDs.

Create requires OPEN/KNOWN evidence, score >=75, confidence >=80, gap/rising type, a specific grounded need, a safely resolved active category, and no exact/near active or archived duplicate. Improve requires score >=70, confidence >=75, one deterministic mapped Translator, and a material valid change. Broad winner clusters do not create content by themselves; fatigue without a clear fix target waits. Dedupe uses normalized slug/name, categories, meaningful lexical tokens, prompt purpose, and source/target labels without embeddings or external calls.

Generation receives a bounded, injection-resistant brief and may make one controlled repair attempt; token/response metadata is aggregated across both attempts. Deterministic validation is authoritative. New Translators remain inactive. Improvement preserves name/slug, activation, featuring, archival state, sort order, model override, display controls, share-image state, and unrelated operational fields. AI occurs outside database transactions. After AI, execution rechecks the kill switch and locks it through commit, then revalidates decision/opportunity state, checksum, categories, quality, and create dedupe. Outcomes map to `ACTIONED`, `DEFERRED`, `DISMISSED`, `FAILED_RETRYABLE`, or `FAILED_TERMINAL`.

Canonical snapshots cover only managed content; name/slug are immutable identity checks. They exclude activation, featuring, archive/order/model/display controls, share-image metadata, logs, comments, attribution/PII, credentials, and unrelated admin data. Rollback requires the current checksum, validates identity plus every historical category's current active state, restores managed content, appends a version/activity, and no-ops if equal. Share-image refresh runs after commit using the established renderer. Durable side-effect status surfaces failures and lets job retry reconcile without repeating the mutation or version. History is never deleted. Phase 8 adds no production recurrence, Pinterest mutation, attribution change, scheduler, cron, PM2 Growth worker, or Phase 9 work.

Production validation deployed migration `20261007010000_growth_translator_autopilot` and exercised the real Phase 7 `AMPLIFY_WINNER -> roleplay` opportunity (score 94, confidence 100%, evidence `KNOWN`, 35 distinct destinations, and multiple existing mapped Translators). The planner returned `WAIT_FOR_MORE_DATA` / `WAITING_DATA` with reason `MULTIPLE_TARGETS_AMBIGUOUS`, null `translatorId`, and null `executionJobId`; the opportunity moved to `DEFERRED`, no execute job was created, and the active queue ended at 0 rows. This intentional fail-closed result means no production Translator mutation or rollback was forced. Growth was disabled again and attribution remained disabled. The mutation/rollback implementation remains validated by the 22/22 real PostgreSQL suite, but that path is not claimed as live-tested.

## D-033 — Ideas use separate taxonomy, structured content, and gated automatic publication

**Status:** Accepted and implementation validated; production not yet deployed

Store SayTwist Ideas in `GrowthIdeaCategory`, `GrowthIdea`, immutable `GrowthIdeaVersion`, and `GrowthIdeaTranslatorReference`. Ideas categories are independent of Translator categories and begin with ten idempotently seeded safe rows. Persist only strict structured blocks, cap each snapshot at 96 KiB, render server-controlled React rather than generated HTML, and resolve every Translator reference against active persisted records. Public reads and sitemap entries require the current version of a published, non-archived Idea.

Use deterministic `idea_autopilot_v1`, `idea_quality_v1`, `idea_dedupe_v1`, `idea_generation_v1`, and `idea_snapshot_v1` boundaries. Planning authorizes create only at score/confidence 70/75 and improve at 65/70, with taxonomy, target, duplicate, and evidence gates. Generation is injectable, receives bounded untrusted evidence, occurs outside transactions, and permits at most one repair. Immediately before mutation, recheck the Growth kill switch, decision/opportunity state, target checksum, category, active Translator references, duplicate/slug state, quality, and material change. A successful explicitly invoked job publishes automatically because every deterministic gate has passed; no separate draft approval queue is added in Phase 9.

Archive and rollback are ADMIN-only same-origin audited actions. Rollback requires the current checksum, validates the historical snapshot against current safety rules, and appends a new version. Phase 9 adds no Pinterest operation, attribution enablement, scheduler, cron, persistent worker, or Creative Lab behavior. The A–P real PostgreSQL suite and prior Growth compatibility suites validate implementation; production deployment remains a separate future action.
