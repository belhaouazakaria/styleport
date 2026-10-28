# Phase 13 reporting quality follow-up (2026-10-28)

## Verified production baseline

- PR #15 merged and application deployed under merge commit `3f057334c5eff5393555e38a469243d1b99d74db`. Previously rehearsed and backed-up Phase 13 schema has 31 applied, 0 incomplete migrations. Web health and readiness passed; PM2 web is online.
- A single private `growth-20261024` report was deliberately authorized and human-received on 2026-10-25. Its immutable `GrowthDailyReport` archive has delivery state `SUBMITTED`. It must **never be rewritten, deleted, retried, backfilled in place or resent**.
- Both Telegram gates were OFF outside the one-time subprocess, Growth settings and attribution remained OFF. No recurring timer, publisher or paid AI worker was installed.
- The operator-supplied report showed missing Pinterest/attribution coverage, zero managed publishes/content creations, unknown AI billed spend, and a default "No action recommended". The original formatter truncated the third cost-provenance warning.

## This follow-up and interpretation

The follow-up modifies **future** archive construction and read-only report page wording only, without a schema migration. No provider calls, synthetic analytics rows, publication actions, AI usage or scheduling are added.

1. **Evidence-gated breakout.** Label a Pin `Top measured Pin` only when (a) account daily metrics are READY for all connected accounts; (b) each active analytics-eligible Pin has one READY, non-null outbound-click observation for that UTC report date; and (c) the chosen Pin has positive, safely representable outbound clicks. Rank by daily outbound clicks with stable ID tiebreak. This is descriptive: not incremental lift, qualified conversion attribution, or evidence to auto-publish.
2. **Useful but conservative next review.** Missing account-level Pinterest evidence prompts a coverage review; missing first-party attribution prompts an attribution-readiness review; complete evidence may suggest reviewing the top measured Pin but explicitly retains individual approval before publishing. Avoid the unconditional "No action recommended" when nothing was observed.
3. **Billed spend vs reservations.** Existing budget reservation records are pessimistic ceilings, **not provider charges**. A separate field `aiReservedCents` captures the UTC day's booked ceiling (if safely representable) while `aiSpendUsd` stays `null` until external, verified, Growth-project-specific billing settlement is implemented. Display `Unavailable (billing not reconciled)` and label the reserved ceiling `not billed spend`. Zero reservations do not establish $0 actual AI spend.
4. **No hidden warnings.** The plain-text digest includes up to five sanitized warnings, with an explicit count when further warnings remain in the immutable archive snapshot. Preserve the Telegram transport's strict 3,500-character limit; tests cover actual Phase 13 warnings and overflow.
5. **Existing archives and admin routing.** Older `growth_daily_v1` archives are not rewritten. The admin page already renders archival line breaks through a text-only `pre` element with `whitespace-pre-wrap`, and calls `requireAdminRoute` before reading the report. Its no-send archive readers enforce a strict ID format and bounded listings.

## Verification and remaining gates

- All ordinary CI: ESLint, TypeScript, Vitest, Next build. Focused evidence-gating tests must cover complete and partial daily Pin metrics, missing attribution, billing/ceiling separation, complete warnings, concurrent insert handling and no duplicate transport.
- Existing Phase 13 PostgreSQL 16/18 qualification applies unchanged to the same 31-migration schema; this follow-up adds **no** migration. DB integration tests may run only against exact named disposable database targets, never the populated VPS production database.
- Admin functional smoke (still requires actual authenticated operator review): report list/detail, 7/30-day Spend inventory, Warnings list and ACK/RESOLVE same-origin guards, mobile 320px/tablet 768px/desktop 1440px, keyboard focus and secrets not appearing in page markup. Automated static admin guard tests do not prove a live guest/non-admin session denial; this must be checked explicitly.
- The official OpenAI organization Costs API supplies aggregate daily project costs, **not precise billed per-request charges**. A proven dedicated Growth project and immutable provider-source window evidence, or explicit acceptance of unavailable actual allocation, are needed before any aggregate can be described as Growth-only. Do not install an organization Admin API key on the public web runtime. No fabricated payment totals, automatic settlement, or privileged read is permitted.
- A further independent operator decision is required to accept aggregate-only cost reporting and to activate any **daily** Telegram schedule. This PR does not authorize either. Do not merge, deploy, turn on Growth, enable attribution, publish Pins, run a paid model or schedule messages merely because CI is green.

## Rollback and audit

Do not edit historical report `growth-20261024` or its once-only Telegram claim. Application-only rollback is possible with the established release mechanism; data/financial evidence tables and immutable database triggers stay intact. Production Growth, attribution and Telegram recurrence remain default disabled.
