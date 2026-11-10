# SayTwist Growth - Complete the original queued Pinterest sync jobs

Prepared 2026-11-11. Release branch fix/growth-process-owner-queued-pinterest-sync.
Production baseline 217f97d2e07f0f29933e3dab02b35034a3401419.
PR #172. A GitHub PR is not a deployment.

## Owner intent and confirmed production state

- Exactly one original 2026-11-09 PINTEREST_ACCOUNT_SYNC and one PINTEREST_BOARD_SYNC remain PENDING. Owner explicitly wants them DONE, not cancelled or manually marked complete.
- Existing eleven SHA-pinned systemd timers are enabled and active. Site readiness HTTP 200.
- Global Growth and attribution are OFF between scoped runs; no active worker lease.
- Viral policy ACTIVE, source share 50%, max total Pins per UTC day 5, only one eligible Pinterest account each day; specific individual owner selection required for each Pin.
- Original source publisher first triggered at 23:17 UTC but blocked. All original external checks passed, including owner secret file, watchdog, current release, Pinterest environment and PM2 DB.
- Root cause: approved-only source publisher correctly treats the two pending jobs as blockers. Existing one-board sync requires REVIEW with source timer disabled; existing one-account sync incorrectly creates a new job and requires an empty queue. Neither completes these original two while Viral ACTIVE.

## Code in PR #172

- lib/growth/pinterest/owner-queued-sync.ts: validate exact original untouched job identities, one account, 2026-11-09 22:47/22:48 UTC, zero attempts, no other active jobs.
- workers/growth-owner-queued-pinterest-sync.ts: one-time sequence, strict one GET per original board/account job, persistent exact job scope, temporary 150-second leases, release in finally, provider budget/health, original job IDs and existing worker state machine.
- workers/growth-owner-queued-pinterest-sync-launch.cjs: validate exact deploy SHA, saytwist identity, eleven timer pins, PM2 production DB and private Pinterest environment. No secret output.
- GitHub workflow growth-owner-queued-pinterest-sync.yml: owner-only, exact deployed main SHA, explicit confirmation, production environment and SSH user saytwist.
- workers/coordinate-growth-eleven-timer-pending-sync-release.sh: root-protected read-only audit, HOLD, RESTORE, recover. Preserve all 11 timers, root 0600 source approval env, Viral ACTIVE 50/5, 35 migrations and untouched owner sync job identities.
- Unit/safety checks in tests/growth-owner-queued-pinterest-sync.test.ts and tests/growth-owner-queued-sync-release.test.ts.
- No Prisma migrations, Pin POSTs, AI or broad worker enablement.

## Execution after all final HEAD CI checks pass

1. Review and merge PR #172, record exact merged main SHA as NEW.
2. From Mac, retrieve and verify exact Git blob for workers/coordinate-growth-eleven-timer-pending-sync-release.sh and copy to VPS SSH user root. Install root:root 0700. OLD remains 217f97d2e07f0f29933e3dab02b35034a3401419.
3. VPS SSH user root: coordinator audit OLD NEW, require GROWTH_ELEVEN_AUDIT=PASSED, ELEVEN_ENABLED_ACTIVE, DB SAFE_OFF.
4. Allowed quiet UTC 00-03 or 15-23: approve HOLD:OLD:NEW and run coordinator hold OLD NEW. All eleven timers must stop.
5. Mac: dispatch deploy-hostinger.yml on main with expected_release_sha=NEW. Verify workflow success and actual .deployed-release=NEW.
6. VPS SSH user root: approve RESTORE:OLD:NEW and run coordinator restore OLD NEW. Require GROWTH_ELEVEN_RESTORE=PASSED, ELEVEN_ENABLED_ACTIVE.
7. Mac authenticated owner: dispatch growth-owner-queued-pinterest-sync.yml on main with expected_release_sha=NEW and confirmation COMPLETE TWO OWNER QUEUED PINTEREST SYNCS.
8. Require outputs OWNER_PENDING_BOARD=SUCCEEDED, OWNER_PENDING_ACCOUNT=SUCCEEDED, OWNER_PENDING_QUEUE=EMPTY, PROVIDER_WRITES=0, AI_CALLS=0, GLOBAL=OFF. On failure stop, do not retry blindly.
9. Read-only verification: both original jobs SUCCEEDED with one attempt each; lastAccountSyncAt/lastBoardSyncAt fresh; global Growth OFF and lease null; 11 timers enabled; website readyz 200.
10. Observe the next scheduled source publisher result. IDLE is correct with zero due individually approved source Pins. Verify the 08:15 discovery, 07:02 daily fresh creative and 05:05 private Telegram report after their first scheduled triggers. Do not claim full end-to-end autopilot until actual executions and receipts are confirmed.

## Boundaries

Do not manually delete, cancel, edit or mark either original job successful. Do not permanently set GrowthSettings.enabled=true. Normal Growth autonomy uses bounded worker leases that turn OFF outside a job. Preserve the Pinterest 4/hour and 16/24-hour global request limiter, explicit per-Pin selection and account rotation.
