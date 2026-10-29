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
