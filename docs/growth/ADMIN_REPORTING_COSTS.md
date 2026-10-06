# Admin, Reporting and Cost Controls

## 1. Admin location

Use the existing SayTwist admin.

Primary route:

`/admin/growth`

Do not create a separate Growth subdomain for the initial system.

Reasons:

- shared authentication;
- shared database;
- shared translator/content model;
- shared settings/secrets;
- fewer deployment/security boundaries;
- easier operator workflow.

The worker may be a separate process without becoming a separate web product.

## 2. Growth navigation

Recommended sections:

- Overview
- Opportunities
- Accounts
- Pins
- Analytics
- Content
- Schedule
- Experiments
- Agent Activity
- AI Spend
- Reports
- Warnings
- Settings

## 3. Overview

Top-level cards:

- qualified Pinterest conversions;
- Pinterest landing sessions;
- outbound clicks;
- outbound CTR;
- saves;
- impressions;
- Pins published;
- Pins awaiting approval;
- translators created/updated;
- Ideas pages created/updated;
- AI spend today/month;
- AI cost per qualified conversion;
- system health.

Include deltas versus an appropriate comparison period.

## 4. Agent Activity

Show an auditable decision log:

- what the agent decided;
- action type;
- topic;
- evidence summary;
- confidence;
- estimated value;
- estimated cost;
- actual cost;
- resources created/changed;
- outcome when available.

Do not display hidden model chain-of-thought. Store structured reasons/evidence instead.

## 5. Opportunities

Opportunity cards should show:

- opportunity title;
- content cluster;
- evidence;
- recommended action;
- target account;
- destination type;
- confidence;
- expected value;
- expected spend;
- state.

## 6. Pin approval queue

Because current Pinterest developer rules require the user to choose each Pin to publish, the admin needs an efficient approval workflow.

Each card shows:

- exact image;
- Pin title/description;
- destination;
- account;
- board;
- topic;
- intended posting time;
- reason/evidence;
- duplicate/similarity status;
- estimated role in experiment.

Actions:

- Approve this Pin
- Edit
- Regenerate
- Reject
- Defer

Scheduling happens only after explicit approval of the specific Pin.

## 7. AI spend ledger

Record per AI operation:

- provider;
- model;
- request/job;
- tokens/input/output where available;
- image generation usage;
- estimated or actual monetary cost;
- account;
- translator;
- Ideas page;
- Pin;
- decision ID;
- timestamp.

Aggregate by:

- today;
- week;
- month;
- feature;
- model;
- account;
- content cluster.

## 8. Cost settings

Support:

- daily AI spend ceiling;
- monthly AI spend ceiling;
- generated-image ceiling;
- new translators/day;
- translator edits/day;
- Ideas pages/week;
- Pin candidates/account/day;
- research depth;
- model preference;
- growth intensity preset.

Presets should translate into explicit settings visible to the admin.

## 9. Reporting

One daily executive digest is sent to one configured recipient.

Preferred shape:

**SayTwist Growth · <date>**

- Pinterest visits and delta
- qualified translator uses and delta
- breakout topic/Pin
- Pins published/approved
- translators/Ideas created
- AI spend
- one or two important warnings
- tomorrow's plan

Then:

`Open full Growth Report -> /admin/growth/reports/<id>`

Avoid sending every Pin/action in the message.

## 10. Notification providers

Use an abstraction:

- WhatsApp
- Email
- future providers

WhatsApp is desired, but do not assume it is free.

During implementation:
- verify current WhatsApp Business Platform requirements/pricing;
- configure one recipient;
- use approved templates where required;
- provide email fallback;
- record delivery status.

## 11. Warnings

Warnings do not automatically disable an account unless the user explicitly configures such a rule.

Examples:

- outbound CTR drop;
- qualified conversion drop;
- repeated publishing failures;
- Pinterest auth expiration;
- API warning/rejection;
- unusual account performance;
- high content similarity;
- AI spend acceleration;
- broken attribution;
- stale analytics.

Each warning includes:

- severity;
- evidence;
- recommended action;
- affected resources;
- status;
- admin resolution notes.

## 12. Settings safety

Dangerous/high-impact settings should require deliberate confirmation:

- disconnect Pinterest account;
- clear analytics;
- change attribution definition;
- large spend-limit increase;
- enable a newly approved publishing mode;
- delete Growth history.

## Screen action contract

| Screen | Primary data and actions | High-impact action / access |
|---|---|---|
| Overview | KPI, freshness, health; drill down | ADMIN read |
| Opportunities | evidence/score; defer, dismiss, inspect | ADMIN decisions |
| Accounts | connection, boards, health; reconnect, recommend | connect/disconnect requires ADMIN confirmation |
| Pins | exact image/copy/URL/account/board/time/evidence/similarity; approve, edit, regenerate, reject, defer | approval and publication settings: ADMIN, audited |
| Analytics | Pin and conversion series; filter/export | ADMIN read; export privacy review |
| Content | translators/Ideas, versions; inspect/rollback | rollback ADMIN, audited |
| Schedule | due jobs and approved Pins; defer/cancel | cancel ADMIN, audited |
| Experiments | hypothesis/variants/results; pause/stop | ADMIN, audited |
| Agent Activity | decisions, transitions, errors; inspect | ADMIN read |
| AI Spend | daily/monthly/model/feature and cost per QPC; tune intensity | limit increases ADMIN confirmation |
| Reports | archive/delivery; resend | resend ADMIN, idempotent |
| Warnings | evidence/recommendation; acknowledge/snooze/resolve | ADMIN, no automatic performance account shutdown |
| Settings | kill switch, limits, attribution model, report channel | ADMIN, versioned/audited |

Every AI call records provider/model, tokens or image units, estimated and actual cost when available, pricing version, job/decision/account/translator/Idea/Pin links. Unknown prices are unpriced, never represented as free. Daily/monthly aggregates and cost per QPC use matching windows. The concise digest has one recipient through a provider interface, with WhatsApp if feasible and email fallback. No fixed budget is assumed.

## Phase 2 admin implementation

`/admin/growth` is implemented inside the existing admin shell and navigation. It shows kill-switch state, queued/claimed/running/retryable/terminal job counts, oldest runnable job, latest bounded worker execution, recent structured activity, Phase 4 Pinterest analytics facts, and the safe Phase 5 attribution gate state. `GET /api/admin/growth` returns the same authenticated status. `PUT /api/admin/growth/settings` updates `enabled`, `intensity`, `workerBatchSize`, normalized `ownedDomains`, and bounded attribution enabled/window/retention fields; it uses the ADMIN guard, same-origin validation, strict Zod input and an audited transactional update. The server environment gate is shown only as a boolean and cannot be changed from the UI. Phase 13 cost/report controls remain unimplemented.

Phase 3 adds `/admin/growth/accounts`. It renders three publication-role slots, Sandbox/Production state, configuration readiness, connected identity, scopes, token expiry metadata, sync health, board count and discovered boards. Actions change role, enqueue bounded sync, reconnect through OAuth, or deliberately disconnect. Tokens, ciphertext, app secret and encryption key are never selected for display.

Phase 4 adds `/admin/growth/analytics`. It selects a connected account and 7/30/90-day range, optionally filters Pins by title/ID, shows whole-account totals and a daily table, and returns at most 50 currently eligible Pins ordered by outbound clicks. The UI separately labels inventoried Pins, analytics-relevant Pins, and eligible processed/total progress, and discloses that account totals may include unrelated history. The table includes safe `pinimg.com` previews, resolved board, validated HTTP(S) destination, publish time, core metrics, derived outbound CTR and last sync. The page reads only local PostgreSQL. Its same-origin ADMIN action enqueues bounded work and never waits for backfill or calls Pinterest in the request.

Phase 5 adds `/admin/growth/attribution`. It supports 7/30-day bounded aggregate views for valid Pinterest landing sessions, attributed trusted translations, one-per-session QPC and conversion rate, plus up to 20 ref/Pin/translator dimensions and latest ingest. It shows the environment and database gate separately, fixed model version, window and 30/90 retention policy. An ADMIN same-origin tool issues/reuses one stable active ref for an active analytics-eligible existing Pin and generates a clearly labeled test destination URL; it does not update Pinterest or claim the old Pin contains that URL. A second action enqueues idempotent bounded retention cleanup. The page states that old Pins without `pin_ref` are outside deterministic first-party attribution and that Pinterest outbound clicks are not SayTwist sessions.


## Phase 6 account strategy admin

`/admin/growth/strategy` is an ADMIN-only read surface over bounded local PostgreSQL queries. It shows the three planned roles even when unconnected, portfolio counts/readiness/recommendation/confidence, explicit evidence-quality warnings, recent Pinterest evidence, intent alignment, attribution as `NOT_COLLECTING` with QPC unavailable, up to 100 synchronized boards with advisory eligibility/reasons, and the latest durable monthly review. No credential ciphertext or decrypted token is selected or rendered.

`POST /api/admin/growth/strategy/reviews` requires ADMIN plus the existing exact same-origin check. It accepts no arbitrary strategy parameters and only enqueues the current period/version bounded job. The action cannot enable attribution, call Pinterest, change a role, or mutate an account, board, or Pin.

## Phase 7 opportunity intelligence admin

`/admin/growth/opportunities` is ADMIN-only and server-rendered from local persisted rows. It displays the latest evidence window and quality, Pin cap usage, cluster and opportunity counts, attribution collection state, a bounded Pin-signal table for winner/rising/fatigue observations, and a separate ranked cluster-opportunity table with score/confidence/type/status. A viral Pin remains visible even when concentration or insufficient content depth prevents a cluster opportunity. The POST route requires ADMIN and same origin and only enqueues the daily idempotent job. It cannot change status, publish, call Pinterest, or mutate accounts, boards, Pins, Translators, Ideas, or creatives. Analysis and report queries have fixed caps.

Phase 7 has no AI or external trend cost. Opportunity evidence records cost as `NOT_APPLICABLE`; `NullTrendProvider` makes no request. This must change through a later versioned decision before any paid provider contributes evidence.
