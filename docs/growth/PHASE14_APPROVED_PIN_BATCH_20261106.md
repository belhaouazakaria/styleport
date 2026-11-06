# Phase 14 publishing: exactly three owner-approved Pins (2026-11-06)

This scoped bridge is not the general Growth scheduler. It preserves the private admin per-Pin approval gate and schedules; it cannot publish other candidates, create Pins without approval, or enable the broad Growth worker.

## Authorization and isolation

- Source: pinned GitHub main SHA after passing lint, TypeScript, unit tests, and build.
- Deployed application remains `1f7f0560661a86947c3ce7c49c7a4669d41736f2`. The GitHub workflow does **not** deploy the repository or run migrations.
- The GitHub issue title/body and comment bind one exact main SHA, deployed SHA, and three immutable candidate IDs. Issue/comment authors must be `belhaouazakaria`; workflow operates on the trusted default branch with read-only content permissions.
- The only authorized candidates are `cmw5gct1u0015a5ajt0gg6gza` (Extremely Flirty, 21:05 UTC), `cmw5gcsxc000pa5aju6j8g8uv` (Cold Hearted, 21:10 UTC), and `cmw5gcss30009a5ajv9pzwebg` (Jester, 21:15 UTC), all November 6, 2026.
- The script is SHA256-verified after a private one-shot transfer to the existing production host. The already-deployed source's publication service remains authoritative for approval snapshot checks, URL, account/board, quotas, Pinterest Create Pin, and reconciliation.
- A new one-shot refuses any run until **all three** due times have passed, and refuses stale batches later than 24 hours after the latest due time. It does not change the user-selected times.
- No automatic retries or independent concurrent publication workers. The one-shot claims only the exact approved `PINTEREST_PIN_PUBLISH` jobs; it revokes an expiring three-minute Growth activation lease after execution, and the previously installed independent watchdog also expires abandoned leases.
- Preconditions: app online, healthy watchdog, all three previously installed daily timers active, Growth/Attribution OFF, no other active Growth jobs; complete exact approval and scheduled job matches.
- Output is status-only (no credentials, full environment, customer data, error bodies, or Pinterest tokens).

## Outcome semantics

Each publication must return `RECONCILED` and a confirmed Pinterest Pin ID before the next can proceed. If an external result is uncertain, the existing publication service enters `RECONCILING` and does **not** blindly retry Create Pin. Workflow reports failure, retains audit/attempt history, and leaves any unexecuted approval untouched. If one fails, re-inspect the database and provider state before another attempt; a new owner approval and a new source SHA are required for any changed workflow.

The user has specifically approved these three Pins in the Creative Lab; historical 16 creatives remain untouched. The persistent general publishing scheduler and any automatic approval-free workflow are **not** enabled by this one-shot.
