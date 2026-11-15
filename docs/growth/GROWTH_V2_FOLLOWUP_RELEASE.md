# V2 observer follow-up: protected release procedure

The deployed base is `a5dcb8ceb7505d438a1e56a6f4a662d03dc75cf7`, with 40 migrations and fourteen enabled Growth timers. The initial 36→40 coordinator must not be reused for this follow-up.

The scheduled 13:00 observer previously required a single connected account. V2 selects the day's eligible portfolio account explicitly, preserves the original one-GET worker/reservation and exact job claim, reuses matching completed provider evidence, and defers exhausted quota before creating a job. Manual trials retain the original single-account contract. The follow-up introduces no migration, budget increase, Pin approval, schedule extension or destination change.

Before requesting exact-SHA owner approval:

1. Pass checks/build and the PostgreSQL suite, including the three-account observer and read-only release-evidence integration cases.
2. Prepare the exact approved-code Linux artifact through the artifact-only branch of the existing Hostinger workflow. Verify its GitHub digest and embedded release SHA, then qualify its HTTP behavior against an isolated restored production-backup clone.
3. Make a fresh private PostgreSQL 18 backup, inspect it, completely restore the explicit clone `saytwist_growth_v2_rehearsal_20261115`, verify all 40 migration checksums and record preserved data. No migrations are applied by this release.
4. Extract the reviewed Prisma files and release helpers to a root-owned 0700 staging directory outside the app, with `.release-sha` matching the proposed new SHA. Copy `workers/coordinate-growth-v2-followup-release.py` outside the app as root:root 0700.
5. Store a root:root 0600 `followup-qualification.json` beside the source directory. It records `releaseSha`, `cloneDatabase`, `cloneMigrations: 40`, `cloneVerified: true`, `backupPath`, `backupSha256`, `artifactZipPath`, and `artifactZipSha256`. The coordinator independently hashes the actual private backup/artifact files and compares all 40 SQL checksums with production history.
6. Run the coordinator in `audit NEW_SHA ROOT_SOURCE` mode. It checks all fourteen root-owned units and private approvals, no drop-ins or executing services, enabled timers, readiness, OFF settings/no activation lease, a structurally safe queue, and immutable evidence.

After exact owner authorization, in the permitted 00–03 or 15–23 UTC release window:

```sh
GROWTH_V2_PATCH_RELEASE_APPROVAL="HOLD:OLD_SHA:NEW_SHA" \
  /root/REVIEWED_COORDINATOR.py hold NEW_SHA ROOT_SOURCE
```

The hold freezes a digest of active jobs and all native publications, approvals, candidates and source experiments. It archives the original root configurations privately and disables all fourteen timers. It neither claims jobs nor changes consent.

Deploy through the existing main-branch Hostinger workflow with the exact authorized SHA. It separately verifies its final artifact, requires migration status already current, and applies no migrations.

```sh
GROWTH_V2_PATCH_RELEASE_APPROVAL="RESTORE:OLD_SHA:NEW_SHA" \
  /root/REVIEWED_COORDINATOR.py restore NEW_SHA ROOT_SOURCE
```

Restore requires the same frozen evidence, unchanged root configuration hashes, 40 matching migrations and healthy new app. It rotates service/alert/private-service SHA approvals, enables the observer's V2 flag, preserves calendars/credentials/budgets, validates the watchdog, then enables all fourteen timers. Normal authorized queue evolution may resume only after this checkpoint. Independently verify effective pins, private-file modes, timer state, health and subsequent real service outcomes.

On failure, timers remain disabled. Do not reset jobs, weaken queue evidence or edit a release state to make a guard pass. If rotation partially failed, verify and restore the recorded private configuration archive, reload systemd, and rerun the checks before retry. If deployment rolled back to the healthy OLD_SHA, the coordinator's `recover` mode requires `RECOVER:OLD_SHA:NEW_SHA`, unchanged frozen queue/configuration evidence and the same 40-migration qualification, and restores the old fourteen-timer configuration. It does not roll back data.

Acceptance never fabricates the 13:00 clock. The logical three-account path is exercised against real PostgreSQL with GET-only provider mocks; actual production scheduled execution remains a future observation until its permitted window.
