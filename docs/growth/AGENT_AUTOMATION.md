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

## Phase 14I: bounded recurring local intelligence (code only)

The new `workers/growth-autonomous-cycle.ts` is a guarded daily **local-only**
analyzer, not a permission to create/publish content. At 04:30 UTC, only when
a separately approved systemd timer is enabled, it attempts three jobs in
order: monthly Account Strategy Review, daily Opportunity Intelligence v2 and
Evergreen Learning v2. The analysis evidence window ends on the prior complete
UTC day, and a plan version and UTC date anchor each job idempotency key.
Previously succeeded steps can be reused; prior failed/uncertain steps
block rather than replay. No follow-up jobs or retries are issued automatically.

Each new job requires a zero-active-queue global preflight, disabled Growth
settings, disabled attribution, null worker lease and a serializable admission
transaction. A 120-second global worker lease is issued for one ID-scoped job,
then revoked using the established compare-and-swap helper. The independently
installed one-minute lease watchdog handles crashes. After every step the
runner requires the job to have SUCCEEDED, Growth OFF, lease NULL and no
active queue. It does not invoke Pinterest, OpenAI, publishing or Telegram,
and passes no such credentials to the child.

`workers/growth-autonomous-cycle-launch.cjs` additionally checks exact
release and app identity, PM2 production DB, healthy same-SHA independent
watchdog, **active healthy daily OBSERVE**, all global automation flags OFF,
and the 04:30-04:49 UTC window before bootstrapping the run. Its systemd
installer provisions root-owned oneshot/timer/private failure-alert units in
an **inactive and disabled state**, never enabling them. Explicit owner
authorization, reviewed code, post-deploy root SHA rotation and production
read-only qualification are necessary before enabling recurrence.
The autonomous cycle is meant to run after the prior 23:50 UTC OBSERVE,
not during its 24-hour metadata quota window. The cycle is DB-only and
cannot compensate for stale or absent Pinterest analytics.

This is one part of the intended full agent. Automatic content generation,
private Telegram scheduling and scheduling of **already individually approved**
Pins must each preserve separate consent/budget/approval/reconciliation
and live-qualification gates. No ordinary Growth rollout mode is broadened.

### Phase 14I private recurring Telegram digest (implementation only)

A separate opt-in 05:30 UTC systemd one-shot reporter runs only after the
04:30 UTC autonomous analysis service succeeds. It uses the existing
`workers/growth-report-runner.ts` and immutable report archive /
once-only delivery service; the report covers the last complete UTC day.
`workers/growth-autonomous-report-launch.cjs` verifies exact deployed SHA,
production app identity, watchdog, recently successful analysis service,
PM2 production DB, process-level Growth OFF, private numeric Telegram chat
configuration, and a strict 05:30-05:49 UTC execution window. It passes only
the two Telegram credentials and the two reporting gates to a scoped child.
No content or PM2 environment is logged. The Telegram transport verifies
the response chat type is PRIVATE, and durable SENDING/OUTCOME_UNKNOWN
never cause automatic resends or duplicate digest delivery.

The root-owned installation script provisions service/timer/private
failure-alert units, **disabled by default**. Automatic reporting is not
enabled by a code merge. The owner must approve its timer separately
after verifying the recipient and an actual one-time receipt, as well as
the live production analysis cycle. The private report must not misstate
reservation-based AI spend as verified provider billing.

### Phase14I automatic content preparation and selected Pin publication (review build)

A separately opted-in `PREPARE` worker mode is allowlisted for
Translator/Ideas decision and execution and deterministic Creative Lab
candidate generation only. The `workers/growth-autonomous-content.ts`
runner verifies today's local strategy/opportunity/learning jobs succeeded,
then selects at most **one high-evidence Translator and one distinct
high-evidence Ideas opportunity per UTC day** from the same current
Opportunity Intelligence v2 analysis. Thresholds are 75/80 for Translator
and 70/75 for Ideas. Missing or partial/stale evidence selects nothing.
Each decision/action/creative uses an independently scoped job and a
240-second time-limited DB activation lease. Existing application handlers
enforce authoring quotas, similarity/quality/reuse rules, revision rollback
and hard AI-cost reservations. Unknown or failed paid calls are never
replayed automatically. Creative generation uses a deterministic
MINIMAL_STATEMENT asset, with the paid AI-image switch explicitly OFF.
Candidate creation does **not** imply Pin approval.

The standalone launch checks production identity, SHA, watchdog, daily
analysis success, an independent Growth OpenAI project key (unequal to
the site's normal key), the global OFF switches and the 06:30-06:49 UTC
window. The opt-in root-owned systemd one-shot/timer/private-alert
installer never enables or starts the timer. This is code implementation,
**not proof of a paid production acceptance run**. Before activation,
the operator must verify the separate AI project hard billing cap and
fresh budget ledger, approved content review/rollback, persistent image
storage, and one bounded live content generation with no existing queue.

A separate `APPROVED_PUBLISH` worker mode is allowlisted for **only**
`PINTEREST_PIN_PUBLISH` after two independent process gates. The
`workers/growth-approved-pin-tick.ts` selector considers only due,
previously persisted publications linked to an individually ADMIN-APPROVED
Pin and its original delayed publication job. Each 15-minute tick processes
at most **one exact job ID** under a 120-second lease and the same
independent watchdog; it cannot create an approval. The existing
`publishApprovedPin` revalidates immutable candidate revision, asset
checksum, metadata, destination, account, board, schedule and original
approval before using official Pinterest API v5. Global provider limits,
retry classification and ambiguous result reconciliation continue to
apply. Reconciliation-required outcomes result in operator alert, never
a second blind Pin POST. A separate root-owned timer/private alert is
installed but disabled by default. Live activation requires reviewed
per-Pin acceptance, a valid provider quota, a matched deployed release
and explicit separate owner approval. No general AUTOPILOT mode is
enabled; bulk unapproved publishing remains prohibited.
