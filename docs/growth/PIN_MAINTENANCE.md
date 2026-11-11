# SayTwist Phase 14: Pinterest Pin maintenance (proposed)

Status: **feature PR only; not deployed, installed or activated**.

## Purpose

Production has 226 analytics-eligible Pins and a previously completed 222-Pin
historical backfill. Account analytics was most recently updated on November 9,
2026; Pin inventory and detailed Pin metrics were last updated October 17.

Daily account analytics runs on the existing 04:20 UTC timer. It does not
refresh the inventory or detailed Pin analytics. The administrator dashboard now
checks all component ages and must not label the aggregate FRESH when detail is stale.

## Quotas and realistic freshness

Existing durable Pinterest transport limits apply to all callers, unchanged:
**4 API attempts per rolling hour, 16 per rolling 24 hours**. These count all
GETs, Pin writes, token refreshes and ambiguous timeouts.

A complete 226-Pin individual refresh within 36 hours is impossible with this
shared budget. This runner offers *rolling coverage*, not full freshness.
Account analytics can remain current while older Pin records are marked stale.

## Proposed 12th timer (disabled by default)

`saytwist-growth-pin-maintenance.timer`
Fixed UTC ticks: 10:45, 12:45, 14:45, 16:45, 18:45, 20:45, 22:45.
No catch-up (`Persistent=false`).

On each tick:
1. Verify explicit operator approval tied to the exact deployed SHA, release,
   app identity, local database, running 11 existing timers, watchdog and
   production Pinterest configuration.
2. Verify global Growth OFF and no blocking Growth jobs. Check account
   connection, token expiry and `pins:read` / `user_accounts:read` scopes.
3. Reserve a single immutable maintenance slot in PostgreSQL, under the
   GrowthSettings row lock, *before* provider access. Preflight requires fewer
   than 2 requests in the past hour and fewer than 10 in the past day.
   The shared provider-level cap remains authoritative.
4. If Pin inventory is incomplete or older than 24 hours, fetch at most one
   page via the existing authenticated API; persist the bookmark and resume
   in a later tick. Otherwise fetch detailed metrics for at most one
   oldest-synced eligible Pin.
5. Report the outcome without creating any `GrowthJob` entry, activating the
   broad Growth worker, or automatically retrying an ambiguous provider call.

These optional bounded analytics functions suppress only the normal
continuation-job enqueue calls. Other callers retain existing behavior.

## Safety

- Does not publish Pinterest Pins, perform paid AI actions, or send Telegram messages.
- No migrations or general worker activation.
- Every provider attempt is durably reserved by the existing global throttle.
- Unexpected failures emit a limited Brevo operational email via the isolated
  maintenance alert service.
- Failure after maintenance slot reservation does not cause repeated requests in
  that slot. Next scheduled tick can attempt again after the normal safety checks.
- If an account token is within 20 minutes of expiry, the runner fails closed.
  Planned token refresh reliability is tracked separately; never silently
  reconnect an account.
- The jobless model avoids orphaned pending jobs that would otherwise prevent
  the next daily account analytics run.

## Release/activation contract

Do not merge until CI (lint, typecheck, tests and build) succeeds.

Do not deploy a main SHA without a new, exact-SHA 11-timer hold/deploy/restore
coordinator. The existing release coordinator is pinned to the earlier release
and must not be reused unchanged.

After explicit approval and release, root installs
`workers/install-growth-pin-maintenance-systemd.sh` from a root-owned 0700
copy, passing the exact deployed SHA. The installer checks the existing 11
timers and installs the **12th timer disabled**. A separate explicit operator
decision is required to enable the timer. Do not activate in the deploy script.

Verify the first scheduled execution through:
`systemctl show -P Result saytwist-growth-pin-maintenance.service`,
`journalctl -u saytwist-growth-pin-maintenance.service --no-pager -n 25`,
the global Growth gate (OFF / NULL lease), current queue (empty),
analytics state timestamps, and API request reservations.

Any blocked state means inspect logs and API quota first, never cancel or
synthetically mark a job successful.
