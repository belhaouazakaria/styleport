# Viral REVIEW policy save and catalog scan hotfix

Status: **source preparation**. On 2026-11-09 the owner confirmed production
`GrowthViralProgramSettings` was still `PAUSED`, `configVersion=1`,
with **zero** `VIRAL_PROGRAM_POLICY_CHANGED` events and zero scan events.
The earlier production release has 35 migrations and all nine pre-existing
Growth timers are active and pinned to
`1e71d26de11b0529dfeee3862bb9da47c4fe7fdf`.

## Root cause and code correction

Both the settings update and the one-per-day catalog scan used Prisma
`$queryRawUnsafe("SELECT pg_advisory_xact_lock(...)")`. PostgreSQL returns
`void` for that function, which cannot be safely decoded into an ordinary
Prisma result. Replaced these calls with
`$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(...)`)`, the
existing application pattern for transactional advisory locks.
The transaction, lock identities, daily scan limit, audit records and
administrator same-origin guards are unchanged. Expected scan failures now
return distinct safe messages.

This is a **code-only hotfix**: no schema migrations, no new services, no
Pin publication, no paid AI request, no automatic Growth activation.

On 2026-11-09 the owner's read-only audit revealed two intentionally queued,
not-started sync jobs (`PINTEREST_ACCOUNT_SYNC`, `PINTEREST_BOARD_SYNC`),
created when the owner requested a refresh of outdated Pinterest boards.
Keep these jobs and their audit records. Do not cancel or manually run them
merely to clear a release gate. Their processing must be separately authorized
with bounded Pinterest provider reads and Growth safety enforcement.

## Protected release (owner-run, one gate at a time)

1. Finish PR CI (lint, typecheck, tests, build), review and merge.
   Confirm `main` HEAD SHA is exactly the proposed new release.
2. **SSH user: root.** Download the immutable coordinator from the approved
   `main` merge SHA, compare `git hash-object` against the exact reviewed
   GitHub blob SHA, and install a root-only non-symlinked `0700` copy under
   `/root/saytwist-release/`. Never execute user-writable app source as root.
3. **SSH user: root.** Run only `audit OLD NEW` first, using
   `workers/coordinate-growth-nine-timer-review-hotfix.sh`.
   It verifies the nine original systemd SHA pins, all nine enabled/active,
   watchdog status, root unit ownership, mode `PAUSED`, production safe OFF,
   35 migrations, and the exact OLD deployed release. The queue must be empty
   **or** contain only the exact owner-requested unclaimed Pinterest account
   and board sync pair from 2026-11-09 22:47 UTC. Each may have zero attempts,
   no lease, no worker, a matching account/minute idempotency key, and no error.
   This permits storage of those dormant jobs, never their execution.
4. **SSH user: root.** Separately approve
   `GROWTH_NINE_RELEASE_APPROVAL=HOLD:OLD:NEW` and invoke
   `hold OLD NEW`. Must be within quiet UTC window 15:00-03:59.
   It disables and stops only the nine existing timers and verifies the hold.
5. Owner dispatches existing `deploy-hostinger.yml` workflow from `main`
   with `expected_release_sha=NEW`. Deployment must prove **35 existing,
   none pending** Prisma migrations, new verified database backup, PM2
   health/readiness OK and exact newly deployed SHA.
6. **SSH user: root.** After successful deployed-release check, separately
   approve `GROWTH_NINE_RELEASE_APPROVAL=RESTORE:OLD:NEW`; run
   `restore OLD NEW` from the reviewed root-owned copy.
   It verifies database remains safe OFF and viral program PAUSED,
   rotates nine old unit pins, starts watchdog first, then reenables the other
   eight previously authorized timers.
7. Read-only acceptance: exact deployed SHA, nine timer pins enabled/active,
   35 migrations, core Growth safe OFF, Viral PAUSED and source publisher
   not enabled, website health/ready OK.
8. Owner logs into `/admin/growth/viral`, selects REVIEW, saves. Refresh
   and confirm REVIEW remains, SQL configVersion increments, and a
   `VIRAL_PROGRAM_POLICY_CHANGED` audit event exists. **Do not scan until
   save actually persists**. Then authorize exactly one bounded source
   catalog scan. No Pin approvals or source publisher activation in this gate.

## Abort conditions

If no DB or app release change has occurred and the new release is blocked,
the independently approved `recover OLD NEW` action may be used only when
the known OLD SHA remains deployed, all 35 migrations remain applied,
the policy is still PAUSED and all nine old units are stopped and pinned.
After a deployment begins or a partial rotation, do not improvise rollback,
disable safeguards or manually enable incorrect-SHA timers.

Do not change `GrowthViralProgramSettings` directly via SQL to bypass the
administrator API, as the normal save requires a matching audit event.
