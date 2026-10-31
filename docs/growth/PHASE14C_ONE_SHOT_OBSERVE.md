# Phase 14C: one-shot OBSERVE worker qualification

Status: **code-only PR; not yet deployed, activated or proven on production**.

This is an intentionally limited **one-job** runtime qualification, **not**
autonomous Growth or permission to call Pinterest. Production Pinterest rate-limit
headers remain unparseable; the quota-dependent modes must stay disabled.

## Preconditions

1. Qualified deployment and unchanged `.deployed-release` equal to trusted `main` SHA.
2. Healthy, enabled system-level `saytwist-growth-lease-watchdog.timer` and
   `watchdog.service Result=success` with OnFailure alert service configured.
3. Existing running PM2 app is exactly the trusted `saytwist` production app.
   Global Growth OFF, attribution OFF, process Growth OFF, rollout OFF,
   Telegram/daily report/attribution collection OFF.
4. No active/retryable Growth queue rows. Existing global worker lease NULL.
5. Fresh independent production audit and owner decision to run one controlled
   provider-free trial. Only the `saytwist` SSH account executes the worker;
   no root invocation or alteration to PM2 environment.

## Owner authorization

After CI and protected deployment of this PR's merged `main` SHA:

- Owner creates an **open** issue titled
  `SayTwist Growth OBSERVE one-shot <SHA>`.
- Exact issue body, two lines:
  ```
  OBSERVE_TRIAL_SHA=<SHA>
  OBSERVE_TRIAL_TARGET=saytwist.com
  ```
- Owner adds exactly one new comment:
  `RUN SAYTWIST GROWTH OBSERVE ONE SHOT <SHA>`.

The `.github/workflows/growth-observe-one-shot.yml` issue-comment workflow
verifies the owner is the creator and commenter, the immutable SHA matches
trusted `main`, `main` has not advanced, and the deployed SHA matches.
The workflow concurrency lock prevents parallel trials from this workflow;
the database CAS and unique idempotency key defend against repeat admission.
There is no schedule or ongoing worker enabled by this workflow.

## What the trial does

- It verifies the host timer and OnFailure linkage first. The `saytwist`
  app user can only execute the ephemeral, constrained trial process.
- It reads the already-verified PM2 production DB URL into process memory,
  never into logs/files, and runs a `tsx` child with a **minimal environment**:
  no Pinterest, AI, Telegram or outgoing provider credentials.
- The child verifies exact SHA, owner approval string, user, executable,
  working directory, production loopback PostgreSQL 18 endpoint, and disabled
  scheduler/worker flags. It rejects any active/retryable queue or existing
  activation lease.
- A serializable Prisma transaction uses an atomic conditional settings update
  to enable Growth for **120 seconds**, inserts one
  `GrowthJobType.FOUNDATION_NOOP` row with unique
  `growth-observe-trial:<SHA>` idempotency key and maxAttempts=1,
  and records immutable GrowthSettings/Job activity.
- It invokes `runGrowthWorker` with `onlyJobId`, `batchSize=1` and
  an **invocation-local** OBSERVE allowlist. Normal queue retry/recovery is
  skipped, and a second job cannot be claimed by this invocation.
- Normal worker and wrapper both attempt exact-deadline CAS revocation.
  Unexpected exit or missed revocation is independently covered by the
  already-installed one-minute watchdog. Lease expiration prevents all
  subsequent claims, though it does not interrupt in-flight external calls.
- It verifies SUCCEEDED exactly for the no-op job, global Growth OFF, lease
  NULL and no active queue. Only fixed, sanitized result strings may enter CI
  logs.

Expected:
```
GROWTH_OBSERVE_TRIAL=PASSED
GROWTH_OBSERVE_TRIAL_JOB=SUCCEEDED
GROWTH_OBSERVE_TRIAL_GROWTH=OFF
GROWTH_OBSERVE_TRIAL_LEASE=NONE
GROWTH_OBSERVE_TRIAL_ACTIVE_QUEUE=0
GROWTH_OBSERVE_TRIAL_PROVIDER_CALLS=0
GROWTH_OBSERVE_TRIAL_AI_CALLS=0
GROWTH_OBSERVE_TRIAL_PIN_PUBLICATIONS=0
```

## Failure and rollback

If authorization, watchdog, PM2, settings, queue, CAS, worker or postcondition
fails, stop; inspect the **sanitized** workflow stage and owner-only production
audit, not environment/PM2 JSON or raw credentials. Do not retry blindly.
The job idempotency key prevents repeat trial admission on the same SHA.

A successful transaction is followed by two independent ordinary-exit
revocation attempts; on a hard process failure the watchdog conditionally
expires and revokes only the matching expired lease. Keep PM2 Growth OFF,
all provider activities disabled and do not disable the watchdog. Verify
timer active, `GrowthSettings.enabled=false`,
`workerActivationExpiresAt=null` and no active jobs after any trial.

A successful no-op trial **does not authorize** live Pinterest requests,
paid AI, Pin publication, Telegram schedules, recurring OBSERVE/RECOMMEND
workers, or autonomous Growth. Those require separate provider-safe policy,
operating review and explicit owner approval.
