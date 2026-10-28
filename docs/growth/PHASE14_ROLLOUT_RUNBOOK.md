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
