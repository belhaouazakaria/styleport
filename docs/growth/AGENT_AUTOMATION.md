# Agent Automation Specification

## 1. Agent purpose

The Growth Agent is a daily decision engine that converts performance data into controlled growth actions.

It is not a generic autonomous browser agent.

It operates through:

- SayTwist database/services;
- official Pinterest APIs;
- configured AI providers;
- internal image/rendering services;
- notification providers.

## 2. Daily cycle

A normal daily run follows this sequence:

1. **Health check**
   - database available;
   - Pinterest credentials valid;
   - API status/rate-limit budget acceptable;
   - Growth worker healthy;
   - cost ledger healthy.

2. **Analytics synchronization**
   - retrieve available Pinterest account and Pin metrics;
   - update metric snapshots;
   - ingest SayTwist attribution/conversion events;
   - reconcile publication state.

3. **Performance analysis**
   - identify breakout Pins;
   - identify rising topics;
   - identify fatigue/decline;
   - identify high-click/low-conversion mismatches;
   - identify high-conversion/low-reach opportunities;
   - evaluate creative archetypes and posting windows.

4. **Inventory analysis**
   - map winning topics to existing translators;
   - map topics to Ideas content;
   - detect content gaps;
   - detect duplicate/near-duplicate candidates;
   - identify evergreen content due for revival.

5. **Opportunity scoring**
   - score potential actions;
   - estimate expected value;
   - estimate AI/rendering cost;
   - estimate content/policy risk;
   - assign confidence.

6. **Plan**
   - choose a bounded daily portfolio of actions;
   - select publication/account intent;
   - select destination type;
   - select creative archetype;
   - select candidate publish window.

7. **Create/update SayTwist content**
   - translators;
   - Ideas pages;
   - collections;
   - metadata/internal links;
   - version history.

8. **Generate Pin candidates**
   - copy;
   - image;
   - destination;
   - UTM/ref attribution;
   - board recommendation;
   - schedule recommendation;
   - similarity/policy checks.

9. **Publication approval queue**
   - each Pin is shown as a specific publish candidate;
   - admin specifically chooses each Pin to approve;
   - approved Pin can then be scheduled for its recommended time;
   - unapproved Pins remain drafts, expire, or are regenerated according to settings.

10. **Post-publish monitoring**
    - record publication ID/state;
    - sync metrics;
    - detect API/policy errors;
    - attach outcomes to the originating decision.

11. **Report**
    - produce concise executive daily digest;
    - include performance, actions, spend, warnings and next-plan summary.

## 3. "Autopilot" definition

Full SayTwist-side autopilot means the agent can autonomously:

- research internal performance;
- decide what SayTwist content to create/edit;
- create translators;
- edit translators;
- create Ideas content;
- create creative concepts;
- generate images;
- generate titles/descriptions;
- select account/board/time;
- create scheduled publication candidates;
- learn from results.

Pinterest publication itself is subject to a per-Pin approval gate because current Pinterest developer guidelines require the end user to choose each Pin that will be published by an app.

If Pinterest explicitly approves a future workflow allowing more autonomous publication for this app, this behavior may be feature-flagged only after:

- policy verification;
- documentation update;
- security review;
- user approval.

## 4. Decision evidence

Every decision stores:

- `decision_type`
- `created_at`
- evidence references
- topic/content cluster
- candidate account
- target destination
- confidence score
- expected qualified conversions
- expected outbound clicks
- estimated AI cost
- estimated render cost
- risk flags
- final action
- resulting resource IDs
- later measured outcome

The admin must be able to inspect the evidence and outcome without exposing private model chain-of-thought.

## 5. Opportunity scoring

Initial conceptual score:

`OpportunityScore = DemandSignal × ConversionQuality × ContentFit × Freshness × Confidence - CostPenalty - DuplicationPenalty - RiskPenalty`

Implementation may use deterministic weighting first. It does not need ML at launch.

Weights must be configurable/versioned so historical decisions can be explained.

## 6. Winner detection

Do not define "winner" solely by impressions.

Signals include:

- qualified conversions;
- qualified conversion rate;
- outbound clicks;
- outbound click rate;
- saves;
- growth velocity;
- performance relative to account baseline;
- performance relative to creative-type baseline;
- sustained performance rather than one-hour spikes.

The system should use minimum sample thresholds to avoid acting on noise.

## 7. Niche expansion

When a topic wins, the agent treats it as a **signal**, not an instruction to clone.

It may expand into adjacent content if:

- the adjacent idea is genuinely distinct;
- there is no existing equivalent;
- it fits SayTwist;
- expected usefulness is high;
- the content cluster remains coherent.

Example signal:

`Gen Z + dating + texting`

Possible outputs:

- Gen Z Flirting Translator
- Dry Texter Translator
- Situationship Translator
- "21 Flirty Texts That Do Not Sound Cringe"
- "What to Text After a First Date"
- "Which Type of Texter Are You?"

## 8. Evergreen revival

The revival engine evaluates older translators/Ideas pages that:

- historically converted well;
- have not been promoted recently;
- have a fresh creative angle available;
- remain relevant;
- are not currently fatigued.

Revival means a new authentic creative/angle, not reposting the same Pin repeatedly.

## 9. Scheduling

Do not hard-code generic "best Pinterest time" advice as the long-term scheduler.

Cold-start:

- use configurable exploration windows;
- distribute tests across weekdays/time slots.

Learning dimensions:

- account;
- weekday;
- hour/time window;
- content intent;
- topic;
- creative archetype;
- destination type.

As data grows, use exploration/exploitation:

- reserve some inventory for learning;
- place proven combinations in stronger windows;
- avoid declaring a permanent best time from small samples.

## 10. Warning behavior

The user prefers recommendations over automatic shutdown.

The agent should warn on:

- unusual performance decline;
- API/policy warnings;
- repeated publish failures;
- OAuth expiration;
- suspected content duplication;
- unusual account behavior;
- cost acceleration;
- attribution failure;
- worker/analytics failure.

The report includes recommended action.

Operationally impossible jobs stop naturally; the agent should not repeatedly hammer a failing API.

Hard spend limits, if explicitly configured by the user, are enforced mechanically.

## 11. Failure isolation

Growth failures must be isolated from core SayTwist.

Use:

- separate queues/jobs;
- retries with bounded backoff;
- idempotency;
- dead-letter/failure states;
- timeouts;
- transactional state changes where required.

A Growth failure must not prevent normal translations or public page loads.

## Job and approval invariants

Growth actions are explicit persistent jobs with unique logical work keys, bounded claim leases, capped concurrency, backoff and terminal failure. No idle high-frequency PostgreSQL polling. Every SayTwist content mutation records before/after version and activity; rollback is a new audited action. A Pin approval binds exact candidate revision, asset checksum, title, description, destination, account, board and time. A changed field voids that approval. The future publishing-mode flag defaults off and cannot bypass current per-Pin gate without an explicit policy/authorization change. See `DATA_MODEL.md`.

Phase 2 implements only the internal `FOUNDATION_NOOP` handler as a wiring test. The database enum and handler registry reject unknown job types. The global setting defaults to disabled; a bounded worker checks it before any claim and before each claimed job executes. If disabled after a batch claim, every unexecuted claim is released to `PENDING` and its claim increment is reversed. A claim that is not deliberately released consumes one attempt, including a worker crash. No autonomous content, Pinterest, analysis or scheduling handler exists yet.

Phase 3 adds `PINTEREST_ACCOUNT_SYNC` and `PINTEREST_BOARD_SYNC`. Admin sync creates minute-bucket idempotent jobs; the bounded worker executes them and exits. Invalid or expired credentials terminate that job and require reconnect; 429 and 5xx remain bounded retryable failures.

Phase 4 adds only `PINTEREST_PIN_INVENTORY_SYNC`, `PINTEREST_ACCOUNT_ANALYTICS_SYNC`, and `PINTEREST_PIN_ANALYTICS_SYNC`. An ADMIN same-origin request always queues account analytics. It queues/resumes inventory when no complete inventory exists, the inventory is at least 24 hours old, or state is partial; otherwise it reclassifies stored destinations and queues eligible Pin analytics directly. Inventory completion enqueues bounded Pin detail batches. New Pin roots and continuations carry `relevancePrepared=true`; they select from current persisted eligibility without scanning all Pins again. A pre-upgrade Pin job with no marker performs preparation once before processing and marks its continuation. Settings changes update persisted eligibility, so an already marked continuation still sees the current policy. Top-Pin priority cannot bypass eligibility. Continuations persist through `GrowthJob`, and each worker invocation still exits. Growth remains disabled without operator action. No publication, attribution, content generation, opportunity decision, scheduling, cron, or PM2 process exists.

## Phase 6 account strategy review

Phase 6 adds `ACCOUNT_STRATEGY_REVIEW` as a manual, bounded local-data job. The payload is fixed to review month, complete evidence-window end, and application-controlled `account_strategy_v1`; the idempotency key is `account-strategy:account_strategy_v1:YYYY-MM`. One run reads bounded persisted account, board, inventory and metric evidence, UPSERTs the canonical monthly review, appends a compact `GrowthActivity`, and exits. It does not refresh stale Pinterest data automatically; the recommendation tells the operator to refresh it. Existing worker kill-switch checks apply before claim/execution, and there is no recurring enqueue, polling, cron, or PM2 Growth process.

## Phase 7 opportunity analysis job

`OPPORTUNITY_INTELLIGENCE_ANALYSIS` is a manual bounded local-data job. Its strict payload contains the UTC analysis date and `opportunity_intelligence_v2`; its daily idempotency key is `opportunity-intelligence:opportunity_intelligence_v2:YYYY-MM-DD`. It evaluates one 28-day window, persists an immutable run with capped clusters/memberships/opportunities and one compact activity record, then exits. Existing kill-switch, claim, lease, retry and terminal-failure behavior applies. There is no recurring enqueue, polling, cron, PM2 Growth process, Pinterest call, or resource mutation.

Phase 7 is production deployed and live validated. The corrected v2 run completed under the 500-Pin cap, and Growth was disabled again afterward; attribution remained disabled. The retained v1 run is historical audit evidence of structural `/translators/` route-token collapse.

## Phase 8 Translator Autopilot jobs

`TRANSLATOR_AUTOPILOT_DECIDE` accepts one opportunity and application-controlled `translator_autopilot_v1`. Its key is `translator-decision:translator_autopilot_v1:<opportunityId>`. It deterministically creates or reuses one `GrowthDecision`, closes wait/no-action opportunities as `DEFERRED`/`DISMISSED`, and enqueues execution only for authorized create/improve plans. `TRANSLATOR_AUTOPILOT_EXECUTE` accepts only a decision ID and uses a decision/action key. It claims the decision before generation, builds one bounded brief, permits one repair, then rechecks Growth enabled state, decision/opportunity compatibility, target checksum, active categories, quality, and create dedupe before one atomic mutation/version commit.

Neither job loops or recurs. The global kill switch applies before claim, before final apply after AI, and under a settings-row lock during commit. Share-image refresh is a post-commit side effect with durable status; a failed refresh makes the job retryable, and retry reconciles only the image because the completed decision/version prevent duplicate mutation. There is no cron, scheduler, polling daemon, PM2 Growth process, Pinterest call/mutation, or attribution enablement. AI generation happens outside transactions through an injectable provider; tests use fakes for AI and image rendering.

## Phase 9 Ideas jobs

`IDEA_AUTOPILOT_DECIDE` accepts one OPEN opportunity and application-controlled `idea_autopilot_v2`. It deterministically creates or reuses a `GrowthDecision`, with create score/confidence thresholds of 70/75 and improve thresholds of 65/70. It rejects opportunities from superseded Opportunity Intelligence or clustering model versions as `NO_ACTION`. Generic cluster labels remain `WAIT_FOR_MORE_DATA` regardless of evidence volume or a single mapped Idea, so they cannot create or improve Ideas. It resolves a single Idea target, active Ideas category, supporting cluster, and duplicate state from persisted evidence. Wait/no-action closes the opportunity as `DEFERRED`/`DISMISSED`; only authorized create/improve decisions enqueue execution.

`IDEA_AUTOPILOT_EXECUTE` accepts only the decision ID. It claims once, builds a bounded brief with untrusted evidence, permits at most one provider repair, and keeps all provider work outside database transactions. Before apply it rechecks the kill switch under lock, decision/opportunity compatibility, target checksum, category, active Translator references, duplicate state, slug availability, quality, and material change. A successful transaction publishes the current version, appends Translator references and compact activity, completes the decision, and marks the opportunity `ACTIONED`. Jobs are one-shot and bounded; they add no recurrence, scheduler, cron, polling daemon, PM2 Growth process, Pinterest operation, attribution enablement, or Phase 10 action.

## Phase 10 Creative Lab job

`CREATIVE_LAB_GENERATE` accepts one strict application-controlled `creative_lab_v1` payload: destination kind/ID, implemented archetype, and optional connected account plus paired DRAFT experiment/variant. The ADMIN action only enqueues the idempotent job. The bounded worker resolves an eligible Translator or fully schema-valid published Idea, constructs bounded deterministic copy, performs indexed exact content lookup across all candidates and fuzzy comparison over at most 100 recent candidates, and materializes one validated immutable asset. Inside the final transaction it revalidates Growth, target fingerprint and eligibility, connected account, DRAFT experiment, variant/dimension, and cluster compatibility; locks the candidate group and asset checksum; performs exact content and asset checksum lookups; then reuses safely or writes one immutable candidate revision and activity before exiting.

Exact retry for the same immutable candidate context returns the existing candidate without another row or asset. Exact content or visual checksum in another context is retained as `DEFERRED` with bounded flags and reuses the asset. Near duplicates require strong title similarity plus matching destination or normalized topic intent; safe related/distinct candidates become `READY`. Renderer V1 delegates to the existing Translator share image. Four new static renderers are deterministic and cap text within their layouts. AI images require an explicit enabled provider, have a hard limit of one image unit per job, and never replace a failed deterministic renderer. No production worker provider is wired, making the default paid-image ceiling effectively zero; no live AI provider was used in validation.

Phase 10 candidates stop at `READY`/`DEFERRED`. Phase 11 adds separate exact-revision approval and publication boundaries while preserving the absence of recurring enqueue, production cron, idle polling, or a PM2 Growth process.

Stale lease recovery coordinates execution jobs with their durable decisions. When a stale `TRANSLATOR_AUTOPILOT_EXECUTE` or `IDEA_AUTOPILOT_EXECUTE` job is recovered, an `EXECUTING` decision and its evaluating opportunity become `FAILED_RETRYABLE` while attempts remain, or `FAILED_TERMINAL` with completion/closure timestamps after exhaustion. The transaction records `EXECUTION_JOB_LEASE_EXPIRED`; completed, waiting, rejected, cancelled, and terminal decisions are never reopened. Normal idempotent execution can therefore reclaim retryable work without duplicating content or versions.

Migration `20261007010000_growth_translator_autopilot` is deployed. Live validation used the real Phase 7 `AMPLIFY_WINNER -> roleplay` opportunity (score 94, confidence 100%, evidence `KNOWN`, 35 distinct destinations, multiple mapped Translators) and returned `WAIT_FOR_MORE_DATA` / `WAITING_DATA` with `MULTIPLE_TARGETS_AMBIGUOUS`, null `translatorId`, and null `executionJobId`. The opportunity moved to `DEFERRED`, no execute job was created, and the active queue ended at 0 rows. Growth was disabled again and attribution remained disabled. No Translator mutation or rollback was forced; the implementation remains covered by the 22/22 real PostgreSQL suite.

## Phase 11 publishing jobs

`PINTEREST_PIN_PUBLISH` and `PINTEREST_PIN_RECONCILE` accept only `publicationId`. An explicit ADMIN action creates the immutable approval, future attribution ref, publication and due job. The bounded one-shot worker revalidates the exact snapshot immediately before one Create Pin attempt. Known 429 responses may retry; any ambiguous post-submission outcome switches permanently to GET-only reconciliation. A stale PUBLISHING lease also creates/converges one reconcile job and terminally closes the publish job so Create Pin cannot repeat.

`GrowthJob.runAfter` carries scheduled time. Operators may eventually invoke `npm run growth:worker` from a conservative host scheduler, but Phase 11 does not install or enable cron, PM2, a polling daemon, `setInterval`, or sleep loops.

## Phase 12 learning job

`EVERGREEN_LEARNING_ANALYSIS` accepts only a UTC analysis date and the application-controlled current version (`growth_learning_v2`; v1 remains immutable history); a daily/model key converges concurrent ADMIN requests while permitting same-day version coexistence. The bounded worker computes recommendations and retained findings from local evidence only. Its v2 adapter reads legacy Pins without mutating them, caps before aggregation, accepts only exact active Translator URL matches, deduplicates Pinterest IDs, and counts only `READY` metrics. Disabled Growth prevents execution. The explicit preparation action requires a current `REVIVE` proposal and literal confirmation, rejects evidence older than 48 hours, resolves destination/archetype server-side, and queues the existing Creative Lab job. It never creates approval, publication, board action, recurrence, cron, or a permanent worker.

## Phase 14K advisory account-creative planning boundary

An isolated versioned pure planner now accepts multiple account profiles and verified opportunity summaries, but it **does not enqueue or execute** `CREATIVE_LAB_GENERATE` jobs. Account profile identity is explicit: UTILITY direct tool demo, INSPIRATION saveable editorial Ideas and PLAYGROUND interactive/persona prompts. Account-specific rendering and the secure admin-configured profile datastore remain future integration.

The planner returns only `PLANNED_FOR_REVIEW`, each retaining `requiresExactPinApproval: true`; no provider calls, OAuth account creation, Pin approval, scheduling, publication or persistent Growth switch transition. The initial proposed max is four candidate plans/day across two initial experimental account profiles, subject to existing stronger AI/day and content limits. Quality, originality, connection and freshness may result in **zero** candidates. Expansion proposals are monthly human-reviewed evidence recommendations, never automatic account creation. Future runtime adoption must check daily counters under the database lock, protect worker admission with existing lease/watchdog/kill switches, and preserve the immutable pin approval snapshot.

## Phase 14K owner-selectable daily cadence (code only)

The owner replaces the proposed static 4/day draft budget with an *adaptive desired* count for Pin creative drafts and new Translator drafts, initially 1–10 each. The deterministic, separate `daily-cadence.ts` planner offers AUTO/FIXED/PAUSED. AUTO computes a modest target from eligible opportunity depth and signal strength and declines to force content if evidence is missing. Pending and completed work count toward the desired quota; independent authorized hard caps, connected account state and conservative budget capacity may reduce the additional work to zero, with reasons. The Pin candidate planner fairly rotates among eligible accounts with distinct editorial angles and visual identities; it cannot create/write content or publish. Publication count is based **only on individually approved Pins due**, not the requested creative quantity. Translator creation output is a draft; activation/public indexing remains a separately controlled quality gate.

`GrowthDailyCadencePreference` provides audited admin persistence; `/admin/growth/cadence` allows adjusting the preference safely without manipulating `GrowthSettings.enabled`, the worker lease or a scheduler. The current bounded scheduled intelligence cycle is **not** a cadence execution runner. Until separately approved worker integration, the preference has no autonomous side effects.


## Phase 14 autonomous content preparation: development (not deployed)

A separate, isolated daily runner is prepared for 06:30 UTC on a disabled-by-default systemd timer. It requires the exact deployed SHA, root-provisioned Growth-only OpenAI project credentials, a production loopback database, matching daily source intelligence jobs and a current KNOW-quality opportunity. It selects at most one distinct Translator and one Idea opportunity, runs one explicitly selected job at a time using the expiring 240-second Growth activation lease, and never opens the broad job queue.

The new `PREPARE` rollout scope refuses generic worker scans without `onlyJobId`; permitted job types are restricted to Translator and Idea decision/execution. It cannot publish Pinterest Pins, create a Pin candidate against an inactive page, or enable attribution. Existing business constraints still require quality, category, duplicates, AI reservation budgets and 1 Translator create/day and 2 Ideas/week. Generated pages remain unpublished until separately qualified activation; not a promise of automatic SEO indexing. No live scheduler is installed or enabled by this source PR.

A future release needs a coordinated root-owned installer, exact SHA pin, credential verification, populated-clone test when applicable, live read-only audit, and separately approved financial test. Do not combine content preparation with the currently active AI image timer or Pin publishing.


## Opt-in automated publication of newly generated Translator pages (development only)

An independent **disabled-by-default** one-shot `saytwist-growth-auto-translator-publish.timer` runs at **06:57 UTC**, after the separate 06:30 UTC opportunity/content-preparation cycle and before the 07:02 UTC AI creative generator. It changes a single **website** Translator's `isActive` from false to true, never creates or publishes a Pinterest Pin. It has no AI, Pinterest, Telegram or generic-worker credentials.

Admission is strictly release-pinned, checks the global Growth OFF / attribution OFF / lease-null state, rejects all unrelated running jobs (but allows an otherwise valid future individually approved publication), and caps new visible Translators at **one per UTC day** using append-only `GrowthActivity` evidence. Only a 72-hour-old-or-newer, original `GrowthContentVersion` CREATE from a completed worker decision, version 1, with finished required side effects, unchanged live snapshot checksum and no later version can qualify. It then checks active categories, complete original examples/FAQs, exact editorial/SEO boundaries, original generation quality diagnostics, and re-runs near-duplicate detection under the original Translator creation advisory lock. A stale, manually modified, ambiguous, duplicate or inadequate draft is **not published**.

Successful publication writes one append-only audit event inside the same transaction, then invalidates public Translator caches. If no qualified creation exists, no page is published; future fail-closed gating does not fabricate a quota. The service's private alert is throttled and the installer never enables/starts a timer. Publishing generated Translators is a distinct future **production opt-in** and must be staged/tested; it is not permission to auto-post Pinterest Pins.
