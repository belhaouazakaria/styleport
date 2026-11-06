# Pinterest Create Pin HTTP 400 / provider code 2786: direct media fix

## Production observations (2026-11-06)

- Owner approved three **new** Creative Lab Pin candidates with independent scheduled times. Cold Hearted successfully published and reconciled (confirmed by the one-shot workflow); Flirty and Jester received deterministic Pinterest HTTP 400 responses. Jester's saved sanitized code was 2786: "Unable to reach the URL. Please check the URL is correct and try again."
- Independent origin checks returned HTTP 200, image/png (no redirect) for each approved 1000 × 1500 creative, and HTTP 200 (no redirect) for each translator destination. These checks do not prove Pinterest's own network was able to retrieve the image or destination; provider-side fetch is still the likely fault.
- Flirty and Jester publications are **terminal** and must not be blindly retried or mutated. The Flirty dangling failed-retryable job was independently retired to terminal, leaving Growth OFF and no active lease.
- Every GitHub owner-gated Pin production job that makes Pinterest writes must have idempotent, exact candidate/approval/job checks, durable provider quota reservation, and uncertain-outcome reconciliation. Never run the old exact three-Pin batch again.

## Fix

The production publisher now reads the **exact approved PNG file** from managed creative storage, validates 1000 × 1500 PNG bytes and SHA-256 against the approved publication snapshot, and sends `media_source: { source_type: "image_base64", content_type: "image/png", data, is_standard: true }` to Pinterest instead of asking Pinterest to fetch the image URL. This is supported by Pinterest's Create Pin API.

The adapter preserves legacy image_url mode for unit/test callers and records bounded, sanitized provider code/message for deterministic 4xx rejects. No change to the Pin's approved copy, board, campaign destination, attribution URL, approval checksum, or quota accounting.

## Release gates

Do not enable general Growth autopilot or publish jobs automatically with this change alone. Requires the existing production migration baseline (33 migrations, 0 incomplete), verified release SHA, three systemd timer rotations if deploying a new web release, and fresh owner-reviewed approval for re-attempting any terminal Pin. Deploy using the normal validated GitHub Actions deployment path, with independent watchdog and timer pin rotation. In the meantime, an isolated one-shot using the deployed publisher's injectable transport may validate the same direct media format without rotating the site's release, but only with separate exact-SHA authorization and new per-Pin approvals.

After a successful test, work toward a persistent, narrowly scoped publishing schedule. Do not bypass provider rate limits or the prior manual approval gate.
