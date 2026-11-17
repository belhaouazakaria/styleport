# Gen-Z source Pin production release

The production baseline confirmed on November 17, 2026 is
`145215b742916b81ff1bfc86bd3882fb516385a`, with 41 applied migrations and
fourteen enabled SHA-pinned Growth timers. The existing AI-design coordinator
is pinned to an older baseline and must not be reused for this release.

This code-only release routes AnythingTranslate source drafts through the
existing Gen-Z renderer only for the Main SayTwist account. It does not add a
migration, change timer cadence, raise budgets, publish Pins, or remove owner
review. The original Upright font is installed privately on the VPS at
`storage/fonts/upright/Upright.otf`; it is checksum-pinned and ignored by Git.

## Qualification and guarded release

Before the owner-authorized release:

1. Pass CI and build the immutable Linux deployment artifact for the exact main
   SHA. Verify its embedded SHA and published digest.
2. Create and verify a fresh PostgreSQL 18 backup and off-host copy. Restore an
   isolated production clone, verify all 41 migration checksums and preserved
   Growth data, and run the existing `scripts/growth-v2-followup-evidence.ts`
   safety check against that clone.
3. Stage the exact-SHA source and migration files in a root-owned 0700 directory
   outside the app. Create root:root 0600 `genz-source-qualification.json` with
   `releaseSha`, a non-production `cloneDatabase`, `cloneMigrations: 41`,
   `cloneVerified: true`, and the production-backup and artifact paths plus
   SHA-256 digests.
4. Copy `workers/coordinate-growth-genz-source-release.py` from the exact main
   SHA to a temporary root-owned 0700 path outside the app. Verify its Git blob
   before running `audit NEW_SHA ROOT_SOURCE`. Audit must pass with all fourteen
   timers enabled and active, all service pins at the confirmed old SHA, the
   web app ready, Growth idle, and the safe-queue fingerprint unchanged.
5. In the coordinator's permitted UTC quiet window, use its exact
   `HOLD:OLD_SHA:NEW_SHA` approval to hold all fourteen timers. Deploy only the
   exact approved main SHA through the existing protected Hostinger workflow.
   Confirm `.deployed-release` equals that SHA and health/readiness pass.
6. Use the separate `RESTORE:OLD_SHA:NEW_SHA` approval. The coordinator rotates
   only the fourteen release pins and their SHA-bound approvals, then restores
   all fourteen timers. It does not call an AI provider or publish a Pin.

The observed November 17 scheduled-service logs reported only sanitized
`*_LAUNCH=BLOCKED` markers. The release coordinator preserves and fingerprints
the queue but does not diagnose those past launch failures. Inspect their
cause before treating a timer restore as proof of worker health. After restore,
verify each next scheduled service result independently. A failed audit or
partial hold/restore leaves timers held; do not bypass the coordinator or
manually re-enable timers.
