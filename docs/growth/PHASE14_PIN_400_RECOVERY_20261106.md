# Pin creation HTTP 400: production diagnosis and exact-scope recovery (2026-11-06)

## Verified evidence

- New candidate `cmw5gct1u0015a5ajt0gg6gza` (Extremely Flirty) was individually approved to publish at 2026-11-06T21:05Z on board `Translators`.
- Its Pinterest Create Pin POST returned deterministic HTTP 400; the existing API wrapper threw a generic `PINTEREST_CREATE_REJECTED` without retaining Pinterest's response code/message. Publication persisted as `FAILED_TERMINAL` without a Pinterest Pin ID.
- The prior owner-gated batch incorrectly called `failGrowthJob` with a new generic error, causing the matching `GrowthJob` to become `FAILED_RETRYABLE` even though the publication is terminal.
- The asset URL returned HTTP 200 PNG for both standard and Pinterestbot GETs; the PNG is 103155 bytes. The title is 62 chars and description 172 chars. This does **not** establish the provider's actual rejection reason.
- The previously approved next two publication records are `cmw5gcsxc000pa5aju6j8g8uv` (Cold Hearted, 21:10Z) and `cmw5gcss30009a5ajv9pzwebg` (Jester, 21:15Z). An old separate Cold Hearted publication is already cancelled and is excluded.

## Bounded action

One-shot issue/comment exact-owner authorization binds reviewed GitHub main SHA, deployed SHA `1f7f0560661a86947c3ce7c49c7a4669d41736f2`, the two pending candidate IDs, and the failed Flirty candidate ID. No application deployment, migrations, broad worker enablement, or unrelated Pin writes.

Preflight requires all exact approvals, scheduled timestamps, account and board validity, enough hourly/daily Pinterest global capacity, no provider cooldown, no other active jobs, Growth OFF, Attribution OFF, and no active lease. It retires **only** the Flirty mismatch (`GrowthJob.FAILED_RETRYABLE` to `FAILED_TERMINAL`), with append-only activity evidence. This does not retry Flirty.

For each separate owner-approved pending job, execution claims the exact ID, uses the deployed `publishApprovedPin` with its existing snapshot checksum revalidation, expiration-lease guard, quota reservation, and reconciliation. On 4xx, the only extension is a response-cloning fetch wrapper that logs sanitized provider code/message for diagnostics, not credentials or raw request/response bodies. The original typed error goes to `failGrowthJob` (rather than an artificial generic error), preserving terminal/retryable semantics. An ambiguous response stops and leaves existing reconciliation machinery authoritative; no blind POST retry. Growth lease is revoked on exit, with the independent watchdog as crash recovery.

Success means both approved Pins are `RECONCILED` with Pinterest Pin IDs, Growth OFF, no AI calls. If either fails, read the sanitized output and current DB state before any further action. The earlier HTTP 400 has no confirmed precise cause until provider details are observed.

## Next

Correct the root cause, reapprove an eligible future-time Flirty Pin only after reviewing the rejection and maintaining ownership/duplicate safeguards, then implement persistent publishing dispatch with an independently authorized schedule instead of activating all Growth job types. SEO/AdSense work resumes after the publishing gate passes.
