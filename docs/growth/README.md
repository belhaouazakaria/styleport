# SayTwist Growth Agent

**Status:** Phase 12.2 recovery deployed and validated for one 13/13 completed plan (2026-10-17); Phase 13 economics and Telegram reporting IN PROGRESS on PR #15, not deployed or accepted; Phase 14 NOT STARTED; Growth, attribution and reporting disabled
**Scope:** Pinterest-first autonomous growth system inside SayTwist  
**Primary admin surface:** `/admin/growth`  
**Primary public expansion:** `/ideas`  
**Roadmap size:** 14 implementation phases

## Feature brief

The SayTwist Growth Agent is a Pinterest-first growth system that continuously learns what content brings qualified traffic to SayTwist, expands winning niches into new translators and editorial content, prepares Pinterest creatives, schedules approved Pins at data-driven times, revives evergreen content, measures results, tracks AI spend, and produces a concise daily executive report.

The system is not a "post more Pins" bot. It is a closed-loop growth engine:

`Pinterest performance -> SayTwist conversion data -> opportunity detection -> content decisions -> creative testing -> publication -> measurement -> learning`

The north-star metric is **qualified Pinterest conversions**, initially defined as a Pinterest-attributed visitor completing a translation. Outbound clicks remain a key upstream metric, but are not the final optimization target.

## Initial publication strategy

Launch with three authentic Pinterest publications:

1. **SayTwist** — utility/discovery: translators and direct tool use.
2. **SayTwist Ideas** — inspiration/save intent: useful idea pages and editorial content.
3. **SayTwist Playground** — entertainment/share intent: playful language content, interactive concepts and relatable transformations.

These are different editorial experiences, not duplicate distribution accounts. The same topic may appear across multiple publications only when the content concept, user intent and destination experience are genuinely different.

The initial account count is three. The agent reviews account performance monthly and may recommend adding, merging or repositioning accounts. It never creates Pinterest accounts by itself.

## Non-negotiable principles

- Use the official Pinterest API and approved Pinterest automation only.
- Do not use browser automation, credential sharing, scraping-based account actions or anti-spam evasion.
- Do not use multiple accounts to manipulate distribution.
- Do not publish repetitive Pins with superficial visual changes.
- Every account must have an authentic editorial purpose.
- Every destination page must provide original value.
- Pinterest publishing must respect Pinterest's developer requirement that the end user specifically chooses each Pin to publish. The agent may fully prepare and schedule candidates, but an approval gate remains unless Pinterest explicitly approves a more autonomous publishing workflow for this app.
- AI can autonomously create and improve SayTwist-owned content subject to SayTwist quality, safety and rollback rules.
- "Do nothing" is a valid daily agent decision.
- Every autonomous decision must be auditable.
- Cost is a first-class metric.
- Documentation is living source-of-truth and must change with implementation.

## Source-of-truth documents

Read these before changing the Growth system:

- `AI_CONTEXT.md`
- `PRODUCT.md`
- `ACCOUNT_STRATEGY.md`
- `AGENT_AUTOMATION.md`
- `CONTENT_AND_IDEAS.md`
- `PINTEREST_INTEGRATION.md`
- `ANALYTICS_ATTRIBUTION.md`
- `ADMIN_REPORTING_COSTS.md`
- `ARCHITECTURE.md`
- `TESTING_SECURITY_ROLLOUT.md`
- `ROADMAP.md`
- `DECISIONS.md`
- `IMPLEMENTATION_MAP.md`
- `DATA_MODEL.md`

If implementation changes behavior described here, update the relevant document in the same phase/commit.

## Confirmed targeting and accounts

- English-speaking worldwide; initially optimize US scheduling, experiments and trend interpretation, then adapt to first-party performance.
- `saytwist.com` is already claimed by the main SayTwist Pinterest account. Additional existing accounts will later be rebranded SayTwist Ideas and SayTwist Playground. No account creation is needed for launch.

## Remaining implementation checks

- Only static/image Pins are in scope initially. Video is out of scope.
- Pinterest Standard Access was confirmed by the operator. The two earlier HTTP 401 publication chains remain immutable historical evidence. A later specifically approved real Pin published through Creative Lab, appeared on Pinterest, resolved to the intended destination, and reached `RECONCILED`; direct Create Pin success does not require a second reconcile job. Phase 12 v1 was deployed and production-validated on October 15, 2026. Phase 12.1 v2 subsequently ran successfully but remained `PARTIAL` because Pinterest history contains missing and `PROCESSING` observations. Phase 12.2 is deployed. One existing recovery plan completed all 13 of 13 planned API requests on 2026-10-17, under the eight-request-per-worker and five-request reserve gates. This does not imply historical observation gaps are entirely eliminated. Growth and attribution remain disabled.
- Telegram Bot API (not OpenWA/WhatsApp) is the approved single-private-recipient daily report channel; the bot, private recipient, live delivery and schedule remain unconfigured/unapproved.

See `IMPLEMENTATION_MAP.md` for verified repository facts and `DATA_MODEL.md` for implemented and proposed schema/state contracts.

## Phase 12 Evergreen and Learning Engine

Phase 12 adds immutable daily learning runs, conservative Translator/Idea revival recommendations, exposure-normalized performance comparisons, account-specific learned timing, mature experiment findings, and versioned opportunity-score feedback. Evidence is selected explicitly before aggregation; exhausted caps, unavailable per-account analytics, or partial evidence are reported and cannot become `KNOWN`, learned timing, or positive feedback. Experiments evaluate every configured variant and require mature, balanced, non-outlier exposure plus statistically qualified lift. Missing conversion remains null and attribution requires both default-off gates. An ADMIN may explicitly queue evaluation, prepare a recommended new creative, or perform audited controlled experiment lifecycle transitions; no Phase 12 path allocates traffic. Preparation revalidates state at each boundary, requires a second unmistakable confirmation before paid AI, links its job and candidate, and still cannot bypass the Phase 11 individual Pin approval contract. V1 and migration `20261015120000_growth_evergreen_learning` were deployed and validated on October 15, 2026; the immutable v1 run produced 355 `INSUFFICIENT_DATA` recommendations.

Phase 12.1 introduces `growth_learning_v2`, `evergreen_learning_v2`, and `learned_scheduler_v2`. V2 consumes existing active analytics-eligible `GrowthPinterestPin` rows as read-only legacy evidence after exact approved-host `/translators/:slug` matching, deduplicates them against managed publications by Pinterest Pin ID, and retains source provenance per recommendation. Only `READY` daily rows are aggregated; `PROCESSING`, missing, capped, stale, or unavailable evidence remains explicit and cannot become complete evidence. No publication, candidate, approval, experiment, attribution, or creative metadata is synthesized. The October 15 v1 run and its 355 `INSUFFICIENT_DATA` recommendations remain immutable. Production v2 execution succeeded but correctly remained `PARTIAL`.

Recorded production discovery: 222 Pins are analytics-eligible and 221 historical Pins are affected on the identified dates. October 6–8 have 221 missing rows per day; October 5 has 221 `PROCESSING`; October 4 has 13 `PROCESSING`; and October 14–15 have 221 `PROCESSING` rows per day. The existing seven-calendar-day refresh cannot revisit the older October 4–8 gaps, which is why v2 remained `PARTIAL`.

Phase 12.2 adds explicit, ADMIN-confirmed analytics recovery. A dry run scans at most 500 active eligible Pins and 90 completed UTC dates strictly after each Pin's UTC publication day, reports exact missing/`PROCESSING` dates, affected Pins, minimal contiguous request ranges, request estimates, caps, and the last observed provider budget. Confirmation reacquires the account advisory lock and recomputes the evidence token before persisting an immutable plan. Before every `GET /pins/{pin_id}/analytics`, the worker requires fresh, parseable rate-limit remaining/reset metadata, preserves a five-request reserve, and delays a continuation until reset when quota is insufficient. Pinterest's raw `x-ratelimit-reset` value is seconds until reset, so recovery anchors that delta to `rateLimitObservedAt`; it is never interpreted as a Unix timestamp. Missing, malformed or implausible quota headers fail closed. Expired or stale quota observations permit at most one fresh, read-only Pinterest account GET per recovery execution. The provider's actual response headers are revalidated before any Pin GET. Fresh, valid one-second reset windows are accepted in accordance with Pinterest's published API response example. Expired windows are refreshed or deferred, and the five-request reserve remains mandatory; no quota values are inferred. Each one-shot execution performs at most eight requests. Cancellation terminalizes the recovery and related queued continuations while retaining tasks and activities, allowing a later separately approved plan. Recovery never creates, edits, or deletes a Pin, synthesizes missing metrics, changes provider `data_status`, changes analytics health, or reprocesses v1/v2 learning runs. No cron or persistent Growth worker is added.

## Phase 7 production correction

The initial production `opportunity_intelligence_v1` / `content_clustering_v1` run collapsed 221 eligible Pins into the structural `/translators/` route topic. Its rows remain untouched as historical audit evidence. The corrected production models are `opportunity_intelligence_v2`, `content_clustering_v2`, and unchanged `opportunity_scoring_v1`. Live v2 validation considered 221 eligible Pins under the 500-Pin cap with `KNOWN` evidence and `NOT_COLLECTING` attribution, producing eight deterministic clusters, two opportunities, and two WINNER Pin signals at 85% average confidence. No `translator` or `translators` structural cluster remained. Growth was disabled again after validation; no Pinterest mutation, AI call, content mutation, scheduler, cron, or persistent Growth worker was introduced.

## Phase 8 Translator Autopilot

Phase 8 uses `translator_autopilot_v1`, `translator_quality_v1`, and `translator_dedupe_v1`. A bounded planning job turns one eligible Phase 7 opportunity into a durable `GrowthDecision`; a separate execution job revalidates and mutates at most one Translator. Deterministic gates can choose create, improve, wait, or no action before AI is called. Creation requires known evidence, an eligible gap/rising type, score at least 75, confidence at least 80, a specific grounded concept, a safe existing category, and no exact/near duplicate. Improvement requires a deterministic target, score at least 70, confidence at least 75, and a material validated change. Broad `AMPLIFY_WINNER` clusters such as roleplay or historical never justify creation by themselves.

Generation uses an injectable provider with bounded untrusted evidence, strict structured output, aggregate token metadata across at most one repair, and no transaction held across the AI call. Immediately before apply, execution rechecks the Growth kill switch, decision/opportunity state, target checksum, categories, quality, and create dedupe/slug safety. Server code keeps new Translators inactive. Each successful mutation atomically records a bounded managed-content snapshot, canonical SHA-256 checksum, monotonically increasing version, decision completion, opportunity action, and compact activity. Operational state and share-image metadata are excluded from rollback. Share-image refresh runs after commit with durable synchronized/pending-failure status, so retry reconciles the image without repeating content mutation. Rollback requires a current-checksum precondition and safe active historical categories. There is no recurrence, scheduler, cron, permanent worker, Pinterest mutation, attribution enablement, or Phase 9 implementation.

## Phase 9 SayTwist Ideas

Phase 9 adds the separate `GrowthIdeaCategory`, `GrowthIdea`, immutable `GrowthIdeaVersion`, and `GrowthIdeaTranslatorReference` model in additive migration `20261007140000_growth_ideas`. Ten safe taxonomy rows are seeded independently from Translator categories. Structured, server-rendered blocks power `/ideas` and `/ideas/[slug]`; public reads expose only published, non-archived Ideas and their current version. Pages include canonical metadata, breadcrumbs, related Ideas, contextual Translator links, at most one embedded Translator that calls the existing `/api/translate`, and sitemap inclusion. Public routes use dynamic database reads, so unpublished or replaced versions are not retained in a page cache.

`idea_autopilot_v2` separates deterministic planning from `IDEA_AUTOPILOT_EXECUTE`. Create requires opportunity score at least 70 and confidence at least 75; improve requires at least 65 and 70. The planner rejects superseded Opportunity Intelligence/clustering versions and keeps generic clusters from creating or improving Ideas merely because of evidence volume. The planner resolves taxonomy and targets from persisted evidence, and dedupe covers title, slug, category, cluster, and normalized list-item overlap. An injectable provider receives bounded untrusted evidence and may make one repair attempt; tests use fakes and make no live OpenAI call. Execution validates the strict block allowlist, 96 KiB snapshot limit, content depth, SEO bounds, links, active Translator references, CTA ratio, numeric-title item count, and material checksum change. It then rechecks the Growth kill switch, decision/opportunity state, target checksum, category, references, duplicate state, and slug before one atomic write. Valid content publishes automatically during an explicitly invoked Growth job. Archive and rollback are ADMIN-only audited actions; rollback creates a new immutable version and requires the current checksum. Migration `20261007140000_growth_ideas` is deployed with 10 production categories. Public `/ideas`, sitemap, homepage, and `ads.txt` smoke checks passed; the existing AdSense line remains `google.com, pub-7927856375186557, DIRECT, f08c47fec0942fa0`. Live validation of opportunity `cmux9ou7e0040a52kdu99upq2` (`AMPLIFY_WINNER`, `historical`, score 77, confidence 100, evidence `KNOWN`) returned `WAIT_FOR_MORE_DATA` / `WAITING_DATA` with `IDEA_GENERIC_TOPIC_INSUFFICIENT`, null `executionJobId`, and `DEFERRED` opportunity status. The decision job succeeded on its first attempt, no execute job was created, zero Ideas were created, no live OpenAI generation was forced, and Growth was disabled again afterward. Phase 9 adds no Pinterest call or mutation, attribution enablement, Phase 10 creative work, scheduler, cron, or persistent Growth worker.

## Phase 10 Creative Lab

Phase 10 is **COMPLETE — production deployed and live visual validation approved**. Migration `20261008120000_growth_creative_lab` and `lib/growth/creative/*` add immutable checksummed assets, immutable candidate revisions, bounded DRAFT experiment definitions, `creative_similarity_v1`, the one-shot `CREATIVE_LAB_GENERATE` job, and ADMIN `/admin/growth/creative`. The unchanged Translator share image is Renderer V1 control. Four deterministic 1000×1500 static archetypes add typography-led, editorial/list, conversation/chat, and minimal-statement output.

Candidate generation supports active Translators and fully schema-valid published current Ideas. Inside the final transaction it revalidates the Growth kill switch, target fingerprint and eligibility, connected account, DRAFT experiment, variant, and cluster compatibility before any reuse or persistence. Direct indexed lookups cover exact content and image-checksum duplicates across all history; intent-aware fuzzy comparison remains capped at 100 recent candidates. Exact retry in the same candidate context may reuse its immutable row and asset, while exact matches in another context and near duplicates defer. Content-addressed storage publishes without clobbering concurrent writers and preserves files when database reference state cannot be verified. Static renderers cap lines within their layouts. Before → After uses configured `gpt-image-2` full-image generation with exact copy and no deterministic overlay; the accepted production Pin passed live visual validation. Automated tests use fakes and unknown monetary cost remains null. Phase 11 adds immutable individual approval, scheduling, one safe Pinterest Create Pin attempt and bounded reconciliation. Terminal/cancelled recovery requires another explicit future approval and creates entirely new publication evidence while preserving the previous chain. Phase 11 is production deployed and live publication validated; no production cron or persistent worker is enabled.

### Phase 13 WhatsApp reporting choice

Daily operator Growth digests are now planned for one WhatsApp recipient via OpenWA v5, hosted separately on the same VPS with a localhost-only API. This is the operator's preferred transport, not the Meta WhatsApp Business API. The adapter and formatter are development-only until private sender pairing, recipient existing-chat confirmation, a durable daily report archive, delivery idempotency and controlled rollout. See `OPENWA_RUNBOOK.md`.


### 2026-10-24 Reporting transport update (supersedes WhatsApp section above)

Telegram Bot API replaces OpenWA for the single private Growth executive digest recipient. The earlier OpenWA section is historical and not a current operational instruction. This is disabled-by-default feature-branch code; no live message, cron, deploy, Growth activation or recurring delivery is authorized. See TELEGRAM_RUNBOOK.md and the Phase 13C roadmap update.
\n### 2026-10-25 Phase 13N provider costs evidence preparation (code only)\n\nA read-only and currently **uninvoked** OpenAI organization Costs adapter validates complete daily, project-scoped USD snapshots from the official endpoint. It cannot prove a Growth-only bill in a project shared with normal translation traffic, and it cannot supply per-request invoiced costs. No admin billing key has been provisioned; no external API call or cost settlement is performed. See ADMIN_REPORTING_COSTS.md.\n