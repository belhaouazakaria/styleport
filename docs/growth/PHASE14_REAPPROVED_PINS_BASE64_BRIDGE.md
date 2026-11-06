# Approved Pin recovery: isolated direct-PNG delivery, no app redeploy

Owner-authorized emergency recovery for SayTwist's Nov 6, 2026 Pinterest HTTP 400 / 2786 incident.

## Scope and expected state

- Cold Hearted was successfully published/reconciled already; this action **never** selects it or the historical 16 Creative Lab drafts.
- Exactly two fresh candidate IDs are eligible: Jester `cmw5gcss30009a5ajv9pzwebg` and Extremely Flirty `cmw5gct1u0015a5ajt0gg6gza`.
- Previous approved publications are `FAILED_TERMINAL` and remain immutable; the user must use **Approve again** on each to create a new `GrowthPinApproval`, `GrowthPinPublication`, and `PINTEREST_PIN_PUBLISH` job at a future timestamp. It will not reattempt the old approvals, overwrite their error records, or circumvent the individual admin confirmation.
- The exact owner issue and comment bind the trusted GitHub main source SHA, the old deployed SHA `1f7f0560661a86947c3ce7c49c7a4669d41736f2`, the two candidate IDs and a maximum of two Pinterest writes. The workflow is read-only to GitHub, transfers only one reviewed SHA256-checked source script into a private app directory; it does not deploy or migrate the website.
- A short, DB-persisted Growth lease is used only during the exact two jobs. The standalone watchdog expires leases on crashes. General worker, Attribution and paid AI remain OFF.

## Direct media mechanism

The deployed `publishApprovedPin` service still validates the immutable approval snapshot, candidate revision, destination, Pinterest board/account, and deadline. The transport wrapper verifies the source request exactly matches the approved title, description, destination, board, image URL; it replaces only `media_source` with Pinterest's documented `image_base64` JSON object, using the locally stored approved 1000×1500 PNG bytes after validation and SHA256 checksum match.

Global per-hour/per-day Pinterest provider budgets are checked before entry and consumed normally by the **deployed** `budgetedPinterestFetch`; no refunds or invisible retries. No token contents or images are logged. The wrapper retains only bounded sanitized 4xx response code and message. If the provider response is ambiguous, stop immediately and require reconciliation; never blindly send another Create Pin request. Output exposes only status labels and sanitized provider evidence.

## Postconditions

Both new Pin publications must become `RECONCILED` with Pinterest Pin IDs and jobs SUCCEEDED; no other candidates/jobs can be claimed. Growth and Attribution remain OFF, activation lease cleared, normal watchdog/observe/local-intelligence systemd timers unaffected, no AI calls. If one fails, inspect persisted status and provider evidence. New owner approval and separate branch/source authorization required for recovery. Persistent release and a narrow publishing schedule are separate tasks.

The direct-media fix is merged in GitHub PR #127, but the old deployed production app may still be pinned to its prior SHA. The one-shot does **not** pretend the website's permanent publisher has been redeployed.
