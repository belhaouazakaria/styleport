# Phase 14M: daily fresh Pinterest creative preparation

**Status:** implementation branch, **NOT deployed or enabled**, November 6, 2026. Depends on the Phase14L approved-Pin publisher merged in PR #132, which remains inactive in production pending a coordinated one-release SHA rotation and owner approval.

## Purpose

Every morning at **07:02 UTC**, prepare a small number of new, zero-cost 1000×1500 PNG Creative Lab candidate drafts from **active, unarchived** existing translators. Their images, copy, destinations and template provenance are stored in the same Creative Lab as manually generated candidates, and every Pin still needs a separate authenticated admin approval.

No AI/model API calls, Pinterest API calls, translator edits, content publishing, Telegram messages, first-party attribution collection or automatic Pin approval are performed.

## Eligibility and cadence

- Must have exactly one connected production Pinterest account with a usable board and write scopes. This is a readiness check, not a new Pinterest request.
- Translators must be active, unarchived, have at least one saved example, nontrivial descriptions, and **zero** previous GrowthPinCandidate entries. This explicitly avoids the old Oct 2026 gallery candidates and all three new Nov 6 candidates rather than recycling them.
- The renderer is `MINIMAL_STATEMENT`, static 1000×1500 PNG. A duplicate/DEFERRED candidate is **not** retried or published automatically. Selection is deterministic (featured status, sort order, slug) and uses the existing similarity/classification checks.
- The initial independently enforced cap is **three fresh candidates per UTC day**, below the owner's existing 10/day planning ceiling. The real `GrowthDailyCadencePreference` `PAUSED` and `FIXED` modes are honored. In AUTO, select **one** exploratory original target if recent opportunity evidence is insufficient; up to three only when the latest local Opportunity Intelligence run within 48 hours has `KNOWN` evidence and actual opportunities.
- Existing today's candidate counts (all sources) reduce the remaining capacity. Never generate filler merely to satisfy the owner's minimum when no original qualified targets exist.
- Each generation is a separate one-job lease (120 seconds), exact job ID, max one attempt, `GrowthSettings.enabled` temporary compare-and-swap and independent watchdog. Growth OFF and lease NULL after every candidate; only already-approved inert pending Pin jobs are tolerated in the queue. Any unrelated queued/running/retryable job stops preparation.

## Runtime and failure handling

The root-owned `install-growth-daily-fresh-systemd.sh`, executed only from an independently SHA-verified private 0700 copy, installs the 07:02 UTC .timer, one-shot .service and throttled private Brevo failure alert. It **does not start or enable** anything.

The launcher verifies the exact deployed SHA and `saytwist` user/Node/cwd, watchdog and all four existing timers (watchdog, OBSERVE, intelligence, newly installed approved-Pin publisher), private PostgreSQL address via the existing PM2 runtime contract, and all nonparticipating automation switches OFF. It passes **no Pinterest or OpenAI tokens**, no unrelated env, and emits bounded status codes only. `GROWTH_DAILY_FRESH_LAUNCH=BLOCKED` is a generic fail-closed result without log secrets.

## Release/activation

1. Pass PR lint, TypeScript, 790+ tests, build, shell syntax, security checks and the zero new migration verification. Merge into `main`; no production auto deploy on merges.
2. Follow the Phase14L protected release sequence: root owner disables the three current SHA-pinned timers, safely holds watchdog, manually dispatches `deploy-hostinger.yml` with the exact HEAD SHA (backup, no pending migrations, health, rollback), rotates watchdog then OBSERVE then intelligence to new SHA, and independently re-enables them.
3. Install Phase14L five-minute publisher units, verify the empty-queue no-provider-call trial, then enable only after explicit owner approval and live scheduled Pin validation. **This step is not optional for Phase14M**, as the fresh generator depends on a healthy recurring publisher.
4. Install Phase14M units while all four timers are active, pinned to the new SHA; verify `INSTALLED_DISABLED` and exact audit. Run one separately owner-authorized **TRIAL** for today's UTC date with a fresh target, zero API calls and no Pin publication, then verify the candidate is READY in the admin library.
5. Independently approve enabling `systemctl enable --now saytwist-growth-daily-fresh.timer` and validate the next actual calendar execution (or controlled trial) against the daily cap, statuses and private alert.
6. Stop the new timer on any unexpected content, provider calls, orphan job, lease anomaly, or duplicate generation. Leave older Growth schedules and the production site stable.

## Full-live boundary

Phase14L + 14M complete the **approval-based Pinterest organic production loop**, not every future Growth feature. Automatic provider reconciliation, verified outbound click attribution opt-in, daily private Telegram reports, paid AI creative variants, automated Translator/Idea publication and Pinterest board lifecycle changes have separate privacy/cost/security approvals and rollout gates. Do not call them live by implication.
