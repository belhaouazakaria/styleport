# Phase 14L: Recurring publisher for newly approved Pins

**State (2026-11-06):** Implementation branch, **NOT deployed or enabled**. Phase 14K watchdog, Pinterest daily observation and local-intelligence timers are already active on production release `1f7f0560661a86947c3ce7c49c7a4669d41736f2`. Three new Pinterest Pins were reconciled successfully after owner review and direct-PNG recovery. Production web app remains pinned to the earlier release while the permanent direct-PNG adapter is merged in GitHub.

## Operational boundary

This is **not approval-free autopilot**. Every Pinterest publication still requires an authenticated admin's explicit image, title, destination, board and schedule approval. The publisher only claims one eligible `PINTEREST_PIN_PUBLISH` job per five-minute interval; no AI or content authoring. It never claims stale historical Creative Lab candidates generated before the explicit November 6, 2026 cutover.

- Exactly one PENDING first-attempt job of this one type is allowed; a matching READY candidate, immutable approved snapshot, owner review, account scopes, original schedule, destination and board must remain valid. The deployed `publishApprovedPin` service independently validates the exact approval checksum, expiry and asset and publishes direct approved PNG bytes to Pinterest.
- Growth OFF and no activation lease before admission; a compare-and-swap DB lease is granted for **180 seconds** only and revoked in `finally`. The separately active watchdog handles crashes. No generic Growth worker or previously queued Translator/Idea/AI jobs are enabled.
- Global Pinterest budget retains **4 requests / rolling hour and 16 / rolling 24 hours**, with persisted provider cooldown. The runner prechecks capacity and returns `QUOTA_PAUSED` before any provider request when exhausted; the actual provider API wrapper reserves again atomically before each transport call. An access token expiring within 20 minutes blocks rather than silently triggering a refresh in the publisher. No automatic Create Pin POST retries.
- A deterministic API 4xx results in a terminal publication/job. An ambiguous or post-create-persistence outcome remains `RECONCILING` and may require separately qualified reconciliation. This job is never blindly republished. If unrelated Growth jobs are active, the standalone publisher blocks.
- The worker launcher inherits no arbitrary PM2 credentials. It validates user `saytwist`, Node path, exact DB loopback and release SHA, watchdog, all existing daily timers and process flags; it loads only the five Pinterest credentials needed by the existing production connector. Output exposes a small fixed set of status names, never raw provider bodies, environment or tokens.
- Root-owned `install-growth-approved-publisher-systemd.sh` (chmod 0700, SHA-verified standalone copy) installs separate .service / five-minute .timer / private failure alert. **It does not enable or start the timer.** The alert uses Brevo recipient credentials already present in the root-owned restricted watchdog alert environment and allows one submission per six hours.

## Coexistence with daily schedules

A new `countBlockingGrowthJobs` helper treats **valid newly approved pending scheduled Pins** as inert and permits the existing OBSERVE and three local-intelligence jobs to run while Pin publications are scheduled. Every other pending, running, claimed or retryable Growth job still blocks the isolated daily worker. This is classification only: it grants no new worker type permission, and daily cycles still cannot publish Pins.

## Release and installation checklist

1. Pass lint, typecheck, tests and build; verify release has exactly the same 33 database migrations (no new migrations required for this change). Review exact branch diff, JS runtime output and no secrets, cutover, timer/alert permissions, and behavior on provider 400/429/ambiguous response.
2. **Protected deploy:** While all three existing timers are enabled, a GitHub application deployment alone is unsafe because their pinned SHA would become stale. Root must explicitly stop/disable the three scheduled timers and stop watchdog timer according to the existing Phase 14K release runbook. Then GitHub Actions `deploy-hostinger.yml` is manually dispatched with the **exact GitHub main HEAD SHA**, which performs its own backup and no-pending-migrations check.
3. After healthy deployment/DB audit, rotate the **watchdog** to the new release using its existing root-owned 0700 SHA-pinned rotation script, then **daily OBSERVE**, then **autonomous cycle**, each with its own reviewed SHA-pinned rotation and verification; independently re-enable the three original timers. Do not skip or relax any old release gate.
4. Only once all three timers are active and pinned to the new deployed release, install the publisher units via a private root-owned 0700 copy of the exact reviewed `workers/install-growth-approved-publisher-systemd.sh`, passing the deployed SHA. Confirm `INSTALLED_DISABLED` and audit service/environment.
5. Perform **one controlled empty-queue dry run** with Growth OFF, no provider requests and `GROWTH_APPROVED_PUBLISHER=IDLE`. Then separately obtain owner approval to `systemctl enable --now saytwist-growth-approved-publisher.timer`. Do not call it live merely because units were installed.
6. With a fresh individually approved future Pin, verify one real scheduled publication becomes `RECONCILED` with Pinterest Pin ID, Growth OFF, lease NULL, no unintended jobs, global quota charged and no alert. In a replay/multiple timer tick ensure no duplicate Create Pin.
7. If failure occurs, stop the publisher timer, retain append-only jobs and provider evidence, and notify the owner. Keep prior three timers and watchdog stable; no blind retry.

## Not delivered by Phase 14L

Automatic drafting of **fresh** Pinterest creatives, provider-side reconciliation scheduling, GA4 attribution opt-in, daily private Telegram reporting, higher-cost AI creative/model actions, translator/Idea autonomous edits and board lifecycle changes remain independent gated workstreams. These must not be declared fully live just because the approved publisher is scheduled.

**Status rule:** `SOURCE_READY` means code merged; `INSTALLED_DISABLED` means inactive; `LIVE` requires explicit timer approval, a completed end-to-end scheduled Pin, and stable postflight. 
