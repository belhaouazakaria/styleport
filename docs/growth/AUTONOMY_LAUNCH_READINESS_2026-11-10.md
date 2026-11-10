# SayTwist: reduced-cadence 3-account rotating Growth release

**Owner decision:** November 10, 2026. This document replaces the withdrawn 10-Pins-per-account/day proposal.  
**Repository:** belhaouazakaria/styleport. **PR:** #171 (do not treat a green PR as a deployed production system).  
**VPS:** 82.112.242.43. **SSH users:** saytwist for application reads, root for root-only timer/release operations.  
**Previously verified production release:** b0ecf638effe2ca5212989d817d2f8c186bb4f57. Nine root-owned active timers, 35 applied migrations, Growth OFF outside scoped jobs, attribution OFF, Viral REVIEW.

## The exact owner-approved cadence

- At most **one** of the up to three connected Pinterest account roles posts on any UTC day: SAYTWIST, SAYTWIST_IDEAS, SAYTWIST_PLAYGROUND. After all three accounts are connected and board-ready, the chosen account rotates A/B/C/A/B/C. With only one connected account it is selected daily; with two connected accounts they alternate.
- **Four or five original Pins in total per UTC day**, not per account. The number alternates by UTC date. Source/owned mix: 4 Pins = 2 original SayTwist + 2 original designs honestly linked to AnythingTranslate; 5 Pins = alternating (2 owned + 3 source) / (3 owned + 2 source). Never publish a low-quality, duplicated, unqualified or unapproved Pin merely to fill a quota.
- Two or three owned SayTwist designs may use gpt-image-2. Two or three AnythingTranslate-linked original posters are created by SayTwist's deterministic image renderer and **do not require paid AI**. Existing budget hard gates remain $2/day and $30/month, three reserved image attempts/day, until explicitly updated. A budget block is not a license to retry or overspend.
- Once per UTC day, research the fixed allowlisted public AnythingTranslate catalog (robots-check, two GETs maximum, one attempt/day). Rank source title/URL concepts, discard withdrawn or duplicated entries, prepare up to the rotating account's original source-art allocation. Never copy competitor artwork or descriptions. Source drafts do not schedule or approve Pinterest calls.
- One private Telegram daily digest, existing exact-SHA timer. Pinterest analytics and timing use provider-backed account-local evidence; where insufficient, explore safe windows.
- Pin approval must be **specific and individual**. Pinterest's developer guidelines require that the end user chooses each Pin for scheduled publishing. The agent drafts creatives and suggests account, board, time and copy. The authorized existing publisher performs scheduled Pinterest Create Pin only after that owner's exact-Pin approval. No cross-account coordinated engagement.
- Accounts must have valid production OAuth, scopes, nonexpired refresh credentials and active boards. Owner connects the two missing accounts. Never create fictitious accounts or silently publish from one that is off the day's rotation.

## Implemented changes in PR #171

1. lib/growth/portfolio/daily-rotation.ts and daily-rotation-store.ts: pure date/role-ordered deterministic rotation and active production account qualification. Every new approval of an ACTIVE portfolio Pin, both source and SayTwist, is checked against the chosen account on the *scheduled* UTC day.
2. lib/growth/viral/portfolio-admission.ts, portfolio.ts and source-publishing.ts: increase reviewed internal shared cap from 3 to **5 max**, but enforce the current date's exact 4/5 and source-vs-owned split across both channels under the preexisting shared transaction advisory lock. Require saved owner policy to be ACTIVE, maxPinsPerDay>=4/5 and sourceSharePercent=50 before approvals. Existing individually approved Pin snapshots remain immutable and are not retroactively modified.
3. workers/growth-daily-fresh-creatives.ts and daily-fresh-creative-plan.ts: select today's account from connected roles, request only its 2/3 owned AI designs, preserve three-image global cap, saved editorial example quality, unique job key, no generic worker and lease/watchdog safety.
4. lib/growth/viral/daily-source-drafts.ts, source-publishing.ts, workers/growth-viral-discovery.ts and launch: scan once daily and, **only when Viral policy is ACTIVE**, prepare up to 2/3 top-ranked original source-linked PNGs as audited SYSTEM-created DRAFTS with no publisher approval, Pinterest write or paid AI. In REVIEW, scan/read-only only. The separate 08:15 UTC timer is still install-disabled and requires explicit launch.
5. Viral admin page shows today's selected account, date, target and mix. Owner's saved policy is not silently switched to ACTIVE or 5 by a code release.
6. Older proposed ten-design-per-account planners/tests were removed from this branch. Earlier safe Pin inventory pagination without cumulative page/pin truncation remains, with three GETs per job, cursor-resumption and rate-limit protections. Existing board pagination remains more constrained; no claim of unbounded board syncing.
7. New unit tests verify three-slot rotation, incomplete account connections, exact 4/5 balance, quota enforcement, source draft-only mode and release gates. Existing full CI, isolated Pinterest/viral PostgreSQL 18 suites and nightly build must be green at the final PR HEAD.
8. workers/coordinate-growth-nine-timer-multi-account-preview-release.sh: root-owned, checksum-verified OLD=b0ecf638... coordinator for read-only audit/HOLD/exact-SHA deploy/RESTORE. It preserves nine existing timers, 35 migrations, Viral REVIEW and two pending owner-scoped account/board sync jobs before release.

## IMPORTANT production activation boundaries

- **PR #171 is not deployed by merging.** Never direct-run a GitHub deployment without first invoking the protected nine-timer HOLD. Never enable an unrestricted Growth worker, global attribution or whole-platform Telegram scheduler.
- **No migration is expected** from this PR. Production remains on 35 migrations.
- Code-only deployment must happen while Viral remains REVIEW and the extra source publisher is disabled, as enforced by the nine-timer coordinator.
- After deployment and protected nine-timer RESTORE, the owner must explicitly save **Viral ACTIVE, source share 50%, daily cap 5** at https://saytwist.com/admin/growth/viral. Do not enable ACTIVE before the protected release restore.
- The daily 08:15 research/source-draft schedule and the separately installed 15:17-23:17 UTC hourly **individually approved-only** source publisher are NOT among the existing nine timers. Each has its own disabled-only root installer. They require additional audited root-controlled installation/enable and first-run verification. The source scheduler has a restricted UTC window; choose approved source Pin times that fall within it. A source Pin outside that window can wait until the next matching window.
- Some preexisting Growth jobs may remain pending by design, and unapproved Pin drafts are never published. Under full owner selection, 4-5 is an upper target, not a guaranteed output.
- One connected account today means full three-account rotation cannot be validated until owner adds the other two. Do not block the first account's safe operation on those absent accounts.

## Protected deployment procedure, next operator session

1. Review PR #171 final GitHub Actions run and source file diffs. Merge only after CI and isolated DB qualification are green, and record the exact new main merge SHA as NEW.
2. Fetch the approved release coordinator from NEW and verify its **exact git blob SHA** using git hash-object. Copy it to root@82.112.242.43 outside application directory and install root:root 0700.
3. On SSH user root, run the coordinator in read-only audit mode with OLD b0ecf638effe2ca5212989d817d2f8c186bb4f57 and NEW. Require GROWTH_NINE_AUDIT=PASSED, NINE_ENABLED_ACTIVE, SAFE_OFF. If not, stop.
4. In a protected UTC quiet window only (00-03 or 15-23), run the coordinator HOLD with exact owner approval env value, verify nine timers disabled/inactive, then dispatch deploy-hostinger.yml using expected_release_sha=NEW. Confirm CI Gate and Production Deploy success and production .deployed-release=NEW.
5. On SSH user root, invoke coordinator RESTORE with its exact separate owner approval, verify NINE_ENABLED_ACTIVE, DB SAFE_OFF, verified site health/readyz and unchanged queue. If any stage fails, use reviewed recovery, not manual force-enabling.
6. Independently verify installer Git blobs of workers/install-growth-viral-discovery-systemd.sh and workers/install-growth-viral-source-systemd.sh; install verified root-owned 0700 copies and run their install-disabled steps. Verify exact installed service release SHA and 35 migrations.
7. Owner explicitly saves Viral ACTIVE, source 50%, daily 5 in authenticated admin. Confirm no undesired source link changes. Under a second explicit source-schedule activation approval, enable the two newly installed timers only after inspecting their unit files and approval env; do not overwrite the nine existing timers.
8. Live acceptance: one new source draft appears after once-daily research; one owned ready candidate exists for the selected account; its approved board/asset/URL/time are correct; exactly owner-selected Pins publish once (with provider ID), no unknown retry; daily Pin counts stay within current 4/5 mix; spend ledger and private Telegram report checked. If metrics are insufficient, scheduler remains in exploration.
9. Record actual deployed SHA, systemd unit status and source timer status in this document or successor handoff.

**Current status:** source and protected release work prepared in PR #171. At the time of authoring, NEW was not deployed, the extra two timers remained uninstalled/inactive, Viral was REVIEW and the owner had one connected account. A code release alone cannot honestly be labeled a complete autonomous publishing launch.
