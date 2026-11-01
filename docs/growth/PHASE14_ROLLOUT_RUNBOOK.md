# Phase 14A — Production observation rollout and search quality gates

**Status:** feature branch implementation, not proof of autonomous operation. No schema migration. No recurring automation, paid model invocation, Pinterest publication, or first-party attribution opt-in has been activated.

## Why the worker is double gated

Phase 2-13 proved bounded job processing and per-Pin approval, but a single persistent `GrowthSettings.enabled` bit also makes every previously pending job executable. Thus turning it on blindly during initial observation could trigger old AI, website mutation or Pinterest jobs. Phase 14 adds independent `GROWTH_WORKER_RUN_ENABLED` and exact `GROWTH_ROLLOUT_MODE` checks, atomic queue claim allowlists, and allowlist-filtered retries/recovery.

Modes:
- **OFF**: default, no queue claim or heartbeat even if DB Growth is ON. Invalid modes fail closed.
- **OBSERVE**: account/board metadata sync; bounded inventory, account analytics and Pin analytics synchronization; harmless foundation no-op. These Pinterest API GETs may count toward Pinterest quotas, so they require operator rate-limit review before use. No publication or AI.
- **RECOMMEND**: OBSERVE plus deterministic account strategy, opportunity intelligence and Evergreen Learning analysis. Still no AI, content change or publishing.
- **AUTOPILOT**: unsupported, fails closed. Do not circumvent by broadening allowlists before per-Pin policy and safety checks.

The worker subprocess environment alone does not update `GrowthSettings`; operators must also approve changing its persistent kill switch. Every worker invocation is bounded and exits. Cron or systemd timers are not part of this release and must not be created before full queue inspection, read-only production preflight, rate-limit monitoring and outage recovery qualification.

## Search and AdSense observations

On 2026-10-28 the public SayTwist homepage was observed listing around 356 translators, some with substantial examples/FAQs but many using repetitive boilerplate. The /ideas public page displayed **0** published Ideas. These are observed public facts, not Search Console traffic statistics, and do not prove Google's review rationale. Google AdSense's official rejected-site guidance emphasizes significant original text, navigation and useful content. Google Search Central cautions against scaled content whose main intent is rankings rather than user help.

The empty /ideas hub stays accessible to users but now carries a dynamic `robots: noindex, follow` rule until at least one published public Idea exists, and is omitted from the sitemap until then. Filtered/pagination query views remain noindex. Real published Ideas keep their own canonical sitemap entries. Do not fabricate Ideas or automatically index hundreds of low-value pages to inflate crawl volume.

Before an AdSense resubmission, inspect the exact rejection notice, real Search Console pages/queries/indexing reasons, GA4 engagement, verified live robots/sitemap and a stratified review of at least 20 user-visible translators. Identify pages with generic/duplicate examples, ambiguous language versus style claims, unsubstantiated guarantees, or weak utility. Improve content **for users** with original demonstrations and true scope. No mass rephrasing or boilerplate stuffing.

## Phase 14 readiness checklist

1. All ordinary CI checks (lint, typecheck, all tests, Next build), plus scoped worker queue allowlist and empty hub sitemap regression tests.
2. Recheck public homepage, indexable translator example, /ideas `noindex` when empty, robots, sitemap, canonical and redirects after deployment.
3. Independent production DB read-only inspection of queued jobs by type/status and recent failed/unknown outcomes; do not run them or reset immutable audit.
4. Verify Pinterest account scope and rate-limit state; prefer one bounded read-only sync before any recurrence. Do not test API abuse defenses or publish Pins.
5. Verify public site and admin permissions, zero sensitive logs, existing web stability and rollback.
6. Only after these gates, decide a cautious OBSERVE window with one bounded invocation and explicit monitoring. Do not enable paid/model/creative publishing modes implicitly.
7. Review consent and privacy requirements before turning on first-party attribution. It remains independently double-gated and OFF.
8. Telegram reporting requires privately provisioned bot/chat values, a separate operational schedule, and a successful already-confirmed one-time recipient test. No automatic daily send is installed by this phase.
9. Final Phase 14 requires a completed implementation of draft/admission/publishing and monitored steady-state verification with **specific manual approval for each Pin**. Mode activation, infrastructure provisioning and the remaining operator checks must be documented in the rollout issue.

## Rollback

Immediately disable worker execution in operator-only secret configuration and stop any manually installed task. Keep global Growth disabled if uncertain. Preserve immutable reports, cost reservations, content versions, error evidence and Pinterest provider response IDs. The application-only backup/restore and GitHub exact-SHA deployment procedure remain authoritative.


## Owner-gated read-only production preflight (2026-10-29 follow-up)

The owner-created issue-comment workflow in `.github/workflows/growth-production-preflight.yml` must pass before any Growth switch, scheduled worker, paid work or Pinterest write is enabled. The Oct 29 release at `82c49c58688c688496a88cdeea86163be8ee90f5` passed guarded deployment, but subsequent read-only preflight `40875624035` failed during remote audit and printed no queue report. GitHub's failed-step environment showed an empty `PM2_CLI`; the deploy workflow separately validates `HOSTINGER_PM2_CLI`, and the root cause of the remote failure has not been independently established.

The first repair used the known NVM installation as fallback, but the successful guarded production deploy of `4541b1670758fe5a72e5e231038289714b6929f6` directly confirmed PM2 7.0.4 actually runs from the application user's `/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2` path. The follow-up fallback now prefers this proven executable, with the NVM bin path as a secondary fallback, when the optional deployment-supplied `PM2_CLI` is absent. No production-scoped GitHub environment or additional secret privileges are granted. The script rejects a nonexistent or nonexecutable PM2 path, verifies exact deployed SHA and online app, restricts DB targeting to production loopback, and runs Prisma reads only. Any failure emits one predefined `PRODUCTION_GROWTH_PREFLIGHT_FAILED_STAGE` from RELEASE_SHA, PM2_CLI, PM2_SNAPSHOT, PM2_APP_STATUS, DB_TARGET, DB_READ, REPORT_BUILD or REPORT_OUTPUT. It must not print exception text, env/PM2 JSON, tokens, chat IDs or DB URLs.

This change is *diagnostic only*: merging and guarded deployment do not prove a successful production audit. Trigger a single new exact-SHA owner-approved preflight only after deployment, inspect its sanitized `READONLY_PREFLIGHT_COMPLETE` queue/settings/account/flags evidence, and retain Growth OFF if any check fails. The owner-approved issue/comment must use the fresh main SHA, not replay an old authorization. No recurring process or Telegram send follows from passing the preflight.

## Phase 14B: verified current Pinterest quota before OBSERVE

Successful owner-gated production read-only audit `40887966490` on deployed SHA `4ae22c6dd6b72990d0fe9978acea8530b8a38554` reported `READONLY_PREFLIGHT_COMPLETE`. GrowthSettings.enabled, attribution and all worker/Telegram/rollout flags were OFF. The whole queue contained **no PENDING, CLAIMED, RUNNING, or FAILED_RETRYABLE jobs**, though immutable historical terminal and successful jobs remain. One Pinterest production account had configured scopes and an unexpired access token; its last recorded successful API call was October 11. The preflight did **not** prove live remaining quota.

Phase 14B adds `.github/workflows/growth-production-quota-probe.yml`, `workers/growth-quota-probe.ts`, and `lib/growth/operations/quota-probe.ts`. An exact-SHA owner-created issue and comment dispatch **one** GET to the official production Pinterest `/v5/user_account` endpoint. It decrypts the current OAuth token in process memory without refreshing it, verifies the returned account identity, validates rate-limit limit/remaining/reset headers, preserves at least five remaining requests, and never reports credential values or account identities. A provider denial or missing quota headers BLOCKS, not retries. The method reads one production DB account/settings/queue snapshot but writes no database state, does not enable Growth, and invokes no AI, Telegram or Pinterest write endpoint. Remote stages and result are printed as fixed sanitized codes/counters only.

This **quota probe is not yet a worker trial**. Do not mark OBSERVE qualified or start a worker until this exact-SHA probe succeeds, a one-bounded-job execution path with a reliable fail-safe global kill switch has been designed and tested, and a post-trial audit demonstrates Growth OFF, no unsafe job claims and no unwanted external calls. Since the global GrowthSettings.enabled bit would also permit unrelated older work, do not toggle it by ad-hoc SSH commands without an independently assured time-bounded rollback.

### First live quota probe and header parser correction (2026-10-29)

Exact-SHA release `32ce2f9c0fb9786bacc8289583ed2b98cb51cbbb` deployed successfully with backup, current migrations, healthy PM2 and matching release marker. Owner-approved quota probe run `40930166060` executed **one** official Pinterest account GET, then failed closed as `QUOTA_UNAVAILABLE`. No DB writes, token refresh, AI, publication or Telegram. Do not interpret this as exhausted quota; the helper rejected unrecognized/missing header evidence. Pinterest's official rate-limit docs show that `x-ratelimit-limit` may contain the composite `100, 100;w=1, 1000;w=60`, while the original parser accepted only decimal digits. A follow-up parser fix accepts only that strictly validated documented composite syntax or an integer, with independently mandatory numeric `remaining`/`reset` and the same five-call reserve. No missing header is inferred and any subsequent ambiguous result remains blocked. No automatic retry.


### Second live probe still blocked (2026-10-29)

After the official composite-header parser fix was qualified and deployed to `00e49ebb7b53a1ce263ae4400374453c38f7abcf` with backup and healthy restart, the second owner-approved one-GET probe run `40932345780` again blocked as `QUOTA_UNAVAILABLE`. This proves only that required usable header evidence remains absent or unrecognized, **not** that quota is exhausted. No further identical requests should be attempted. The next change reports only presence/shape of `x-ratelimit-limit`, `x-ratelimit-remaining`, and `x-ratelimit-reset` using `ABSENT | INTEGER | WINDOWS | OTHER`, with raw values/identities still suppressed. This enables one new explicitly owner-authorized diagnostic GET after guard/deployment and preserves the hard five-call reserve. If metadata cannot be obtained reliably, keep quota-dependent analytics/recovery and recurring Growth disabled while determining provider-specific alternatives or contacting Pinterest support.


### Sanitized limit-structure diagnostic (2026-10-29)

Owner-gated GET run `40943046583` on successfully deployed release `310283b343e96cfc11ffaf772d07c5e512c7fc9a` confirmed `QUOTA_UNAVAILABLE` with header kinds `limit=OTHER`, `remaining=INTEGER`, `reset=INTEGER`. This is **not evidence of depleted quota**. A follow-up bounded diagnostic reports only punctuation and abstract `A` (alphabetic run) / `N` (numeric run) structure for the limit header. It never reports original header bytes, account identifiers, credentials, or unrecognized characters. Existing remaining/reset numeric guards and five-call reserve remain unchanged. Run only one authorized GET on the newly qualified and deployed SHA; if formatting remains unknown, stop rather than retry repeatedly.


### Third probe and provider-independent worker qualification (2026-10-29)

After protected production deployment of `b1ff499d051ac4900fc4930bb5b2282f6fe37b00`, exact-SHA owner-authorized one-GET probe `40947587459` again blocked with `QUOTA_UNAVAILABLE`. The sanitized classes were `limit=OTHER`, `remaining=INTEGER`, `reset=INTEGER`; bounded value-free limit structure was `REDACTED` (unsupported characters or excessive length). The raw header and credentials were never emitted. **Stop repeated live quota probes.** Do not assume an available quota or activate recurring Pinterest work. The official developer documentation is insufficient to interpret this specific response safely without further evidence from the provider.

As an independent safety gate, the Phase 14 worker tests now verify that the process OFF flag avoids even the DB settings read, global Growth OFF avoids claims/heartbeat/dispatch, OBSERVE retries/recovery/claims share the restricted allowlist, and a forbidden Pinterest publishing job returned unexpectedly by the claim layer is released without dispatch. These mocked regression tests do not constitute a live worker execution, and do not authorize enabling the DB-wide Growth switch. A live one-shot still requires a bounded and independently recoverable global-switch lease and a post-run read-only audit.


### Historic provider metadata, no additional API requests

The standard Pinterest analytics adapter stores prior `lastRateLimitLimit`, `lastRateLimitRemaining`, `lastRateLimitReset` and `rateLimitObservedAt` in `GrowthPinterestAnalyticsState`. As the three 2026-10-29 live quota GET diagnostics have not yielded a parseable limit grammar, a later read-only production preflight now samples up to four historical state rows. It emits only the observation time, fixed-character-class limit structure (`A` letters, `N` digits, `S` whitespace, `X` disallowed characters), length band and numeric/absent/other classification of remaining/reset. No raw header value is logged. This query issues **zero Pinterest requests, zero DB writes, zero AI calls and zero Telegram messages**. Historic values may be stale or missing and must not be treated as current quota availability. The historical read cannot itself authorize a worker activation.


## Phase 14C incremental gate: exact-job scoped worker (code only)

The worker accepts an optional `onlyJobId` on `runGrowthWorker` for a future one-shot trial. When set, the worker forces a batch of one, selects only that exact pending ID through an atomic parameterized SQL filter, skips general retry promotion and stale-lease recovery, and verifies the ID again before dispatch. Both the process rollout allowlist and persistent `GrowthSettings.enabled` kill switch still apply; the scope does not grant permission to run any forbidden job type. A malformed ID fails closed without querying the queue. Normal, unscoped worker behavior remains unchanged.

**This is not activation.** The next independent gate must design and validate a reversible, expiring authorization for the global DB kill switch and an owner-approved one-shot operator workflow before any production OBSERVE job executes. Do not toggle Growth ON manually, start recurring workers, or assume exact-job scoping alone prevents a crash from leaving the global switch enabled.


## Phase 14C Step 2: expiring activation lease (code-only, not deployed)

An additive, nullable `GrowthSettings.workerActivationExpiresAt` field makes every OBSERVE/RECOMMEND worker fail closed when the field is null, invalid, expired or more than **five minutes** ahead. `GrowthSettings.enabled` and the independent process rollout allowlist remain mandatory. The worker checks the database-backed deadline at startup, just before queue claim, and before each dispatch. It also checks that the lease has not been replaced. A scoped `onlyJobId` invocation uses `finally` to compare-and-swap its **exact** deadline to `enabled=false, workerActivationExpiresAt=null`, with a single audited settings transition; it must never revoke a newer/different authorization.

The absolute deadline is the hard-crash fallback: if the process dies before `finally`, an expired lease cannot authorize future claims or dispatches even while the persistent `enabled` column has not yet been physically reset. Expiry does **not** interrupt an already running external request, and this release does **not** install an independent timer to clear the remaining database flag. A separate, owner-gated server-side cleanup/watchdog and post-run read-only audit are required before live activation. Do not call this full production rollback coverage until independently qualified.

**Production migration gate:** `20261029220000_growth_worker_activation_expiry` is additive, but the guarded Hostinger deploy refuses any pending migrations. This branch must not be promoted directly to production or merged as if deployment were complete. First validate a backup/clone, approve and apply the schema migration using the documented isolated migration procedure, then perform the exact-SHA protected application deploy and re-audit with Growth OFF. No scheduled worker, Pinterest call, AI spend, Telegram delivery or DB kill-switch change is authorized by this implementation.


## Phase 14C Step 3: isolated migration qualification and protected operator procedure

**Implementation only; no production migration or watchdog schedule has run.** Phase 14 PostgreSQL 18 CI now creates a disposable `saytwist_growth_phase2_test` database, applies the **pre-expiry** migration history, inserts an existing `GrowthSettings` record with Growth OFF, confirms the expiry column is absent, applies the full current migrations twice, then verifies the same row survives with a null deadline and exactly one applied expiry migration. The qualifier refuses any non-loopback host, unexpected port/database, differing `DATABASE_URL` and `GROWTH_TEST_DATABASE_URL`, or missing `RUN_GROWTH_MIGRATION_QUALIFICATION=1`. It does not contact production.

The reviewed, dedicated `scripts/hostinger-prepare-growth-expiry-migration.sh` is based on the existing Hostinger migration gate and only accepts `20261029220000_growth_worker_activation_expiry`. It checks the exact 40-character release SHA against an extracted migration bundle stored **outside** the application directory; disallows any additional pending/incomplete Prisma migrations; checks application health and readiness, exact production loopback DB, Growth/attribution OFF and zero active/claimable queue rows; enforces the shared deployment lock; creates and verifies a unique PostgreSQL **18** custom-format backup; then runs Prisma migration deploy and rechecks the application. The release bundle must be obtained from the completed, CI-qualified exact-SHA artifact. This procedure must be invoked by the `saytwist` SSH user with a separately approved `HOSTINGER_MIGRATION_APPROVAL=APPLY 20261029220000_growth_worker_activation_expiry`, matching `HOSTINGER_RELEASE_SHA`, and `HOSTINGER_MIGRATION_ROOT` pointing at the extracted reviewed artifact. No secrets or database URL may be copied into chat or GitHub logs. A separate owner-approved exact-SHA application deployment **after** the migration remains required. Never reuse the old analytics-gap migration approval string or run `prisma migrate deploy` ad hoc against production.

The independent `workers/growth-lease-watchdog.ts` is shipped with the application bundle but is **not scheduled**. It refuses to run unless `GROWTH_LEASE_CLEANUP_ENABLED=true` and `DATABASE_URL` targets `127.0.0.1:5433/saytwist`. It only compares and revokes a database lease that is already expired, setting `enabled=false` and the deadline to null in one audited transaction. It does not claim jobs, refresh Pinterest tokens, generate AI content, publish Pins or send Telegram. A renewed, unexpired lease cannot match its guarded update. Ordinary admin settings edits now clear a prior one-shot lease, rather than resurrecting it.

**Remaining gate before live OBSERVE:** approve/apply the production migration and protected application deploy, verify Growth OFF, then separately install and qualify a reliable independent schedule (for example, an operator-managed one-minute systemd timer running as SSH user `saytwist`) with after-crash test, alerting for cleanup failure and a post-run read-only audit. A deadline blocks future starts/dispatches but cannot interrupt an external call already in flight. Do not run the live worker or set `GrowthSettings.enabled=true` before these gates pass.


## Phase 14C Step 4: populated production-clone rehearsal (2026-10-30)

The operator reported a new PostgreSQL 18 custom-format production backup **restored** into the separate database `saytwist_phase14_rehearsal_20261030`, with matching 31 applied migration entries and no production migration. A second operator-run SQL transaction on that populated clone added the nullable expiry column, verified the existing global Growth OFF row, then rolled the change back; production remained at 31 migrations. These two checks established recovery and DDL compatibility but **not yet a recorded Prisma migration on the clone**.

PR #55 now provides `.github/workflows/growth-phase14-source-stage.yml`, an owner-only exact-main-SHA issue-comment gate `scripts/authorize-growth-phase14-source-stage.mjs`, and `scripts/growth-phase14-clone-rehearsal.cjs`. After PR merge and fresh main CI, a strictly owner-created issue with title `SayTwist Growth Phase14 clone staging <SHA>`, body `PHASE14_SOURCE_SHA=<SHA>\nPHASE14_SOURCE_TARGET=saytwist-phase14-clone`, and separate owner comment `STAGE SAYTWIST PHASE14 CLONE SOURCE <SHA>` stages a source-only archive under `/home/saytwist/.local/share/saytwist/phase14-rehearsal/<SHA>` and executes the reviewed Prisma migration against the exact **clone only** using the existing live PM2 database login with its database name replaced in-process. No production migration or provider work occurs in this workflow. The runner verifies the 31 source SQL checksums, exact production and clone baseline equality, no active Growth queue, Growth/attribution/reporting OFF, clone ownership, 32 migrated clone entries, matching new SQL checksum, the null expiry column, and unchanged production migration history.

The guarded **separate** live migration helper is `scripts/hostinger-prepare-growth-expiry-migration.sh` from the SHA-scoped private source archive. Unlike its first draft, it resolves the active runtime database URL from the already verified PM2 process when `.env` is absent, in a mode-0600 transient file **outside the web root**, deleted on exit. It also backs up into the private `phase14-backups` directory outside htdocs, enforces one exact pending migration, checks Growth/attribution OFF and no active queue, and runs `scripts/growth-phase14-verify-clone.cjs` to require the successfully applied and checksum-verified clone migration first. It will refuse to apply if any check fails. No production migration command has been executed. Once clone qualification passes, obtain separate explicit live-migration approval; afterward deploy the exact main SHA through the existing guarded Hostinger release bridge, run an independent read-only production preflight and confirm Growth still OFF. Do not install recurring workers, AI jobs, Telegram schedules or Pinterest publishing as a side effect.

## Phase 14C Step 5: host timer implementation awaiting qualification (2026-10-30)

Verified **live production evidence**: the approved expiry schema migration and exact-SHA protected application deployment are complete at `fb41d77346bc3714a9628b5149fed930ff100d1f`; [release run 41121788837](https://github.com/belhaouazakaria/styleport/actions/runs/41121788837) recorded 32 applied migrations, backup, health and readiness. [Read-only preflight 41123387091](https://github.com/belhaouazakaria/styleport/actions/runs/41123387091) returned `READONLY_PREFLIGHT_COMPLETE`, PM2 online, Growth/attribution/worker/Telegram OFF, zero active/pending jobs, a connected production Pinterest account with non-expired tokens, and no API calls, DB writes or messages. Historical Pinterest quota limits remain non-parseable and **do not** authorize worker execution.

The operator confirmed a disabled watchdog invocation prints `GROWTH_LEASE_CLEANUP=DISABLED`. Server inspection reports systemd 255, `systemd is-system-running=degraded`, a functioning per-user systemd manager but `Linger=no`, no application `.env`, and no existing watchdog timer. **Do not deploy a user lingering-dependent timer or place DB credentials in a unit.** Investigate existing failed units independently without modifying other services.

This code-only branch adds `workers/growth-lease-watchdog-launch.cjs`, which obtains the trusted PM2 process's `DATABASE_URL` in memory, validates exact local production DB target, process identity, deployed SHA, Node, and app path; spawns the existing one-shot watchdog via production tsx with a minimal child environment. It emits only fixed result labels. `workers/install-growth-lease-watchdog-systemd.sh` must be executed by `root` **only after a new, separate owner approval** and only when its explicit expected release SHA equals the active `.deployed-release`. It installs a root-owned system-level one-minute timer running the service as `saytwist`, with `ProtectSystem=strict` and a narrowly writable PM2 socket directory. Source and tests are packaged under `workers/` by the existing deployment bundle. Installation and enablement have **not** occurred. **Root execution safety:** never execute the installer directly from the writable application tree. Copy its reviewed source into a mode-0700, root-owned private file, check its SHA-256 against the audited, exact-release source, and execute only that verified root-owned copy; the installer rejects any other ownership/mode. No app-owned executable should be run as root.

**Remaining mandatory gates, in order:** (1) main CI and safe deployment of reviewed code, with Growth OFF; (2) non-mutating launch qualifications and `systemd-analyze verify` on target Hostinger runtime, plus investigation of existing degraded systemd state; (3) disposable populated-clone test of expiry cleanup, different/new lease CAS safety, crash cleanup and timer restart behavior; (4) separately approve root installation (never invoke install without approval); (5) confirm timer enabled/active, consecutive clean executions and a working **independent alerting route on failure**, including an intentionally induced *safe* failure; (6) new exact-release read-only production audit verifying all Growth and Telegram switches still OFF. A one-job OBSERVE activation is a **later separate approval**, not part of this watchdog gate. Lease expiry cannot cancel an in-flight provider call; missing failure alerting blocks activation.

## Phase 14C Step 6: PM2-independent failure alert, code-only and OFF (2026-10-30)

Host operator checks: deployed release `bff8ba47ba6d51ef343b621de71136873e887d55` and sanitized trusted PM2 production DB target validated, disabled-mode launcher returned `GROWTH_LEASE_CLEANUP=DISABLED`, and systemd calendar accepted consecutive one-minute ticks. Both installer and launcher are deployed but `TIMER=NOT_INSTALLED`. Brevo `BREVO_API_KEY`, `EMAIL_FROM`, and `ALERT_ADMIN_EMAIL` were confirmed `SET` in PM2 without exposing secrets or sending email.

An independent failure notifier `workers/growth-lease-watchdog-alert.cjs` is **code-only**. The root-owned timer installer adds `OnFailure=saytwist-growth-lease-watchdog-alert.service`, running under `saytwist`, using systemd `StateDirectory` and a separate root-owned mode-0600 `EnvironmentFile=/etc/saytwist-growth-watchdog-alert.env`. It uses Brevo SMTP HTTP API for a plain-text failure warning with a fixed subject and no URL, credentials or provider response in logs. The recipient, sender and API key come only from the root-managed file, not PM2, so it can alert even if the PM2 daemon is unreachable. A state file reserves at most one **attempt per hour**, before any network call. Ambiguous send attempts are not retried automatically. A successful provider API submission is not proof of message delivery.

Privileged provisioning helper `workers/provision-growth-lease-watchdog-alert-env.py` is **not authorized to run yet**. After independent owner approval, root must copy and verify the reviewed Python source to a root-owned mode-0700 location outside the app, verify that `/usr/bin/python3` resolves to a root-owned binary, and execute it only using `/usr/bin/python3 -I`, then invoke it with exact deployed SHA and `HOSTINGER_WATCHDOG_ALERT_PROVISION_APPROVAL=PROVISION SAYTWIST WATCHDOG ALERT <SHA>`. It obtains three already provisioned settings from the `saytwist`-owned PM2 daemon in a non-logging, in-memory child process and writes only those settings in a root-owned mode-0600 `/etc/saytwist-growth-watchdog-alert.env`. Secrets must never be printed or pasted into GitHub, chat, logs, or command-line arguments. This does not send email or install units. Root-owned installer similarly requires separate `HOSTINGER_WATCHDOG_INSTALL_APPROVAL=INSTALL SAYTWIST GROWTH LEASE WATCHDOG <SHA>` before installing any units. Keep those approvals separate.

**No live email send, credential provisioning, timer installation, failure injection, or global Growth activation has occurred.** Mocked Brevo tests and database clone tests are not live notification acceptance. Remaining gates: CI, protected code release, standalone systemd unit verification, disposable populated-clone expiry and crash qualification, separate owner-approved secret provisioning, separate owner-approved timer installation, two consecutive successful minute runs, a **separately owner-approved single induced-safe-failure email test with confirmed receipt**, and exact-SHA post-install read-only audit. Evaluate an external dead-man monitoring mechanism too because neither systemd nor Brevo can guarantee delivery during host/network outages. Never treat `OnFailure` configuration alone as proof of alert receipt.

## Phase 14C Step 7: privileged interpreter remediation (2026-10-31)

The owner verified the host lacks a root-owned Node executable (`ROOT_NODE=NOT_FOUND`); the root-owned Brevo alert file was absent, and the watchdog timer remained not installed. Therefore the original Node-based privileged provisioner is **blocked** and removed from the release source. Never run the old `workers/provision-growth-lease-watchdog-alert-env.cjs` as root, including a root-owned copy: it would execute the app-user-writable Node binary at root privilege.

The replacement `workers/provision-growth-lease-watchdog-alert-env.py` separates privilege boundaries: the privileged script runs only under a root-owned Python interpreter in **isolated** mode (`/usr/bin/python3 -I`) with a checksum-verified root-owned mode-0700 script outside the app. Root first requires the exact live release SHA and a separate owner approval `HOSTINGER_WATCHDOG_ALERT_PROVISION_APPROVAL=PROVISION SAYTWIST WATCHDOG ALERT <SHA>`. It validates the interpreter, its path, the reviewed script and trusted parent ownership, and refuses existing secret files. Its `runuser -u saytwist -- .../node -e` child reads the exact online PM2 instance and exports only the existing Brevo key, sender and private recipient to the privileged parent over a captured in-memory pipe. Node never runs as root. The parent validates the fields, writes a root-owned mode-0600 systemd EnvironmentFile atomically without overwriting an existing file and reports only fixed status labels. No send, unit, timer or Growth mutation is part of provisioning.

Required **next sequence**, all owner gated where privileged: (1) run main CI and PostgreSQL18 qualification on the remediation PR; (2) review/merge, exact-SHA protected deployment while Growth remains OFF; (3) new exact-SHA read-only preflight and host confirmation `/usr/bin/python3` resolves to a root-owned interpreter; (4) independently verify the Python source checksum against reviewed release evidence, then seek separate owner root-provisioning approval; (5) separately authorize/verify timer installation and a deliberately safe failure-mail delivery test; (6) post-install audit and one-job OBSERVE approval only after other gates pass. The prior clone SQL crash/expiry CAS rehearsal passed with explicit transaction rollback but **did not** exercise a physically installed system timer or real email delivery. No private credentials or host activation are authorized by this code-only revision.


## Phase 14C Step 6: owner-gated one-shot OBSERVE qualification (code only)

The isolated workflow at `.github/workflows/growth-observe-one-shot.yml` and
operator worker `workers/growth-observe-trial.ts` permit **one**
`FOUNDATION_NOOP` job under an exact-SHA owner comment, a 120-second
DB activation lease, independent watchdog and a minimal process environment.
A serializable transaction atomically admits exactly one idempotent job and
emits auditable transitions. Worker execution is scoped by exact job ID,
ignores unrelated retries, and both the worker and wrapper revoke the lease.
The host workflow rejects a missing/failed watchdog, active Growth, a nonempty
queue, the wrong app release or a changed/unauthorized request. It confirms
Growth OFF and the queue empty afterward, without provider calls.

**This section is design and tests only until the PR is merged, CI passes,
the exact main SHA is deployed and an owner explicitly runs the new workflow.**
It is not authorization for Pinterest, paid AI, recurring work, publishing or
Telegram scheduling. Pinterest quota headers are still unresolved. For owner
procedure, expected output and rollback, see
[PHASE14C_ONE_SHOT_OBSERVE.md](./PHASE14C_ONE_SHOT_OBSERVE.md).


## Phase 14D: bounded Pinterest provider quota evidence (code only, 2026-10-31)

The Phase14C host watchdog, independent alert delivery, protected deploy, and first
owner-approved `FOUNDATION_NOOP` one-job OBSERVE trial passed on deployed
`6d2cee3ba0854c1258dcab3e986e5c3d0072e873`. The scoped worker
successfully revoked its temporary activation lease; Growth is back OFF, with
no active jobs and zero Pinterest, AI, publication or Telegram activity.

**Pinterest provider barrier remains:** prior read-only GETs reported an
unrecognized `x-ratelimit-limit` grammar (`OTHER`, value redacted) but
numeric `x-ratelimit-remaining` and `x-ratelimit-reset`. This does not
prove category-wide, account-wide or app-wide available quota. Official
Pinterest limits differ across Trial/Standard tiers and endpoint categories;
see https://developers.pinterest.com/docs/reference/rate-limits/ and
https://developers.pinterest.com/docs/key-concepts/access-tiers/.

This PR adds an **in-process one-GET diagnostic request ceiling** that reserves
one request **before** the network call. A timeout, HTTP 429, 5xx, or successful
GET all consume that allowance; the same invocation never retries. For the
single authorized diagnostic GET only, a nonempty but unrecognized limit header
can yield `ONE_GET_REMAINING_CONFIRMED` **if and only if** the response is 2xx,
remaining is a canonical nonnegative decimal above five, reset is a canonical
integer from 0 through 86400 seconds, the returned account identity matches,
and all existing production/Growth-OFF checks pass. Otherwise fail closed.

A documented, internally consistent numeric or composite limit yields
`QUOTA_PROBE_PASSED`; an unrecognized limit yields `limit: null`,
`limitGrammar: UNRECOGNIZED`, and an explicit
`recurringAuthorized: false`. The owner-gated GitHub workflow rejects any
unexpected status/shape, any provider writes, and any value other than one
locally reserved request. No raw header, credentials or identity are logged.
**This local guard does not coordinate across processes, hosts or other apps.**
It is suitable only for an isolated one-request diagnostic, not for lifting
production scheduling limits. There are no schema changes or automatic retries.

The historical three failed-format probes MUST NOT be repeated automatically.
One new GET requires a **new exact-SHA owner approval** after reviewed CI,
protected deployment, watchdog release-SHA rotation and fresh preflight. Do not
retry after a failed outcome without investigating. Even a successful diagnostic
does **not** authorize a live sync, recurring provider work, paid AI, Pin
publishing, or Telegram reporting. To proceed to one actual account sync, add
an independently approved one-job workflow with a shared/persistent per-account
request admission mechanism and post-run read-only audit. Do not turn on
unscoped OBSERVE or generic Pinterest jobs from this diagnostic alone.


## Phase 14E: first controlled Pinterest account synchronization (code only)

**Launch target:** qualify one actual `PINTEREST_ACCOUNT_SYNC` job. As of
2026-10-31, protected Phase14D release `627d248b7f991a97908fd2c5bae7f9feeea13b57`
passed independent read-only preflight, the independent watchdog was updated and
tested, and owner-gated one GET `41247305759` returned documented
`limit=100, remaining=99, resetSeconds=1` with **one** API GET and zero
writes/AI/Telegram. This is per-response quota evidence, not authorization
for recurring API usage.

This branch adds a **separate** owner-created issue-comment workflow at
`.github/workflows/growth-one-account-sync.yml` and a short-lived
`saytwist`-user launcher under `workers/`. It accepts exactly the trusted
main SHA with issue title `SayTwist Growth one account sync <SHA>`,
body `ONE_SYNC_SHA=<SHA>\nONE_SYNC_TARGET=saytwist.com`, and distinct owner
comment `RUN SAYTWIST GROWTH ONE ACCOUNT SYNC <SHA>`. Only after protected
deployment, matching watchdog SHA update and read-only Growth-OFF audit should
this workflow be approved. No recurrence is installed or authorized.

The operation requires one CONNECTED production Pinterest account, at least
15 minutes of access-token validity (thus no OAuth refresh), the required
user_accounts:read scope, zero active/retryable Growth jobs, Growth/attribution
OFF, independent watchdog success, and no automation flags. A serializable
transaction locks that account row, ensures no prior reservation in the last
24 hours, records a durable immutable `GrowthActivity` request reservation,
turns on a **120-second DB activation lease**, and inserts exactly one
maxAttempts=1 `PINTEREST_ACCOUNT_SYNC` job. The worker processes only that
job ID; the account-sync handler uses a one-request-only GET transport
restricted to `https://api.pinterest.com/v5/user_account`. It forbids other
endpoints, methods, token refresh, redirects, automatic retries, and further
requests, including after timeout or 429. Quota headers must meet the Phase14D
five-request reserve before any metadata update.

Success requires the one job to SUCCEED, account metadata timestamps to
advance, the lease to be revoked in finally, global Growth OFF, and
zero active queue. The independent systemd watchdog remains the hard-crash
fallback. The workflow emits only fixed result labels, never credentials or
account identity. It permits account metadata database updates but **no**
Pinterest publishing, AI work, translator changes or Telegram messages.

**Budget scope:** the durable one-per-24-hour reservation is only for this
owner-gated account-sync qualification. It does not enforce a global,
cross-feature Pinterest API limit. Do not infer that all existing scheduled
Pinterest endpoints have shared admission. Recurring OBSERVE must get
a separate shared/persistent provider quota policy and monitored frequency
before being enabled. If this one-shot fails, do not rerun on the same day
or attempt provider calls outside the owner workflow.

**No schema migration:** reuses existing account, activity, settings and
GrowthJob tables. No production migrations should be applied for this change.

**Remaining Growth launch definition:** (1) this first scoped real metadata
sync, (2) bounded recurring OBSERVE/RECOMMEND with independent rate, budget,
kill-switch and monitoring proof, (3) manually approved small Pin publication
plus confirmation and attribution/analytics. SEO and AdSense continue afterward
as a separate track. Do not introduce additional gates unrelated to these
explicit objectives.


## Phase 14E first live attempt and production env bootstrap repair (2026-11-01)

The owner's exact-SHA production read-only preflight completed successfully at
`2e61bdce2345a22f335568c59537b7954d28d80f` (GitHub Actions run
`41313270939`): Growth, attribution, recurring schedules and Telegram all OFF;
zero active/retryable queue; one CONNECTED production account with unexpired
credentials. The owner then approved issue #85. The one-account-sync workflow
`41313439736` failed with `GROWTH_ONE_ACCOUNT_SYNC_LAUNCH=BLOCKED`
before a one-shot job or request reservation was created. Independent,
read-only production diagnostics showed Growth OFF, no lease, queue zero,
`TRIAL_JOB=NONE`, `TRIAL_API_RESERVATION=NONE`, watchdog and alert healthy.

Cause: the Phase14E launcher's original code required the five Pinterest
credentials/configuration variables to appear in the PM2 process snapshot;
none were set there. The operator verified that `.env.production.local`
and `.env.local` are present and that the standard Next.js production
environment loader resolves **all five** Pinterest variables and a valid-length
32-byte encryption key. This matches the regular Growth worker's existing
Next environment bootstrap policy. **Do not generate or replace the encryption
key**, overwrite the env files, restart PM2 or reconnect OAuth on this evidence.

The repair loads the existing Next production environment files in the
already-identity-checked `saytwist`-user one-shot launcher, rejects missing
or invalid production Pinterest config, and passes only the five approved
Pinterest variables to its minimal child environment. The trusted production
database URL still comes exclusively from the already-validated PM2 snapshot.
One-job/max-one-GET, quota, watchdog, exact-SHA authorization, idempotency,
24-hour reservation, and fail-closed controls remain unchanged. Regression
tests must confirm Next env precedence, only-five-variable forwarding, and
missing/invalid configuration rejection without exposing secret values.

**This source repair is not proof of a successful sync.** Require CI and a
protected exact-SHA deploy, rotate the root-owned watchdog SHA, and rerun the
read-only production preflight against that *new* SHA. Only then create a
distinct owner issue/comment approval for a single new Pinterest request.
Do not replay issue #85; do not enable recurring Growth, AI, publication or
Telegram during the repair.
