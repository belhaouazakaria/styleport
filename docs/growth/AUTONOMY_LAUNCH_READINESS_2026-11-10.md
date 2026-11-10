# SayTwist autonomous Growth: launch preparation and blockers

Prepared 2026-11-10. One authoritative continuation document. Source changes reside in PR #171, branch feat/growth-viral-daily-discovery-v1. No code from this PR is deployed.

## Verified state before this PR

- Application production SHA: b0ecf638effe2ca5212989d817d2f8c186bb4f57.
- PostgreSQL 18 production migration count: 35.
- Nine existing root-owned, exact-SHA-pinned Growth systemd timers, enabled and active after successful protected restore.
- Global Growth OFF and attribution OFF between narrowly scoped scheduled operations.
- Viral Program REVIEW; original AnythingTranslate editorial rating from PR #170 live and visually verified.
- Private Telegram single-message delivery previously verified; recurring daily delivery must be separately accepted.
- Two original pending owner-scoped Pinterest account/board sync jobs must never be deleted to make a safety gate pass.

## Latest owner decisions

- One connected Pinterest account now, two more planned, possibly more. Owner creates/connects accounts; Growth can only recommend new accounts.
- Up to TEN new original design generations per connected account per UTC day and up to TEN eligible Pins per connected account per day. One account aims for ten; three accounts aim for thirty. A quota is a ceiling, not an obligation to publish low-quality or unapproved content.
- Distinct editorial idea and design for any translator reused on two accounts, matched to account audience and suitable boards.
- Official Pinterest API data: fetch ALL available authorized account, board and Pin records with cursor-based resumption and rate-limit/backoff protection. There is no deliberate total-history truncation; time-limited analytics remain limited by provider capabilities. Preserve relevant mature metrics and historical snapshots.
- Agent chooses timing independently by account: randomized cold-start exploration followed by learned high-performing slots with ongoing exploration; never overwrite an owner-approved Pin time.
- One original/new-idea research cycle per day and one combined private Telegram digest per day.
- Flexible AI spend and priority on results, but still explicit hard spending caps, private project credentials, rate-limit protection, provider cost evidence and budget-related reporting. Do not silently enable unlimited spending.
- Initially balance original SayTwist and honestly source-linked research channels 50/50 for each account, while maintaining verified originality and third-party licensing/destination truthfulness.
- Pinterest's current developer guidelines require users to individually select each Pin for publishing. Automated creation, analysis and scheduling of individually approved Pins is allowed; blanket auto-approval is not.

## Implemented in PR #171 source, NOT in production

- workers/growth-viral-discovery.ts plus the SHA-pinned launch helper, disabled-only systemd installer and private failure alert: one reviewed, allowlisted public catalog scan at 08:15 UTC, deduped per day, no AI or Pinterest write.
- lib/growth/portfolio/per-account-creatives.ts: pure ten-design-per-account portfolio planner, shared budget round robin, reused translator only with different idea AND art direction.
- lib/growth/portfolio/per-account-posting-schedule.ts: per-account ten-slot timezone/DST-aware cold-start, explore/exploit timing proposal. Does not publish Pins.
- lib/growth/portfolio/per-account-budget.ts: conservative, explicit, configurable daily/monthly reservation envelope proposal; makes no spend-setting change.
- lib/growth/pinterest/analytics.ts and analytics-contract.ts: remove arbitrary ten-page/2,500-Pin TOTAL inventory limit, preserve three official provider GETs per invocation, persistent continuation bookmarks, loop detection and safe integer counters.
- workers/coordinate-growth-nine-timer-multi-account-preview-release.sh: code-only nine-timer release coordinator pinned to current OLD production SHA. Keeps 35 migration baseline, Growth OFF, Viral REVIEW, reserved owner sync jobs and all nine timer pins.
- New tests: discovery runtime and disabled installation, per-account creative planning, account-local UTC/DST posting-time conversions, multi-account budget, account/provider/budget readiness, exact-SHA nine-timer gates. New read-only capacity assessor lib/growth/portfolio/scale-readiness.ts reports current production requirements are NOT met; it grants no permissions.
- No migrations, provider calls, AI generations, account-setting mutations or publication rights changes are made by this branch.

## Remaining engineering blockers before claiming full autonomous rollout

1. Per-account generation execution is not built. The current daily AI image runner supports one account at a time and the rollout hard cap is three images globally. Make generation queueable in isolated one-image jobs and spread up to ten per connected account over the day. Recheck each account's persona, token, audience, editorial examples, duplicate concepts, provider/ledger and saved asset quality.
2. Financial settings currently default to 3 images/day and $2 daily/$30 monthly across all accounts. Safe recommendation based on 30-cent conservative image reservations plus $1 nonimage allowance/account/day: $4/day and $124/month for one account, or $12/day and $372/month for three. This is only a proposed LIMIT, not actual projected billed spend. Require specific owner-approved hard ceilings before live changes, ensure transactional DB admission, migration/constraint checks, account fairness and no retry for ambiguous paid work.
3. Publication quota is GLOBAL 3/day in GrowthViralProgramSettings today, not TEN PER ACCOUNT. Change transactional booking, source-vs-owned share, uniqueness and account/board approval tests; a schema migration might be required and must be PostgreSQL 18 clone-qualified. Each Pin must still be individually selected by the owner.
4. Pinterest's independent local global request throttle currently allows only 4 requests/hour and 16 requests/24h across all account/Pins/OAuth/analytics operations, already too low for 10 per account plus required GETs. Increase only with verified provider quota and transactional reservations; adapt to connected account count, use dynamic backoff and retain the five-request provider reserve. Existing board synchronization has a 10-page/1,000-board cumulative limit, not full resume. Design page-by-page checkpointing, persistence, safe completeness/deactivation, quota controls and per-account scan scheduling. Existing daily observe is scoped to one account identity, and daily account analytics is not a complete all-account inventory sync.
5. The pure account-specific time planner is not wired into real creative/Pinterest approval scheduling. Integrate with the stored account's own metrics, collision logic, owner-approved time binding and publication outcome learning.
6. Private report schedule exists but recurring delivery and a single consolidated multi-account scorecard with alert/financial/approval metrics need verification. Check no duplicate Telegram sends.
7. Original-source Pin publishing timer is installed disabled; independent explicit owner acceptance needed. No unrestricted Growth worker activation or auto-approval.
8. CI must pass on final HEAD. If DB schema/quotas change, add populated PostgreSQL 18 clone rehearsal, exact migration gates, backup and rollback checks. Confirm provider permissions, rate limits, auth and image costs.
9. Live end-to-end proof must include one individually approved Pin, correct account/board/destination, stored Pinterest Pin ID, no duplicate retry, metrics, one accepted design from the dedicated AI project, private report delivery, remaining budget, timer and website health.

## Protected code-only release procedure

- Review PR #171 HEAD and final green CI (lint, TypeScript, Vitest, build). Merge only after full verification and record the resulting exact main SHA as NEW; OLD must be b0ecf638effe2ca5212989d817d2f8c186bb4f57.
- Fetch the reviewed coordinator file from merged main. Independently verify its exact Git blob SHA via git hash-object, then transfer it to root@82.112.242.43. The root-owned installed copy must have owner root, group root and mode 0700.
- SSH USER root: execute read-only coordinator audit OLD NEW and require GROWTH_NINE_AUDIT=PASSED with NINE_ENABLED_ACTIVE, DB SAFE_OFF.
- Quiet UTC window only (00-03 or 15-23): explicitly approve HOLD:OLD:NEW, require all nine timers disabled/inactive.
- Mac: dispatch GitHub workflow deploy-hostinger.yml against main with expected_release_sha=NEW. Both CI Gate and Production Deploy must pass; independently read production .deployed-release.
- SSH USER root: explicitly approve RESTORE:OLD:NEW in the permitted UTC window; require GROWTH_NINE_RESTORE=PASSED and NINE_ENABLED_ACTIVE, DB SAFE_OFF.
- The code-only release does NOT activate the new daily discovery timer, change budget, or enable publisher. Each needs a qualified, separately approved run/test. Do not infer full-autonomy activation from a code-only deploy.
- Verify site health, protected source SHA, all nine timers, 35 migrations, global Growth OFF, attribution OFF, Viral REVIEW, preserved owner sync queue, and report status. On blocked gates stop, preserve the existing production and diagnose. Do not force-edit systemd units to bypass the coordinator.

## Morning handoff

DONE: PR #170 release in production; PR #171 source implementation of daily discovery, full Pin inventory cursor continuation, per-account target/budget/timing planners and protected release coordinator. CI may still be running.

NOT DONE: fully automatic ten designs per account, live account-specific cost increases, complete board/all-account ingestion, real scheduled creative-to-Pinterest loop, approval automation, final production acceptance. This is not a one-command full autonomous launch.

Resume work from this file and PR #171 without asking the owner to repeat decisions. Do not silently deploy unfinished behavior or claim production is fully autonomous.
