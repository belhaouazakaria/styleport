# AnythingTranslate translator rating and publication priority

## Scope

The source catalog supplies **titles and URLs only**, not official external
engagement metrics. The versioned editorial-fit score (0–100) is therefore a
**heuristic**, not a claim that a competitor translator is popular. Real
Pinterest winners still require official, sufficiently mature owned-Pin data
through `evaluateViralWinner` and cannot be inferred from a title.

No new database migration, provider request, paid AI call, external
creative, or production activation is required to add this rating system.

## Automated scoring

`lib/growth/viral/rating.ts` evaluates editorial clarity, recognizable
translation styles, language intent, excessive title length, noisy wording,
and repeated/vague words. `rankSourceTranslators` deterministically orders
results and defers obvious near-duplicate topics.

| Editorial score | Action | Persisted existing concept status |
| --- | --- | --- |
| 75–100 | PRIORITY: rank first for eligible original source Pins | DISCOVERED |
| 50–74 | SCHEDULE_LATER: reserve for upcoming days | REVIEW |
| 0–49 | WITHDRAW: do not prepare, approve or publish | REJECTED |

The catalog scan sets these statuses for new concepts. For previously
DISCOVERED/REVIEW rows, rescanning can update the rating disposition.
Existing manual TESTING, WINNER, ACTIVE or REJECTED states are preserved.
The admin surface displays the rating, sort order, and a suggested delay
(2–30 days) for lower-ranked concepts. This recommendation is not itself
a booked Pin slot.

## Publication enforcement

- WITHDRAW concepts cannot be prepared or approved, including old data.
- SCHEDULE_LATER concepts can be approved only for **at least two days
  in the future**, respecting the existing daily quota and verified asset.
- The due source publisher ranks individually approved due Pins by score;
  WITHDRAW/REJECTED concepts cannot be published.
- Already approved Pins are **not automatically changed, rescheduled or
  cancelled**. Lower-rated due Pins may remain pending until their
  scheduled time and normal publisher gates permit them.
- All existing owner-approval, no-third-party-asset-copying, shared source
  quota, provider rate-limit, claim and idempotency protections remain.
- Rating alone does **not** auto-approve or publish Pins. Autonomous approval
  requires a distinct, legitimate system-authorization design; do not
  impersonate owner approval or flip all Growth gates blindly.

## Safe application release

The current production release before this PR is
`6ce3e5b5711f12677a04f588f942c4a003d376cd`, 35 migrations, nine
SHA-pinned enabled/active timers, Growth OFF, Viral REVIEW, the original
account/board sync pair preserved. Do not delete the two jobs to get through
a release gate.

CI must pass all lint, typecheck, tests and build. When final source is merged
to `main`, use the reviewed
`workers/coordinate-growth-nine-timer-source-rating-release.sh` with
exact OLD and final NEW, from a checksum-verified 0700 root-owned copy.
Follow read-only audit, explicitly approved HOLD during the UTC quiet
window, manual `deploy-hostinger.yml` exact-SHA dispatch, then explicitly
approved RESTORE. Do not change database migrations.

## Separate autonomy work

The nine existing timers run distinct narrowly scoped processes; the
unrestricted Growth worker is intentionally disabled, the source publisher
is installed disabled and owner approvals still required. A full 24/7
autonomous Growth activation is not achieved by deploying the score.
It requires a reviewed worker mode / recurring scheduling, credential-aware
provider pagination/backoff, bounded AI spend, true automation-specific
publishing authorization, and controlled handling of the two dormant jobs.
Do not claim full autonomy from this code-only feature.
