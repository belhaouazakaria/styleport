# Growth Agent V2 — implementation and qualification record

Status: development branch, not deployed. Production release approval and Discord provisioning remain separate gates. This document supersedes the Telegram-only transport decision for new V2 configuration, but does not assert that production has completed a cutover.

## Current evidence

- Development started at `a5d93f7e50a87007e046dbac34976b46304b98a9`; GitHub main and the latest successful Hostinger deployment record matched that SHA.
- Public `/api/healthz` and `/api/readyz` returned HTTP 200 with healthy/ready JSON during this work. This verifies those endpoints only.
- A fresh SSH audit verified the deployed SHA is still `a5d93f7e50a87007e046dbac34976b46304b98a9`, PM2 online, 36 applied migrations, all twelve protected timers enabled/active and their release pins matching that SHA. Database inspection used explicit read-only transactions and returned only selected operational fields. The application account has no general privileged shell; restricted backup freshness and production-backup clone rehearsal remain unverified.
- Latest service results were failed for daily-observe, approved-publisher, daily-account-analytics and viral-source; the other eight were successful. Enabled timers alone do not establish operational health. Global Growth/Attribution remained OFF with no activation lease; AI limits remained 200 cents/day, 3,000 cents/month, three images/day and one Translator/day.
- Four jobs remain PENDING with zero attempts: the two specifically approved November 14 Pins at 18:00/23:00 UTC, and the Playground ACCOUNT_SYNC/BOARD_SYNC pair from November 14 13:11 UTC. Both publications remain SCHEDULED without provider Pin IDs. The inventory pair blocks the old publisher's idle admission; its historical one-shot repair is scoped to a different November 9 pair and cannot safely consume these jobs.
- All three production accounts remain CONNECTED with required create scopes, stored credentials and healthy recorded token expiries. Main has Text Style and Translators boards; Ideas and Playground have no synchronized active boards. Only Main has an analytics state, with last account observation November 13 04:20 UTC. No new provider analytics or board inventory was fetched during this audit.
- Source mode remains ACTIVE, 50% allocation, maximum five Pins/day, with 88 DISCOVERED / 94 REVIEW / 68 REJECTED concepts and four PLANNED source drafts. Candidate inventory contains 19 READY and nine DEFERRED rows; READY does not imply unapproved.
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

`GrowthAnalyticsCoverage` records provider/account/type, supported window, gap dates, quality flags, last success, rate-limit evidence, errors and linked backfill. Bounded automatic planning reuses existing recovery task/checkpoint/idempotency machinery. An isolated RECOVER rollout permits only one exact recovery job ID; no generic recovery worker sweep is permitted. Pending/retry read-only jobs can coexist with other routines only after validating their persisted recovery identity and idempotency key. Claimed/running jobs still block competing worker leases. The optional board-readiness stage first consumes at most one existing ACCOUNT_SYNC/BOARD_SYNC job using INVENTORY mode. It verifies read type, the exact account-only payload, idempotency/creation minute, connected production account, scopes, credentials, token health and the entire competing queue. The leased worker accepts only that exact job ID and the two read types. It never recreates jobs or claims Pins. Scoped read retries promote only the selected due ID, retaining attempts and error history; unrelated Pin retries remain untouched.

The V2 account-analytics path processes up to three connected production accounts independently and refreshes 28 completed dates per account. Existing one-account behavior remains the default until V2 opt-in. The readiness stage can synchronize one stale account's boards per run using complete-only official reads; it never creates a board. Publication rotation, quotas and approved account identity remain unchanged.

The existing official transport quotas (including the 4/hour and 16/day controls), provider headers, reservations and watchdog still apply. Failed analytics remain unavailable; they are not zeros. GA4 and Search Console have separately opt-in read-only service-account adapters and daily observation storage. They are not live-connected or provider-verified. Date labels retain GA4 property time zones and finalized Search Console Pacific dates; key events are not assumed to be qualified translations. Initial reads cover a policy-bounded 90 days and daily refreshes cover seven dates, with three bounded transient attempts/day, delayed rate-limit retries and explicit omitted-date flags. History outside the existing supported Pinterest 90-day window is recorded as unavailable.

## Runtime and configuration

All new runtime work is default-off. Credentials belong in root-managed secret environment files, never repository files, chat, command arguments, public variables or logs.

Web callback and courier need the following identity settings:

- `GROWTH_DISCORD_ENABLED=true`
- `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`
- `DISCORD_OWNER_USER_ID` (the verified human's Discord ID)
- `GROWTH_DISCORD_OWNER_USER_ID` (that owner's existing ADMIN database user ID)

The bot token `DISCORD_BOT_TOKEN` is required only by the private courier/report transport, not by the web callback.

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

`scripts/growth-v2-recovery-audit.ts` is read-only by default. It locates the original candidate and existing `reoffer-cmw7hj593000ea59zk36osdzu` recovery identity, verifies the exact managed public path, PNG bytes/checksum and visual evidence, compares copy/destination/account with the original, and matches account/board against an immutable terminal publication. The original candidate may have a nullable board, so it is not sufficient board-consent evidence. A separate preparation flag creates a fresh unified review with a quota/rotation-aware future recommendation; it cannot approve or publish.

The historical Telegram failure's actual provider root cause is **unknown**. The old implementation catches transport/validation errors and records UNKNOWN with a generic failure. A fresh database audit found no Telegram review row for this recovery candidate. Therefore a transport failure is not established: the old path normally creates its durable row before sending. Current read-only scheduling returned AVAILABLE; this does not establish the historical failing condition. No retained provider response or historical trace establishes a more specific cause. The transaction gap in the old decision implementation is a separate source-level defect addressed by the new transaction boundary; it is not evidence of the historical send failure's cause. Do not reset or replay the original failed publication.

The live recovery audit verified the existing PNG is 1000×1500 and its SHA-256 matches `1899866da0ca965b7323307b30046e92f44c0bdaac959d743b8b81078a6f5272`. Image/copy/destination/account match the original. Text Style is the board in both the recovery candidate and the failed publication's immutable approval, although the original candidate's board field is null. The original publication remains FAILED_TERMINAL with zero attempts and PUBLICATION_REVALIDATION_FAILED. A new unified review cannot be persisted until the protected migration/release; no fresh decision or publication has been fabricated.

Migration 37 also repairs a separately proven legacy defect: migration 36's Telegram status constraint omitted EXPIRED although deployed cleanup writes it. Real PostgreSQL qualification now verifies that terminal state persists. This is not claimed as the cause of the historical recovery send failure.

## Database and release gates

Four additive migrations follow the existing 36-migration baseline:

1. `20261115120000_growth_unified_approvals`
2. `20261115130000_growth_intelligence_coverage`
3. `20261115140000_growth_viral_evidence_windows`
4. `20261115150000_growth_google_analytics`

Disposable PostgreSQL 18.3 qualification applies all 40 migrations. The final populated fixture rehearsal applied the original 36 migrations, restored fixture data and upgraded to 40, preserving counts of 9 Translators, 9 candidates, 6 approvals and 1 publication. This is **not** a rehearsal against a current production backup. A fresh restricted production backup, full isolated restore, invariant verification and exact-artifact rehearsal remain mandatory before production approval.

`workers/coordinate-growth-v2-release.sh` pins OLD to `a5d93f7...`, holds/restores the twelve existing timers, requires 36 migrations before hold and all four exact migrations/40 total before restore, and admits only an empty queue or the exact four audited job/publication identities, payloads, original schedules and immutable approvals. It freezes SHA-256 evidence for the full jobs, candidates, approvals and publications across hold/restore. Changes or unrelated jobs fail closed. Its SQL passed against production in an explicit read-only transaction; intentionally wrong job identity and missing-approved-status variants returned BLOCKED. This qualifies the read predicate, not execution of root timer coordination. Authorized hold/restore failures attempt to leave all twelve timers disabled. It never discards approved/failed/completed history. Do not cancel or reset jobs to satisfy the guard.

After an explicitly approved V2 inventory run consumes the pending read jobs, the existing publisher may resume the two previously approved Pins under its original timing and snapshot gates. It refuses Pins more than 24 hours past due. This release neither extends that tolerance nor reschedules their approvals. If that deadline passes, use the existing fresh review/rescheduling policy; never silently replay them.

`scripts/hostinger-prepare-growth-v2-migrations.sh` requires a root-owned reviewed source bundle outside the app, matching release SHA, held timers, exact old migration inventory, separate `APPLY growth-v2-20261115` owner approval and a verified private PG18 backup. It does not deploy application code. Owner acceptance of the production-backup clone rehearsal is required before invoking it. The existing Hostinger guarded deployment and subsequent timer verification remain separate. New V2 timers must remain disabled until Discord recipient/interaction/Admin acceptance and independent monitoring checks pass.

## Validation and remaining acceptance

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `GROWTH_V2_TEST_DATABASE_URL=<exact disposable loopback URL> npm run test:growth-v2-db`. The DB runner refuses any target except `127.0.0.1:55439/saytwist_growth_v2_test`. CI adds an isolated PostgreSQL 18 service. No test requires real Discord/Pinterest/OpenAI credentials.

Local authenticated browser checks verified the Approval Center at desktop and 390×844 mobile sizes, plus the Intelligence dashboard. These checks used only the disposable fixture database; actual production Pin preview/decision acceptance remains pending.

Automated coverage includes real Ed25519 signatures, stale/tampered requests, owner/DM/message identity, replay, Admin boundaries, concurrent cross-channel decisions, transaction rollback, stale/expired snapshots, terminal rejection, DB evidence immutability, Discord outage/429/unknown sends/finalization, budget-change consent, statistical winner qualification, original conversion lineage, scoped recovery, account-specific image prompts and source/native comparison.

Pending acceptance is explicit: live board synchronization and full service recovery; actual Discord owner provisioning and DM/button receipt; protected production-backup clone rehearsal/release; the failed-Pin recovery review and owner's exact decision; a real Pinterest result and post-publication metrics; source/native generation quality against real provider outputs; real pending-Pin visual and browser interaction acceptance; Google service-account/property authorization and live acceptance; live cohort policy calibration acceptance. Passing mocks or fixture tests does not establish these outcomes.

### Recorded local qualification results

- Full default suite: 204 files / 1,064 passing tests at the final full run; 18 opt-in suites skipped in that invocation.
- V2 qualification includes real PostgreSQL approval, retry, legacy-expiry and exact inventory-worker cases plus pure/security checks; final totals are recorded below.
- Existing PostgreSQL regressions: publishing 17/17, analytics recovery 14/14, finance/concurrency 8/8, learning 14/14. Account analytics passed 9/9, including the one-GET portfolio path. Together with the final 15 V2 PostgreSQL cases, 77 real database integration cases passed.
- Typecheck and production build passed. ESLint reported no errors and 16 existing warnings at the recorded pass.
- Existing learning fixtures now pin their intended October evaluation clock. Recovery tests now explicitly provide the required activation lease and exact-ID RECOVER scope. Production kill switches and authorization rules were not relaxed to satisfy old tests.
- V2 account refresh omits optional top-Pin fan-out so three account baselines use three GETs, fitting the existing four-request/hour ceiling before any separate provider quota admission. Source Pin analytics and normal pin-maintenance supply individual evidence independently.

These results do not establish real Discord delivery, third-party generation quality, production backup compatibility or a successful live Pin publication.


## Google authorization and source references

The Google stage is separately disabled unless `GROWTH_GOOGLE_ANALYTICS_ENABLED=true`. The restricted intelligence environment needs `GROWTH_GOOGLE_SERVICE_ACCOUNT_JSON` from an owner-provisioned service account and either/both `GROWTH_GA4_PROPERTY_ID` and `GROWTH_SEARCH_CONSOLE_SITE`. Approved Search Console targets are `sc-domain:saytwist.com`, `https://saytwist.com/`, or `https://www.saytwist.com/`. Enable the official Analytics Data and Search Console APIs and grant this service account read access to the intended GA4 property and verified Search Console property. Do not enable domain-wide impersonation. Store the JSON only in the root-managed secret environment file. The web app/courier receive no Google private key.

The adapter signs short-lived RS256 assertions with one read-only scope per source and a fixed Google token endpoint, rejects external token endpoints, schema drift, truncated/thresholded GA4 data, duplicate/out-of-range dates and invalid metric values. Date-only reports have at most 90 rows under a 100-row request limit; an unexpected larger count fails closed rather than silently truncating. Missing report dates remain unavailable; no synthetic zeros or translation conversions are created.

Verified primary references during implementation:

- [Discord signed interaction requests](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Discord message transport and nonce semantics](https://docs.discord.com/developers/resources/message)
- [Pinterest developer publication guidelines](https://policy.pinterest.com/en/developer-guidelines)
- [Google Analytics Data API reports](https://developers.google.com/analytics/devguides/reporting/data/v1/basics)
- [Search Console query and finalized Pacific date semantics](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Google service-account OAuth assertions](https://developers.google.com/identity/protocols/oauth2/service-account)


### Final artifact qualification and remaining owner gates

The final four-migration populated fixture rehearsal completed **36 → 40** and preserved 9 Translators, 9 candidates, 6 approvals and 1 publication. Default-suite qualification passed **1,064 tests / 204 files**. V2 qualification passed **45 checks**, including **15 real PostgreSQL cases**. These include a real lease/claim/handler/complete cycle consuming an existing inventory pair against GET-only provider mocks, preserving the OFF settings and creating no publication. The remaining PostgreSQL regression suites contribute 62 cases. Exact-head CI, lint, typecheck and build evidence must pass before owner release review.

Required external gates:

1. Owner authorization for the exact protected release/migration/timer coordination, and access through an approved privileged deployment session. The available application SSH account cannot read the restricted backup inventory or execute the required root coordinator; its only sudo entry is a hosting wrapper, which was not used to bypass this restriction. Complete the restricted production-backup clone rehearsal and verify independent backup freshness before applying migrations.
2. Owner-provisioned Discord application, public key, bot token, verified Discord owner ID and matching existing Admin user ID in the documented secret environment files. Enable the new integration only after explicit authorization; validate DM, button receipt and independent Admin decisions before disabling Telegram. Do not paste secrets into the PR or chat.
3. The recovery Pin requires its own exact owner decision after its fresh unified review exists. Deployment authorization does not approve it. No provider lifecycle or Discord finalization may be claimed until that action actually completes.
4. Google analytics is optional and remains OFF until the owner grants a service account read access to the intended properties and authorizes enablement. Source/native winner calibration, generated content quality and learning effectiveness require actual observed campaigns; mocks cannot establish them.

No production database writes, external provider requests, Pin decisions, timer changes, migration, merge or deployment were performed in this mission. The new code is TESTED, while production integration acceptance remains BLOCKED on the specified external gates. The read-only VPS audit is LIVE-VERIFIED evidence of the existing deployment's state, not a live verification of V2 execution.

### Production finalization — November 15 follow-up

The follow-up rechecked production at `a5d93f7...` and found eight services with failed latest results, twelve enabled/active timers and the same protected queue. Root access is now available through a dedicated expiring SSH key; no privilege boundary was bypassed.

Two PR review findings were corrected before release: source analytics advances a bounded attempt cursor past invalid, already-reserved or failed experiments, and conversion-specific creatives can revisit previously promoted Translators. Conversion jobs are bound before paid dispatch, retain one-attempt admission across days/accounts, and reconcile only their explicitly bound READY candidate and successful generation job. Ordinary exploration keeps its never-promoted filter. Regression qualification passed 1,068 default tests and 50 V2 checks, including 16 real PostgreSQL cases.

A fresh private PostgreSQL 18 custom backup was created on the VPS and verified with `pg_restore --list` and SHA-256. An off-host RSA-OAEP-SHA256/AES-256-GCM encrypted copy was stored outside the repository, with its private key retained only locally. Authenticated decryption reproduced the 6,001,412-byte dump and checksum `a0323b9d3911140069f080cc7d3fcb0bdd15c9440f319f02177522a962d07549`. This verifies the off-host artifact; the isolated full restore and exact migration rehearsal must also pass before protected release approval.

A root-only hidden-input Discord provisioning helper was staged outside the application at `/root/saytwist-v2-finalize/provision-discord.py`. It writes only a mode-0600 staging file and does not enable the integration. The owner must create the application and enter its identity/token there, never in chat or logs. Protected release and per-Pin approvals remain separate requirements.

### Independent V2 incident monitoring

Before activating the new services, install their independent `OnFailure` handlers. `saytwist-growth-v2-alert@courier.service` and `@intelligence.service` use the already configured private Brevo alert credentials, a plain Node executable and separate systemd state directories. They do not require Discord, PostgreSQL, Next.js or PM2 to submit an incident. Each component reserves suppression before dispatch and makes at most one attempt per 24 hours, including ambiguous email outcomes. Payloads contain fixed incident metadata only, never child logs, bot tokens, provider bodies or database URLs.

The courier completes independent receipt processing and delivery work before checking recent UNKNOWN/DEAD sends. Unresolved delivery incidents make the service fail visibly so the independent channel can notify the owner. Reviews normally closed before delivery are excluded. This does not authorize resending uncertain messages or replaying decisions. The installer still creates disabled V2 timers only and now requires the existing trusted mode-0600 watchdog alert environment file.

Qualification also corrected the older market-research alert's copied entrypoint/export name; a disabled CLI regression test now executes that real file. Because these operational fixes change the release artifact, the earlier `932f687...` release authorization must not be reused for a different SHA. The independently authorized Playground board was already created successfully (HTTP 201, PUBLIC, ID `1087267603730995425`) and requires no second creation or approval.
