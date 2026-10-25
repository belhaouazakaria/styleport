# Phase 13 — no permanent staging, controlled production rollout

**Operator decision 2026-10-25:** no persistent staging website/environment. Use GitHub disposable PG16/PG18 qualification, a separate temporary PostgreSQL 18 migration rehearsal (never on the live SayTwist database), a verified production backup, then one operator-approved production deployment with both Growth and Telegram recurrence disabled. This is NOT approval to merge or deploy now.

## Before creating the production release

1. Confirm PR #15 HEAD and both CI workflows green on exactly that head. Do not retarget, merge or push directly to `main` before all migration and deployment prerequisites are explicitly authorized. The repository has an **automatic production deploy on pushes to main**; merging the PR can start production changes.
2. Review the full migration inventory and decide which are pending versus already applied, using a **read-only** production migrations status query. Rehearsal on a fresh disposable database is not enough to establish compatibility with a populated production database.
3. Make a transactionally consistent PostgreSQL 18 database backup using the existing approved backup mechanism. Verify nonzero size, restricted permissions, correct PG18 format, available free disk and a *restore test* on a separate disposable database. Never log database credentials or paste them into chat/GitHub.
4. Rehearse the exact new migration chain against an **isolated disposable copy** of that backup. Do not execute `migrate reset` or fixture TRUNCATE on any persistent environment. Check Growth schema, trigger, immutable evidence and backward compatibility; do not alter any production rows during rehearsal.
5. Check existing PM2/web runtime, translation and Ideas availability and independent Growth kill switches before migration. Production must keep `GrowthSettings.enabled=false`, attribution disabled, `TELEGRAM_REPORTS_ENABLED=false` and `GROWTH_DAILY_REPORT_SCHEDULE_ENABLED=false`. No persistent Growth worker/cron/timer is to be installed.
6. Only after the operator accepts the backup/restore/rehearsal evidence may the reviewed release migration be applied once, with an exact SHA confirmation and a limited maintenance window. Existing `hostinger-prepare-migration.sh` is hard-pinned to a previous recovery migration and **must not be repurposed blindly**; write/review the Phase 13 migration instructions against the current deploy script before use. Do not bypass the current `EXPECT_NO_PENDING_MIGRATIONS` deployment guard.
7. Verify the production admin pages, budget reservation/warning displays, no secret disclosure, immutable archive, responsive layout and ordinary translation/Ideas health. Keep every provider send/publish off. If a check fails, stop recurrence, roll back application code using the established release mechanism, and retain financial/report history. Database rollback requires deliberate recovery from backup; never truncate accounting evidence.
8. BotFather: disable group joins with `/setjoingroups` for the new bot. The read-only `growth:telegram:verify` must confirm `can_join_groups=false` and the single private recipient. A public bot username can still be found/messaged by others; **no inbound runtime** exists, and only the configured numeric private recipient receives reports. Keep token exclusively in private secrets.
9. Once deployed with flags OFF, the operator must explicitly authorize exactly one **production** report-message acceptance under a dedicated, reviewable run-once gate. Current `growth:telegram:acceptance` now supports either verified `isolated-staging` on a nonproduction loopback database, OR production only with exact `127.0.0.1:5433/saytwist` database destination plus TWO report/date-bound explicit confirmation strings. No production send is yet approved or executed. The mode marker does not itself authorize or execute anything.
10. Following a verified single receipt, obtain separate operator signoff before scheduling daily reporting. Growth auto content, attribution and Pinterest publishing remain subject to Phase 14, and individual Pin approval remains mandatory.

## OpenAI project isolation

Use a dedicated project named SayTwist Growth Agent. Provide a **distinct** project API key and project ID through private deployment secrets (`GROWTH_OPENAI_API_KEY`, `GROWTH_OPENAI_PROJECT_ID`), leaving the normal site `OPENAI_API_KEY` untouched. Growth Text/Creative Lab Image/Creative Example providers now use only the Growth credential and explicitly selected project; missing, malformed or identical credentials reject a request **before** AI budget reservation. Set the project's $30/month *enforced hard spend limit* and 70%/90% alerts. Project/provider ceilings complement, not replace, application $2/day and $30/month hard reservations. Provider enforcement can lag.

The organization Admin API key for Costs API is *not* required at runtime and must not be installed in the normal website process. Cost source snapshots are aggregate project/day/line-item data, not exact per-request invoice charges; keep `reconcileGrowthAiBudget` blocked until an approved source/audit policy exists. If the Growth project cannot be proven isolated, project costs cannot be represented as Growth-only.

## Manual inputs still required

- Dedicated Growth project created, its model access (gpt-4.1-mini and pinned image model) and enforced spend limit verified, distinct project API key stored privately.
- BotFather `/setjoingroups` disabled; one recipient's private pairing and read-only verification performed. Never share credentials/chat ID in ChatGPT, screenshots or Git.
- Operator permits a **specific backed-up production release** after backup/rehearsal evidence, followed by separate consent for one live Telegram receipt and later schedule.

## Production-specific single message gate (NOT AUTHORIZED OR RUN)

After a separately approved production release, exact production DB URL validation, completed bot private-chat pairing, human review of today's operational health and explicit consent to one message, the `growth:telegram:acceptance` command may be run ONCE with the regular schedule OFF. It requires:

- `GROWTH_TELEGRAM_ACCEPTANCE_ENABLED=true`
- `GROWTH_TELEGRAM_ACCEPTANCE_ENVIRONMENT=production`
- `DATABASE_URL` pointing to the existing production PostgreSQL `127.0.0.1:5433/saytwist` (never provide database password in a report)
- `GROWTH_TELEGRAM_ACCEPTANCE_CONFIRMATION="SEND ONE TELEGRAM REPORT growth-YYYYMMDD"` for exactly yesterday UTC after 04:00 UTC
- `GROWTH_TELEGRAM_PRODUCTION_APPROVAL="I APPROVE ONE PRODUCTION DELIVERY growth-YYYYMMDD"`, a second independent, report-bound approval
- `GROWTH_DAILY_REPORT_SCHEDULE_ENABLED=false`, `TELEGRAM_REPORTS_ENABLED=true`, and privately verified bot token + private chat ID

The CLI does not install recurring jobs, enable Growth or enable Pinterest. `SENDING` and `OUTCOME_UNKNOWN` are terminal for automatic attempts and require operator review, not retry. Immediately restore both Telegram opt-in flags to OFF afterwards. Report API submission is not a receipt. The bot owner must confirm the message was received in their own private chat.
