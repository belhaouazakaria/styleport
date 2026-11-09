# Viral Intelligence production release, nine-timer preservation (2026-11-09)

Status: **SOURCE PREPARATION ONLY; no production migration, timer hold, app
deployment, systemd SHA rotation, or new viral source Pin activation has been
performed by this work**. Do not use the older six-timer restore helper.

## Verified initial state and nonnegotiable gates

- Last independently owner-verified production SHA:
  `a73ed6a4d4a5d3244fe5735bd7f027aa8a6d81ff`.
- Production PostgreSQL 18 at 127.0.0.1:5433/saytwist has 33 finished
  migrations, Growth/attribution OFF, activation lease NULL and zero
  active/pending/retryable Growth jobs.
- Nine existing, previously owner-enabled timers were independently checked:
  lease-watchdog, daily-observe, autonomous-cycle, approved-publisher,
  daily-fresh, private-report, autonomous-content, daily-account-analytics,
  auto-translator-publish. All nine are pinned to the OLD SHA, enabled/active,
  and their services were inactive when inspected.
- Owner verified a fresh PostgreSQL custom-format backup and restored the
  production-populated `saytwist_growth_viral_rehearsal_20261109` clone at
  baseline 33 migrations with production unchanged. GitHub Actions run
  42634626526 succeeded at main SHA
  `d367881353fc50ac100f11b9e2fecc9fbcabd9c4` and emitted proof
  `VIRAL_CLONE_TWO_MIGRATIONS_APPLIED=true`,
  `VIRAL_CLONE_EXISTING_ROWS_PRESERVED=true`,
  `VIRAL_CLONE_PRODUCTION_UNCHANGED=true`,
  `VIRAL_CLONE_PROGRAM_PAUSED=true`.
- Clone now holds 35 migrations. Production remains 33 until separately
  approved.
- The only pending migrations are
  `20261109180000_growth_viral_intelligence_foundation` and
  `20261109190000_growth_viral_pin_approval`.
- Publication by the NEW source publisher requires another, separate owner
  approval. Its timer is install-disabled and is NOT installed or started by
  this procedure.

## Release source staging, not deployment

After reviewed PR merges and exact current `main` SHA is known, the owner can
manually run `.github/workflows/growth-nine-release-stage.yml` with
`release_sha=<EXACT_MAIN_SHA>`. It only uploads reviewed Prisma schema,
migrations, the coordinator and the production migration script to
`/home/saytwist/.local/share/saytwist/viral-nine-release-source/<SHA>`
as the application SSH user `saytwist`. It does not run production SQL,
stop/enable timers, or deploy the app.

The root coordinator is deliberately NOT executed out of the application
user-writable directory. The operator must compare its Git blob hash to the
reviewed immutable release blob, then copy it to a separate root-owned,
non-symlinked, private 0700 path, and verify that copied checksum again.
Any mismatch blocks the release. No secret values belong in chat or logs.

## Guarded operator sequence, explicitly authorized per gate

1. **SSH user: root.** Before source or database changes, run the root-owned
   `coordinate-growth-nine-timer-release.sh audit OLD NEW`. It requires the
   OLD deployed release, the exact nine timer units and calendars, each root
   owner/mode and expected SHA, no systemd drop-ins, no running service and
   Growth OFF/no active jobs. It performs NO mutation.

2. **SSH user: root.** Only with explicit owner permission and reviewed current
   NEW SHA, set
   `GROWTH_NINE_RELEASE_APPROVAL=HOLD:OLD:NEW` in the command environment
   and run `coordinate-growth-nine-timer-release.sh hold OLD NEW`. It checks
   again before disabling/stopping exactly the nine existing timers. It
   writes a root-only release state (0600) and confirms no services are
   running and production remains safe OFF. A partial hold must not be
   bypassed.

3. **SSH user: saytwist.** Only when ALL NINE are held and the fresh
   clone evidence remains valid, set
   `GROWTH_VIRAL_RELEASE_SHA=NEW` and
   `GROWTH_VIRAL_PRODUCTION_MIGRATION_APPROVAL=APPLY_VIRAL_2:NEW`,
   change directory to the exact staged source, and execute
   `scripts/growth-viral-production-migration.cjs` using the approved Node
   v24.20.0 path. It verifies staged source and prior migrations against
   production and clone, rejects any unsafe PM2 database identity or
   in-flight job, creates a NEW non-overwritten custom-format backup and
   verifies its archive, applies only the two migrations with staged Prisma
   schema, and confirms 35 applied migrations, viral policy PAUSED, safe
   Growth OFF and nine held timers. Failure requires operator inspection,
   NEVER a blind rerun.

4. **Deployment:** Use the existing owner-created, protected exact-main-SHA
   GitHub release issue/comment bridge to dispatch `deploy-hostinger.yml`;
   never enable automatic deployment or push-to-production. The deploy job
   must independently verify fresh backup, no pending Prisma migrations,
   PM2 health/readiness and release identity. The nine timers remain held.

5. **SSH user: root.** After `.deployed-release` becomes NEW, with
   exactly 35 production migrations and safe Growth OFF, run the reviewed
   ROOT-owned coordinator with
   `GROWTH_NINE_RELEASE_APPROVAL=RESTORE:OLD:NEW` and the `restore OLD NEW`
   arguments. It checks all nine timers are disabled, rewrites only the SHA
   environment line in each root-owned service (plus existing private report
   approval SHA), validates each systemd unit, starts and verifies the
   independent watchdog first, then restores precisely the other EIGHT
   previously approved timers. All non-watchdog timers have
   `Persistent=false`; watchdog has `Persistent=true`. It never
   enables the new Viral Source timer.

6. **Acceptance:** Verify all nine timer SHA pins match NEW, all nine
   enabled/active, health/ready OK, DB safe OFF/no lease, 35 migrations,
   no new source publisher timer enabled, and all previously approved
   schedules preserved. After that, independently review the new Viral
   Intelligence admin panel and request a specific owner-selected,
   owner-approved Pin trial, with truthful source URL and original image.

## Abort/recovery

- If the release must abort **before** production migration, while old app
  SHA and 33 migrations remain, SSH user root may separately approve
  `GROWTH_NINE_RELEASE_APPROVAL=RECOVER:OLD:NEW` and run the root-owned
  coordinator's `recover OLD NEW` action. It validates original units
  and safe OFF status and restores old timers, watchdog first.
- If migration has begun, production has 35 migrations, the deployment fails,
  unit rotation is partial, or any safety check rejects, **do not** use the
  pre-migration recover path and **do not** enable old-SHA timers blindly.
  Preserve the verified custom backup and operator logs; review actual
  application/schema/units before any recovery. No destructive Prisma
  rollback is automatic.
- The root coordinator's saved state and SHA pins prohibit replays.
  Never edit release markers, unit pins or approvals to bypass a failed gate.

This is a controlled operational procedure, not authorization to publish,
spend AI credits, change Pinterest URLs, or expand site monetization.
