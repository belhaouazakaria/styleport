# Phase 13 — no permanent staging, controlled production rollout

**Operator decision 2026-10-25:** no persistent staging website/environment. Use GitHub disposable PG16/PG18 qualification, a separate temporary PostgreSQL 18 migration rehearsal (never on the live SayTwist database), a verified production backup, then one operator-approved production deployment with both Growth and Telegram recurrence disabled. This is NOT approval to merge or deploy now.

## Before creating the production release

1. Confirm PR #15 HEAD and both CI workflows green on exactly that head. Do not retarget, merge or push directly to `main` before all migration and deployment prerequisites are explicitly authorized. The repository **runs CI and prepares a release artifact** on pushes to `main`, but the actual `deploy` job is gated by `workflow_dispatch`, `refs/heads/main`, and exact approved release SHA. Merging alone must not be treated as a deployed release; nevertheless, do not merge without operator approval and the full migration/backup gates.
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
- **Completed (operator-reported 2026-10-25):** BotFather group joins disabled; one recipient's private no-send pairing saved locally; read-only verification returned `bot verified: true` and `private chat verified: true`. This has not verified live production secret provisioning or sent a report. Never share credentials/chat ID in ChatGPT, screenshots or Git.
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

## Operator read-only production preflight and VPS capacity (2026-10-25)

Operator-provided values (not independently inspected on VPS): both application endpoints returned HTTP 200; PM2-derived production DB target is `127.0.0.1:5433/saytwist`; Prisma migration log has zero incomplete rows, and latest applied migration is `20261016120000_growth_analytics_gap_recovery`. Exactly four Phase 13 migration directories are pending: `20261018120000_growth_economics_limits`, `20261024190000_growth_telegram_delivery_default`, `20261024210000_growth_ai_usage_evidence`, and `20261025150000_growth_daily_report_append_only`. Growth and attribution DB flags are OFF; Telegram and attribution environment toggles are UNSET. Production runtime does **not** have a `.env` in the application root; retrieve production database credentials from the existing PM2 process only inside a trusted, nonlogging script. Never fabricate an `.env` or write secret values to a repository file.

Physical resources: 146 GiB reported available on the root filesystem (193 GB capacity), 15 GiB total memory / **5.7 GiB available** memory, 2.0 GiB swap nearly unused, PostgreSQL server **18.6** with matching `pg_dump`/`pg_restore` clients **18.6**, backup folder about 48 MiB, live database about **49.2 MiB**. Application DB role **does not have CREATEDB**. The temporary isolated clone must therefore be created under a distinctly named database using an explicit `root`/PostgreSQL-admin action, without granting CREATEDB on the application account. Use `template0` and a narrowly scoped owned role, revoke `PUBLIC` database access to the clone, and never copy from the live database via `CREATE DATABASE ... TEMPLATE saytwist` (would require excluding normal client sessions). The cloned database must be restored from a new restricted PG18 custom-format `pg_dump` with a single job (`pg_restore --single-transaction --exit-on-error --no-owner --no-acl`) before any pending migration runs on the clone. A `pg_restore --list` check alone is **not** a full restoration test.

For sensitive dump storage, prefer an owner-only directory **outside the htdocs web root** (for example `/home/saytwist/.local/share/saytwist/phase13-backups`, mode 0700 with dump mode 0600), not a world-readable or Git-visible location. Verify dump identity, basic file size and a full clone restoration, then rehearse exactly four migrations with a client connected to the named clone; production database remains untouched. Avoid printing PM2 `jlist`, the production database URL, its password or any archived content. No backup, restore, DDL or production deployment has occurred as part of these read-only preflight checks. Obtain operator approval before actual production migration and release.

## Verified source archive created (operator report 2026-10-25)

The operator completed one live-production **read-only** `pg_dump --format=custom` via the approved PostgreSQL 18.6 client after confirming the production PM2 database target `127.0.0.1:5433/saytwist`. The owner-restricted backup was written **outside htdocs** at `/home/saytwist/.local/share/saytwist/phase13-backups/pre-phase13-20261025T192955Z.dump`. Operator output: `BACKUP_CREATED=true`, `BACKUP_ARCHIVE_VALID=true` (successful `pg_restore --list`), archive size **4.88 MiB**, `PRODUCTION_DATABASE_MODIFIED=false`. Keep this archive and permissions intact. A TOC check is **not** a completed restore or proof of recoverability; a full single-transaction restore into a uniquely named database from `template0` is still required. The application user has `CREATEDB=false`; clone creation requires separately labeled root/PostgreSQL-admin actions. The operator has NOT authorized applying the four migrations to live production, merging the release, enabling Growth or sending Telegram.

## Clone restored and migration rehearsal prepared (operator report 2026-10-25)

The operator created the private temporary database `saytwist_phase13_rehearsal_20261025` with PostgreSQL administration access (without granting CREATEDB to the SayTwist app account), and successfully restored the restricted production archive into it. **Observed outcomes:** `CLONE_TARGET_VERIFIED=true`, `CLONE_EMPTY=true`, `RESTORE_COMPLETED=true`, **27 restored finished migrations**, last `20261016120000_growth_analytics_gap_recovery`, restored database **47.1 MiB**, production database unchanged. This satisfies the full populated-backup restore test, and the four-migration rehearsal is separately confirmed below; it does NOT authorize a live release.

Purpose-built checked-in runner: `scripts/growth-phase13-clone-rehearsal.cjs`. On a local operator checkout of the latest reviewed `phase/13-finance-reporting` HEAD, create a tar archive via `git archive HEAD prisma/schema.prisma prisma/migrations scripts/growth-phase13-clone-rehearsal.cjs` (pipe to gzip) and transport via authenticated SCP to `/home/saytwist/.local/share/saytwist/phase13-rehearsal/<approved-Git-SHA>/`, mode 0700. This bundle contains migrations, schema and runner only: no API keys or live data. Extract it under that private directory, NOT into htdocs. Invoke the runner as user `saytwist` using the approved Node 24 executable. Its preflight compares exactly 31 source migration directories against 27 live and cloned applied histories and their source SQL checksums; checks clone ownership and target; requires four exact pending migrations; derives the DB connection privately from existing PM2; forces a clone-only `DATABASE_URL` when executing existing production Prisma CLI; verifies migrated structure and enabled append-only triggers, exercises both guards inside a rollback-only clone transaction, and checks production migration history unchanged. On unknown error, it fails closed and suppresses provider/CLI secrets.

**Never** run `prisma migrate deploy` manually against the production `DATABASE_URL` during this rehearsal. Do not upload the private production dump or PM2 JSON into Git. Once the guarded test passes, obtain a separate release authorization for the four live schema migrations and the deployment. Preserve backup and clone until the completed release is verified.

## Completed production-clone migration rehearsal (operator output 2026-10-25)

The operator ran the purpose-built `scripts/growth-phase13-clone-rehearsal.cjs` against the restored, app-owned and exact-named PostgreSQL 18.6 temporary database (not the production database). It reported all of:

```text
CLONE_BASELINE_MATCHED_PRODUCTION: true
PENDING_MIGRATIONS_APPROVED: 4
CLONE_MIGRATION_COMMAND_SUCCEEDED: true
CLONE_MIGRATIONS_APPLIED: 4
CLONE_SCHEMA_AND_IMMUTABILITY_VERIFIED: true
PRODUCTION_MIGRATION_HISTORY_UNCHANGED: true
PRODUCTION_DATABASE_MIGRATED: false
```

This confirms four migrations applied successfully on populated, restored production data and passed immutable accounting and report-archive trigger probes. The archive remains restricted off-webroot and the clone should be retained until post-release validation. Latest matching HEAD at time of rehearsal was `5532994985e5e3720a8021c1d9e37e2da258a913`; later guard-only code/docs/test commits require a fresh checked PR head review, but the source SQL and Prisma schema must remain unchanged.

## Phase 13 guarded live-migration helper (PRE-FLIGHT ONLY unless separately approved)

`scripts/growth-phase13-production-migration.cjs` is a new source-only standalone helper that defaults to **read-only** `preflight`; an operator must deliberately invoke `apply` and provide a case-sensitive SHA-bound private environment confirmation `GROWTH_PHASE13_PRODUCTION_APPROVAL` matching the reviewed source SHA. The runner also checks the exact source-only bundle location `/home/saytwist/.local/share/saytwist/phase13-rehearsal/<full-sha>`, live PM2 app identity, live and clone's immutable migration checksums (27/31 entries), exact four pending migration filenames, existing Growth/attribution/reporting disabled status and live `healthz`/`readyz`. It stops if another deployment lock exists.

Only in explicitly approved `apply` mode, the script creates a **new** restricted PostgreSQL 18 custom archive outside `htdocs`, verifies size/permissions/TOC, rechecks live baseline, then runs the four migrations from the approved source bundle using the **live** PM2 connection, before validating final migration history, triggers and app health. This is a production DDL operation; its effects are not automatically rolled back if one Prisma migration fails. Never run it until a separate explicit operator approval and maintenance plan. The old `hostinger-prepare-migration.sh` remains inappropriate because it targets an earlier migration and assumes `.env`.

This helper **never** performs Git merge, production application deployment, PM2 restart, OpenAI paid calls, Pinterest action or Telegram send. Once the four live schema migrations succeed, production code release is a separate explicit GitHub `workflow_dispatch` with exact approved merge SHA. The existing application deployment blocks pending migrations. Keep Growth, attribution, daily scheduler and Telegram sends disabled throughout. The operator must verify the fresh backup and release results before separately approving one private Telegram report acceptance message.
