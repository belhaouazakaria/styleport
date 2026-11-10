# One-time owner-approved Pinterest board inventory refresh

## Observed production state (2026-11-10)

The owner clicked Sync in the Pinterest admin because the board list was stale.
The request created exactly two Growth jobs on 2026-11-09 22:47:42.733 UTC:
`PINTEREST_BOARD_SYNC` and `PINTEREST_ACCOUNT_SYNC`. Both remain
`PENDING` with attempt count 0, `maxAttempts=3`, no worker claim or
lease. The last successful board sync was October 11, 2026. The account's
`CONNECTED` status, `boards:read` scope, access token with over 15
minutes validity, refresh token validity and global provider quota were
operator-confirmed. At the last preflight there were 0 global provider API
reservations in 1 hour, 3 in 24 hours, and no cooldown.

The previous Viral REVIEW hotfix is deployed at
`fd5d138f1e6e399a0c218eb6ffc5eca74df573d2`, the 35-migration
database is current and nine systemd timers are healthy at the same release.
REVIEW policy persists and the first bounded external catalog scan archived
85 **unreviewed** concepts with no Pinterest writes or AI calls. The Viral
source publisher is OFF. This is **not** permission to activate general
Growth, publish Pins or generate AI creative.

## Code

The one-off board runner:

1. Checks release SHA, application OS user, trusted localhost PostgreSQL 18,
   PM2 runtime, watchdog status, process automation flags OFF, and manual owner
   confirmation in `.github/workflows/growth-one-board-inventory-sync.yml`.
2. Uses a serializable transaction under the GrowthSettings row lock.
   Requires precisely the same **two** unclaimed, never-attempted,
   owner-created Pinterest sync jobs, with matching account, idempotency
   minute and original UTC creation window. Any extra active job blocks.
3. Requires the Pinterest account to be connected in production with the
   `boards:read` scope, non-expiring tokens and existing active boards.
   The global API budget must have 0 reservations in the last hour,
   <=12 in 24 hours, and no hourly cooldown. The normal provider-wide
   4/hour, 16/day admission remains mandatory.
4. Temporarily leases one exact scoped job for no more than 120 seconds.
   `runGrowthWorker({ onlyJobId, batchSize: 1 })` cannot sweep other
   jobs, retries, or publish Pins. No generic worker flag is enabled.
5. Permits **one** `GET https://api.pinterest.com/v5/boards?page_size=100`
   with a 10-second transport timeout. A second GET, pagination, OAuth
   refresh, provider write or wrong endpoint is rejected.
   On an empty result or pagination bookmark, saved board inventory is not
   replaced or deactivated.
6. Atomically upserts returned board metadata and retires stale board rows
   only after a complete non-empty one-page response. The existing queued
   account sync job remains PENDING.
7. Revokes the exact temporary Growth lease even if the worker fails.
   The existing release-pinned minute watchdog handles hard crashes.
   Reports only sanitized outcome flags/counts, never credentials.
   Requires Growth OFF, account sync PENDING and board sync SUCCEEDED
   for success.

Only one manual approved execution is allowed. No automatic scheduling and
no retry if an ambiguous request failed; inspect the relevant audit events.

## Release gate

This is an **application-code-only** change, not a database migration.
Even code-only releases must honor nine SHA-pinned systemd timers.

Before deploying: full CI, merge final source to `main`, get exact immutable
main SHA and reviewed root coordinator blob hash. Copy
`workers/coordinate-growth-nine-timer-board-sync-release.sh` into
`/root/saytwist-release/` with owner root, permissions 0700 and verified Git
blob checksum. Run `audit OLD NEW` with `OLD` set to
`fd5d138f1e6e399a0c218eb6ffc5eca74df573d2`.
The coordinator requires mode REVIEW, Growth OFF, source publishing OFF,
35 migrations and the exact dormant sync pair. Separately authorize
`HOLD:OLD:NEW` during the allowed UTC window. Dispatch
`deploy-hostinger.yml` manually from main with
`expected_release_sha=NEW`; verify CI, fresh backup, no pending migrations,
app and readiness. Separately authorize and run `RESTORE:OLD:NEW`.
Never restore timers at the wrong SHA or mutate jobs to pass a gate.

After the nine-timer restoration: owner uses manual workflow
`SayTwist One Approved Pinterest Board Inventory Sync` on main,
passes the exact deployed SHA and confirmation
`SYNC BOARD INVENTORY ONCE`. Only then is one provider GET authorized.
Verify the archived board set in the admin UI and the read-only database
audit. Do not click Sync again; it creates more queued jobs.
The remaining account sync job is not processed by this action and must
be handled separately or naturally retired using approved application
controls, not raw SQL.

## Abort

If any safety preflight, rate quota, provider response, token validity,
one-page completeness, specific-job claim or lease revocation fails, stop.
Do not disable Growth safety checks, re-run the failed request blindly,
clear provider cooldowns, or force a Pinterest write. Post-failure,
read-only audit of GrowthSettings and GrowthJob status is mandatory.
