# Growth Agent V2 — implementation and qualification record

Status: development branch, not deployed. Production release approval and Discord provisioning remain separate gates. This document supersedes the Telegram-only transport decision for new V2 configuration, but does not assert that production has completed a cutover.

## Current evidence

- Development started at `a5d93f7e50a87007e046dbac34976b46304b98a9`; GitHub main and the latest successful Hostinger deployment record matched that SHA.
- Public `/api/healthz` and `/api/readyz` returned HTTP 200 with healthy/ready JSON during this work. This verifies those endpoints only.
- Current root-owned timer states, release pins, backup freshness, scheduled/publication rows, connected board inventories and the recovery candidate have **not** been independently inspected on the VPS. No usable SSH host configuration or privileged live database session was available locally. GitHub deployment logs are historical evidence, not a fresh runtime audit.
- No live Discord message, Pinterest write, AI request, board creation, attribution activation, production migration, timer installation or production deployment was performed.

## Unified consent and delivery

`GrowthApprovalRequest` is the authoritative owner decision, separate from `GrowthNotification` delivery and `GrowthDiscordInteraction` receipt records. Pin snapshots bind image checksum and URL, revision, content hash, actual title/description, destination, account, board, recommended UTC slot, reason, risks and cost. PostgreSQL prevents snapshot changes/deletion and terminal decision reversal. Admin and Discord decisions use the same row lock and commit the native approval/publication/job, source approval, or specifically approved budget adjustment inside one transaction. A rollback cannot leave a recorded approval without its corresponding internal action.

`/admin/growth/approvals` works without Discord credentials or availability. It lists review evidence and history, provides exact-pin approve/reject controls, and prepares native/source reviews. `/admin/growth/intelligence` exposes real conversion lineage, coverage, publication outcomes and activity, linking existing account, finance and report screens. Existing detailed Creative Lab, Viral Intelligence, account, analytics and finance interfaces remain in use.

Discord uses a private bot DM and native components, Ed25519 verification over the raw request body plus timestamp, a five-minute signature freshness limit, application/owner/DM/channel/message matching, durable unique interaction IDs and checksum-bound single-use decisions. The HTTP endpoint persists the receipt and acknowledges it before executing the decision. No interaction tokens or raw callback bodies are stored. The bounded courier consumes receipts and updates the original message; approval/rejection/expiry disables its action buttons. Later publication status refreshes edit that same message.

Confirmed 429 responses retry after the provider delay. A message POST timeout, 5xx, malformed success response, database failure after dispatch, or interrupted SENDING lease becomes UNKNOWN and is never blindly resent. Idempotent PATCH cleanup can retry independently. DM-channel creation may retry because it does not create a notification or perform the approved action. Eight send attempts bound known recoverable failures. Discord nonces provide additional short-window duplicate protection, not an indefinite exactly-once claim.

Budget-change reviews describe before/after ceilings and require the original policy version and current values to match. Approval changes only those ceilings; it does not initiate paid work. Arbitrary operational commands are not executable payloads. Production releases and board creation retain their dedicated authorization/execution boundaries.

## Source intelligence and original native expansion

The existing robots-aware Anything Translate catalog, editorial rating, original source artwork, portfolio quota admission and source publisher remain in use. A separate one-experiment official analytics reader covers our source-linked Pins without broadening ordinary owned-domain analytics eligibility. It verifies local ownership/account and unchanged source destination, collects bounded completed-date metrics and preserves missing/PROCESSING evidence.

Winner scoring adds configurable Wilson lower confidence bounds. New observations retain metric windows and account baseline sample counts. Baselines must cover the complete comparable window with at least 1,000 impressions; baseline upper confidence bounds make promotion conservative. New native conversion decisions require qualified observations at least 24 hours apart, mature exposure, nondecreasing counters, matching source destination, fresh official evidence and a priority editorial-fit rating. Missing/legacy sample/window evidence cannot create a native proposal. Stages distinguish insufficient evidence, emerging, promising, high-confidence winner and decline.

`GrowthViralConversion` connects the source concept and winning source Pin to one original Translator decision, the resulting Translator and a separate native creative job. Existing catalog matches are reused. New decisions enter the existing category, deduplication, quality, immutable version, AI admission and unpublished-content executor. Source qualification is rechecked before paid generation and inside the final content transaction. The existing authorized website activation workflow remains responsible for public availability.

Under V2 opt-in, the existing content preparation worker prioritizes qualified source conversions within the same cadence/content/budget limits. The existing daily fresh-creative worker prioritizes eligible active native Translators. Reconciliation links its actual generation job, rather than introducing an orphan creative job. Every new native Pin still needs a fresh individual owner decision. Source Pin destinations are never changed.

Learning compares source/native outbound rates over the same seven completed UTC dates, requires complete official daily observations and minimum samples, and archives conservative confidence-interval comparisons. It does not describe clicks as qualified conversions. An opt-in, versioned cohort advisor re-ranks already editorially qualified source research by at most ±5 points. It uses the latest comparison per conversion, requires at least three distinct source concepts sharing a non-generic theme and a ≥75% direction agreement, and records structured reasons. It cannot change winner confidence, quality gates, budgets or publication permission. Actual cohort behavior still requires live outcome acceptance.

## Coverage, accounts and recovery

`GrowthAnalyticsCoverage` records provider/account/type, supported window, gap dates, quality flags, last success, rate-limit evidence, errors and linked backfill. Bounded automatic planning reuses existing recovery task/checkpoint/idempotency machinery. An isolated RECOVER rollout permits only one exact recovery job ID; no generic recovery worker sweep is permitted. Pending/retry read-only jobs can coexist with other routines only after validating their persisted recovery identity and idempotency key. Claimed/running jobs still block competing worker leases.

The V2 account-analytics path processes up to three connected production accounts independently and refreshes 28 completed dates per account. Existing one-account behavior remains the default until V2 opt-in. The readiness stage can synchronize one stale account's boards per run using complete-only official reads; it never creates a board. Publication rotation, quotas and approved account identity remain unchanged.

The existing official transport quotas (including the 4/hour and 16/day controls), provider headers, reservations and watchdog still apply. Failed analytics remain unavailable; they are not zeros. GA4 and Search Console ingestion are **not implemented/connected by this change**. The dashboard explicitly identifies that absence. History outside the existing supported Pinterest 90-day window is recorded as unavailable.

## Runtime and configuration

All new runtime work is default-off. Credentials belong in root-managed secret environment files, never repository files, chat, command arguments, public variables or logs.

Web callback and courier need:

- `GROWTH_DISCORD_ENABLED=true`
- `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`
- `DISCORD_OWNER_USER_ID` (the verified human's Discord ID)
- `GROWTH_DISCORD_OWNER_USER_ID` (that owner's existing ADMIN database user ID)

Discord's Interactions Endpoint URL is `https://saytwist.com/api/growth/discord-interactions`. Signature-checked PING is supported. Configure private DMs with the intended owner and verify actual delivery before cutover. No guild approvals, privileged message-content intent or public command channel is needed.

`workers/install-growth-v2-systemd.sh` creates **disabled** courier and intelligence services/timers only. It requires root, exact deployed SHA and `GROWTH_V2_INSTALL_APPROVAL=INSTALL_DISABLED_V2:<sha>`. It does not create secret files or start services. Each root-managed environment file must supply `GROWTH_V2_SERVICE_APPROVAL=SAYTWIST_V2:<courier|intelligence>:<sha>`. The launcher checks OS identity, deployed SHA and PM2 database identity, forwarding only mode-specific credentials. Courier runs once per minute; intelligence once per hour after explicit activation. Root environment files must be mode 0600.

Courier opt-ins:

- `GROWTH_DISCORD_COURIER_ENABLED=true`
- Optional `GROWTH_AUTOMATIC_REVIEW_PREPARATION_ENABLED=true` (at most three preparations/tick; no approvals)

Intelligence opt-ins:

- `GROWTH_V2_INTELLIGENCE_ENABLED=true`
- Optional independent `GROWTH_AUTOMATIC_BACKFILL_ENABLED=true`, `GROWTH_SOURCE_ANALYTICS_ENABLED=true`, `GROWTH_AUTOMATIC_BOARD_SYNC_ENABLED=true`

The source/board/recovery reads require the existing authorized Pinterest runtime credentials. The courier does not receive Pinterest/OpenAI credentials. V2 flags on the existing account-analytics/content/fresh-creative root environment files connect their new paths. Existing AI project isolation, per-request admission, immutable usage evidence, daily/monthly/image/content caps and uncertain-paid-call protections are unchanged.

Daily reporting supports `GROWTH_NOTIFICATION_PROVIDER=DISCORD` independently of Telegram configuration, using immutable archives plus durable Discord outbox records. The root private-report launcher forwards only the selected transport credentials. Telegram should be explicitly disabled after a successful Discord/Admin acceptance; the legacy code remains available during the controlled cutover. Independent Brevo watchdog/incident alerts remain intact. New V2 stage incidents are queued once per stage/day; a blocked stage does not suppress independent stages.

## Failed Pin recovery

`scripts/growth-v2-recovery-audit.ts` is read-only by default. It locates the original candidate and existing `reoffer-cmw7hj593000ea59zk36osdzu` recovery identity, verifies PNG bytes/checksum, compares copy/destination/account/board with the original, and requires immutable original terminal publication evidence. A separate preparation flag creates a fresh unified review with a quota/rotation-aware future recommendation; it cannot approve or publish.

The historical Telegram failure's actual provider root cause is **unknown**. The old implementation catches transport/validation errors and records UNKNOWN with a generic failure. Neither a raw provider response nor live logs were available in this audit. The transaction gap in the old decision implementation is a separate source-level defect addressed by the new transaction boundary; it is not evidence of the historical send failure's cause. Do not reset or replay the original failed publication.

## Database and release gates

Three additive migrations follow the existing 36-migration baseline:

1. `20261115120000_growth_unified_approvals`
2. `20261115130000_growth_intelligence_coverage`
3. `20261115140000_growth_viral_evidence_windows`

Disposable PostgreSQL 18.3 qualification applies all 39 migrations. A separate populated fixture rehearsal applied the original 36 migrations, restored fixture data and upgraded to 39 while preserving counts of 9 Translators, 9 candidates, 6 approvals and 1 publication. This is **not** a rehearsal against a current production backup. A fresh restricted production backup, full isolated restore, invariant verification and exact-artifact rehearsal remain mandatory before production approval.

`workers/coordinate-growth-v2-release.sh` pins OLD to `a5d93f7...`, holds/restores the twelve existing timers, requires 36 migrations before hold and all three exact migrations/39 total before restore, and refuses an active queue. It never discards approved/failed/completed history. If future approved Pins remain, wait for an appropriate quiet window or prepare a separately reviewed exact-publication hold; do not cancel them to satisfy this guard.

`scripts/hostinger-prepare-growth-v2-migrations.sh` requires a root-owned reviewed source bundle outside the app, matching release SHA, held timers, exact old migration inventory, separate `APPLY growth-v2-20261115` owner approval and a verified private PG18 backup. It does not deploy application code. Owner acceptance of the production-backup clone rehearsal is required before invoking it. The existing Hostinger guarded deployment and subsequent timer verification remain separate. New V2 timers must remain disabled until Discord recipient/interaction/Admin acceptance and independent monitoring checks pass.

## Validation and remaining acceptance

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `GROWTH_V2_TEST_DATABASE_URL=<exact disposable loopback URL> npm run test:growth-v2-db`. The DB runner refuses any target except `127.0.0.1:55439/saytwist_growth_v2_test`. CI adds an isolated PostgreSQL 18 service. No test requires real Discord/Pinterest/OpenAI credentials.

Local authenticated browser checks verified the Approval Center at desktop and 390×844 mobile sizes, plus the Intelligence dashboard. These checks used only the disposable fixture database; actual production Pin preview/decision acceptance remains pending.

Automated coverage includes real Ed25519 signatures, stale/tampered requests, owner/DM/message identity, replay, Admin boundaries, concurrent cross-channel decisions, transaction rollback, stale/expired snapshots, terminal rejection, DB evidence immutability, Discord outage/429/unknown sends/finalization, budget-change consent, statistical winner qualification, original conversion lineage, scoped recovery, account-specific image prompts and source/native comparison.

Pending acceptance is explicit: fresh live VPS audit and board synchronization; actual Discord owner provisioning and DM/button receipt; protected production-backup clone rehearsal/release; the failed-Pin recovery review and owner's exact decision; a real Pinterest result and post-publication metrics; source/native generation quality against real provider outputs; real pending-Pin visual and browser interaction acceptance; GA4/Search Console adapters; live cohort policy calibration acceptance. Passing mocks or fixture tests does not establish these outcomes.

### Recorded local qualification results

- Full default suite: 201 files / 1,050 passing tests at the recorded full run; 18 opt-in suites / 200 tests skipped in that invocation.
- V2 qualification command: 23 passing checks, including 10 real PostgreSQL integration cases plus 13 pure/security checks.
- Existing PostgreSQL regressions: publishing 17/17, analytics recovery 14/14, finance/concurrency 8/8, learning 14/14. Together with V2, 63 real database integration cases passed. A further account-analytics regression suite covers the one-GET portfolio path.
- Typecheck and production build passed. ESLint reported no errors and 16 existing warnings at the recorded pass.
- Existing learning fixtures now pin their intended October evaluation clock. Recovery tests now explicitly provide the required activation lease and exact-ID RECOVER scope. Production kill switches and authorization rules were not relaxed to satisfy old tests.
- V2 account refresh omits optional top-Pin fan-out so three account baselines use three GETs, fitting the existing four-request/hour ceiling before any separate provider quota admission. Source Pin analytics and normal pin-maintenance supply individual evidence independently.

These results do not establish real Discord delivery, third-party generation quality, production backup compatibility or a successful live Pin publication.
