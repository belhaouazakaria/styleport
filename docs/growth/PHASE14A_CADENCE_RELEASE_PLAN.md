# Phase A: protected release of adaptive cadence controls

**2026-11-05 status:** source preparation only; no PR merge, production timer hold, database clone, migration, deploy or timer SHA rotation was executed by this work. Current operator-verified production release is `45d390ddc97e9103b9b66c2d7652bba3e7989ede`, with the minute watchdog, daily 13:00 UTC Pinterest OBSERVE, and daily 04:30 UTC local intelligence timers active. Growth and attribution remain OFF.

## Why this release needs a dedicated sequence

The earlier `deploy-hostinger.yml` auto-deployed on every push to `main`. That is unsafe with three active root-owned systemd timers whose services check the exact *deployed* SHA. This release changes the workflow to **manual `workflow_dispatch` only**. The existing owner-created issue/comment approval bridge still checks the exact current main SHA and dispatches the manual deployment. No code merge must auto-deploy the new site.

The adaptive preferences change in PR #113 adds **one additive PostgreSQL migration**: `20261105150000_growth_daily_cadence_controls`. The guarded Hostinger deploy refuses any unapplied migration. The new table must be applied separately **after** restoring and verifying a populated clone and taking a fresh independently verified production backup. PR #114 (market research) is *code only* and its two external provider flags must stay OFF in this release. Neither draft creation nor Pinterest publishing is enabled by the new admin preferences.

## Required PR order and exact-SHA gate

1. Obtain review for this manual-only release-gate PR. Merge **it first** to stop automatic production deployment on `main`. Verify no deploy run was triggered by that merge; do not treat a passed CI run as a live deploy.
2. Review/merge PR #111 (SSH trial fix) and #112 (third timer pin rotator), keeping their independent permissions and source checks. **Do not merge blind:** verify changed files, conflict resolution and CI at each current head.
3. Merge PR #113 (adaptive cadence and SQL migration) after review, then retarget and merge stacked PR #114 (market research) only after confirming the final diff. Avoid inadvertently importing unrelated commits or reintroducing `on.push` to Hostinger deployment. Do not enable provider research flags.
4. Read the exact **final main SHA** after the last merge. All later staging, migration, GitHub owner approval and systemd SHA rotations must use exactly that value. Never reuse issue comments authorized for an older SHA.

## Required fresh populated PostgreSQL 18 clone (manual owner operations)

**SSH user: `root`**. Verify the production DB is `saytwist` on PostgreSQL 18 localhost port `5433`. Independently verify a new nonempty custom-format backup (`pg_restore --list`), then restore into a **new**, private, empty database named exactly `saytwist_phase14k_rehearsal_20261105`, owned by the application DB role. Do not overwrite a previous clone, point any script at the production database as a test target, or log passwords. Ensure the clone schema is writable by the application role; verify all 32 currently applied Prisma migration names/checksums and Growth OFF/idle in the clone match production. This first step is explicitly **not complete** until the operator confirms the restore and baseline.

**SSH user: `saytwist`**, only **after** the fresh clone exists. Stage reviewed, exact-SHA migration source using the owner-gated `growth-phase14k-cadence-clone-stage.yml` workflow. Create an owner-created open GitHub issue with:
- Title: `SayTwist Growth Phase14K cadence clone staging <FINAL_SHA>`
- Exact two-line body: `PHASE14K_SOURCE_SHA=<FINAL_SHA>` then `PHASE14K_SOURCE_TARGET=saytwist-phase14k-clone`
- Exact owner comment: `STAGE SAYTWIST PHASE14K CADENCE CLONE SOURCE <FINAL_SHA>`

That workflow reads immutable current main only, refuses another SHA or another issue owner, uploads source files outside the live application, and invokes `scripts/growth-phase14k-cadence-clone-rehearsal.cjs`. The script derives the private app DB URL from trusted PM2 **without logging it**, checks the **live** database remains OFF/idle and the clone has identical migration history, then invokes Prisma against the **hard-coded clone database only**. A successful result must contain `PHASE14K_CLONE_PRISMA_MIGRATION_APPLIED=true`, `PHASE14K_CLONE_SETTINGS_PRESERVED=true`, `PHASE14K_PRODUCTION_HISTORY_UNCHANGED=true`, `PHASE14K_GROWTH_REMAINS_OFF=true`. Any failure blocks the release.

## Hold and deploy ordering (explicit exact-SHA owner approval required)

**Before any stop, verify Growth OFF, attribution OFF, lease NONE, active job queue zero, PM2 online, web health/ready, production SHA equals OLD, all three live timers healthy, and each root unit's effective SHA and independent failure alert.** Check there is no current timer execution. Do not freeze before the clone result and reviewed release are ready.

**SSH user: `root`**, within the owner-approved release window:
1. Stop and **disable** `saytwist-growth-autonomous-cycle.timer` (its rotator requires disabled/inactive).
2. Stop `saytwist-growth-daily-observe.timer` but leave it **enabled** (watchdog rotator requires OBSERVE enabled/inactive).
3. Stop `saytwist-growth-lease-watchdog.timer` but leave it **enabled**. Keep the database Growth OFF and prohibit worker operation while watchdog is held. Check all three timers inactive; no services running. Preserve the current old-SHA unit files for recovery.

**SSH user: `saytwist`**, with source staged at `/home/saytwist/.local/share/saytwist/phase14k-rehearsal/<FINAL_SHA>`, only after the root hold:
4. Execute the reviewed `scripts/hostinger-prepare-growth-cadence-migration.sh` under exact env `HOSTINGER_MIGRATION_ROOT=<STAGED_SHA_DIR>`, `HOSTINGER_RELEASE_SHA=<FINAL_SHA>`, `HOSTINGER_MIGRATION_APPROVAL=APPLY 20261105150000_growth_daily_cadence_controls` and the existing private PM2 CLI path. It demands precisely one pending migration, independently verifies the populated clone, creates a new verified PostgreSQL 18 production dump, confirms Growth OFF/idle, applies one additive migration and checks web health again. It cannot run as root and obtains production credentials only from the trusted existing PM2 runtime or readable approved env file.
5. Use the existing **owner-created exact-main-SHA production release issue/comment bridge** to dispatch the guarded Hostinger deployment, which independently backs up the database, rejects pending migrations, and checks PM2/health/readiness. Do not directly force deployments via a generic push or ignore failed checks.

**SSH user: `root`**, only after confirmed deployment and NEW `.deployed-release`:
6. From checksum-reviewed exact release files, copy each rotator to a **separate root-owned 0700 path outside app-owned directories**. Do not execute source directly as root.
7. Rotate **watchdog OLD→NEW first** using `workers/rotate-growth-watchdog-release-systemd.sh`, while watchdog is enabled/stopped and OBSERVE enabled/stopped. The rotator runs only independent lease expiry cleanup and restores active minute watchdog. Verify it succeeds and pins NEW.
8. **Disable** the already-stopped OBSERVE timer, then run `workers/rotate-growth-daily-observe-systemd.sh OLD NEW`. It rotates the pinned service and the 13:00 UTC calendar but leaves OBSERVE disabled/inactive.
9. Run `workers/rotate-growth-autonomous-cycle-systemd.sh OLD NEW` from reviewed PR #112 while both daily timers are disabled. It changes only the local intelligence service pin, keeping daily 04:30 UTC timer inactive.
10. Read-only audit: `.deployed-release` NEW, web health/ready, PM2 online, all three effective service SHA pins NEW, watchdog timer active and result success, both daily timers disabled/inactive, three alerts attached, `Persistent=false`, correct calendars, Growth/attribution OFF, lease null, active queue zero, new settings table constraints and defaults intact, no provider writes. Preserve evidence without leaking private credentials.
11. Independently authorize each daily timer to be re-enabled. Require confirmed first live execution after each schedule. The new market research API and paid creative pipeline remain **disabled** unless separately authorized.

## Failure rules

If any preflight fails, **do not merge, migrate or deploy further**. If failure happens before new app deployment, verify the previous app and additive migration state first; never assume rollback automatically reverts a PostgreSQL migration. If a deploy fails and the previous app SHA is restored, the old root unit pins must be inspected before restarting any timer. A new release but failed watchdog rotation leaves all Growth automation stopped until root fixes exact-SHA pins. A stale root unit can never be bypassed by disabling SHA checks. Always use root/saytwist SSH identities as indicated, and never post DB URL, app secrets or Telegram token in chat.

**Remaining acceptance:** fresh populated clone restored on VPS, reviewed owner approval, production migration, guarded deploy, three-timer SHA rotation, functional new admin edit/readback, and first scheduled post-release observations. Until then Phase A is **not complete**.
