# Phase 13 acceptance checklist — isolated release rehearsal (2026-10-25)

**State: NOT accepted, NOT deployed.** PR #15 (`phase/13-finance-reporting` → `main`) remains open. No production migration, recurring job, Telegram send or paid AI call has been authorized.

## Safety boundary before any rehearsal

- Use a disposable or independently provisioned **staging** database only. Never run `prisma migrate reset` on the shared SayTwist production DB. The exact-name CI DB test command resets its target and must remain confined to GitHub Actions' throwaway PostgreSQL.
- Confirm the checkout SHA matches the PR head, both CI workflows are successful on that SHA, and the GitHub PostgreSQL workflow qualifies both 16 and 18.
- Confirm staging database name, listener/host, recovery point and credentials **out of chat, CI logs and PR**. Obtain operator authorization for staging deployment separately; do not assume production VPS access is implied.
- Stage both new database migrations and the app together with rollback capability. Never downgrade by dropping reservation/usage/report/warning audit tables; code rollback disables execution and preserves evidence.
- On staging and production, keep Growth switch OFF, attribution server and setting OFF, `TELEGRAM_REPORTS_ENABLED=false`, `GROWTH_DAILY_REPORT_SCHEDULE_ENABLED=false`. No existing Pinterest publish approval should be altered.
- For new migrations, test on PostgreSQL 18 using `prisma migrate deploy` against a disposable clone, verify constraints/indices and append-only evidence trigger; do not use `migrate reset` against staging or production. A DB major version CI job cannot prove deployment-configuration parity.

## Test matrix (run without real provider calls)

| Surface | Required acceptance | Fail condition |
| --- | --- | --- |
| `/admin/growth/spend` | ADMIN-only, no OpenAI request; reserve caps + unknown billed actual correctly distinct | Exposed to non-admin, unknown shown as zero/paid invoice |
| `/admin/growth/reports` | ADMIN-only, 30-row cap, completed UTC archives only; no send on view | Data leaked to guest, viewing calls Telegram |
| `/admin/growth/reports/growth-YYYYMMDD` | ADMIN-only, escaped immutable plain-text digest and one delivery status | Arbitrary ID accepted or an unsafe HTML rendering |
| `/admin/growth/warnings` | ADMIN-only, 50-row cap, read-only listing; ACK then RESOLVE requires same-origin POST and actor | Cross-site or non-admin transition accepted |
| Staging database | Unique same-request reservation, serialized budget gates, content caps, evidence UPDATE/DELETE blocked, report send-attempt claim once-only | Double reservation, updateable evidence, second claim |
| Failure drill | Unknown OpenAI response retains cap, Telegram mocked timeout marks UNKNOWN and blocks resend, disabled switches no-op | Retry, budget exposure refunded or second provider send |
| UI quality | Mobile 320px, tablet 768px, desktop 1440px; readable cards/tables, horizontal scroll, keyboard focus, accessible alert errors | Layout clipping hides totals/actions, unreadable admin data |
| Diagnostics | No tokens, private chat IDs, sensitive provider response JSON, prompt data or credential-bearing URLs | Secret exposed in log, HTML or error |
| Public/product isolation | Translator/search/login/Ideas unaffected; no new sitemap/admin indexing, no active cron/worker | Public regression, unsolicited service / Pinterest call |

## Known cost accounting limitation

The official OpenAI Costs endpoint provides billed **aggregate UTC project/day/line-item costs** and can be reconciled with invoice-facing organization totals, but **not individual Growth API request costs**. Existing SayTwist normal translation traffic may share an OpenAI project and cannot be silently reclassified as Growth charges. `provider-costs.ts` is an **unused** read-only adapter; do not place a privileged organization Admin API key in the web server by default.

Before recording a provider-sourced aggregate as Growth-only:
1. Operator identifies a demonstrably dedicated Growth project for the queried period, or explicitly decides to keep all cost allocations unavailable for a shared project.
2. Inspect provider project/cost controls using an operator-owned secure environment, never paste administrative credentials into GitHub/chat.
3. Design immutable source-window evidence and revision/adjustment treatment: observation timestamp, provider organization/project, period, currency, original source digest, actor, zero-day coverage, line-item summation and access control.
4. Document invoice matching and missing/project-wide charges. *Do not derive precise per-request billing from project totals or token-based estimates.*
5. Decide whether authoritative daily **aggregate** monitoring is sufficient for Phase 13 acceptance while per-request actual settlement remains blocked; until explicitly accepted, Phase 13 is NOT complete.

## Telegram no-send provisioning gate

Once staging is approved, create a dedicated bot privately using official @BotFather. The recipient sends `/start <random lower-case hex code>` in a **private** chat. On an isolated checkout run the existing `npm run growth:telegram:discover` then `npm run growth:telegram:verify` with private token/code loaded from a secure prompt or secret manager. Never paste token/recipient ID into chat, GitHub, shell history or CI. These tools do not send or modify provider messages. Both reporting flags remain **false** throughout.

The **separate live-test gate** requires explicit operator authorization for one attempt to the verified private recipient and human confirmation that one message arrived. An API `SUBMITTED` response is not a read receipt. If the attempt is `SENDING`/`OUTCOME_UNKNOWN`, stop and reconcile manually; no resend, DB reset, replay or duplicate archive.

## Exit signoff / rollback

- Record SHA and both workflow URLs; describe staging migration result, role-based admin tests, UI review, identity/security checks, drift in full cost evidence, and live Telegram reception outcome.
- Document explicitly unresolved actual invoice/settlement gaps and whether operator accepts aggregate-only reporting as a controlled limitation. Do not mark unknown costs as $0.
- **Phase 13 exit requires operator signoff** and PR base policy review (PR currently targets main). Do not merge, retarget, deploy or install a recurring timer as an implicit consequence of green CI.
- Rollback the application code and keep `GrowthSettings.enabled=false`, attribution disabled and both Telegram flags false. Preserve migrated financial events, archived reports and delivery claims for audit. Do not remove immutability constraints or truncate ledgers to rescue a failed run.
- Phase 14 remains a separate autopilot/production authorization gate. Individual Pinterest Pin approval remains mandatory.

## Additional one-send acceptance command

The purpose-built `npm run growth:telegram:acceptance` is the only recommended human-invoked **live report acceptance** path after staging, bot private-chat validation and express authorization. It independently requires `GROWTH_TELEGRAM_ACCEPTANCE_ENABLED=true`, `GROWTH_TELEGRAM_ACCEPTANCE_ENVIRONMENT=isolated-staging`, daily schedule OFF, reporting transport ON, and the exact `SEND ONE TELEGRAM REPORT growth-YYYYMMDD` confirmation for **yesterday UTC** at or after 04:00 UTC. Unlike `growth:daily-report`, it never enables or invokes a recurring scheduler. It performs no provider/network call when disabled, reuses the one persistent once-only claim and propagates UNKNOWN/prior attempts with no retry. The CLI and tests do not constitute approval or real delivery. See TELEGRAM_RUNBOOK.md for private secret handling and a human receipt check.

## Immutable report schema qualification

The new `20261025150000_growth_daily_report_append_only` migration is mandatory in the isolated PostgreSQL 18 rehearsal. It refuses UPDATE and DELETE of archived daily snapshots. Confirm concurrent archival still picks the first date winner after the archive service's INSERT/P2002 handling and that delivery state changes remain possible. The disposable CI test harness uses TRUNCATE for fixture cleanup; **never copy that command onto production or a populated staging environment.**
