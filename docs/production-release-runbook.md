# Production release and rollback runbook

Updated: 2026-10-16

This runbook applies to the Hostinger production workflow. It does not authorize a merge or deployment by itself.

## Release gates

Before merging:

1. Confirm full ESLint, Vitest, TypeScript, and production build all pass on the release commit.
2. Confirm the focused SEO, Pinterest sharing/publishing, and Ezoic redirect tests pass.
3. Confirm the production SEO impact approval is attached to the release record. The approved 2026-10-13 report retained all 355 translator URLs, removed none from the sitemap, and changed no robots metadata.
4. Confirm strict human-review indexing enforcement is still disabled.
5. Confirm the Ezoic managed response contains the operator-approved AdSense seller authorization.
6. Check whether the GitHub `production` environment has required reviewers. When it does not, the exact-SHA manual dispatch gate remains mandatory; an ordinary push to `main` must never deploy. The owner-approval issue-comment bridge below can invoke the same guarded manual dispatch without adding secrets.
7. Configure `HOSTINGER_PM2_CLI=/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2` for the verified PM2 7.0.4 CLI that connects to `/home/saytwist/.pm2`. The deploy script never searches for, downloads, or installs PM2.

The deploy workflow must finish its pinned Node `20.20.2` / npm `10.8.2` clean install, lint, typecheck, tests, build, production-dependency pruning, Prisma-engine checks, and bundle validation before the production-environment job can start. A GitHub-hosted runner never receives authority to migrate the VPS-local database.

## Artifact contract

The SHA-addressed `hostinger-release-<commit>` artifact is retained for 14 days and contains:

- the complete `.next` build and `public` assets;
- the Prisma schema, migrations, generated client, and both Hostinger-compatible query engines;
- production `node_modules`, including the `tsx` runtime;
- `lib/`, `workers/`, and `tsconfig.json` for the existing editorial worker and bounded Growth worker commands;
- `ecosystem.config.cjs`, `server.js`, Next configuration, and package manifests.

The workflow verifies those paths after creating the archive. The Hostinger script repeats critical staging checks before replacing runtime paths. It preserves `public/generated`; the separate `storage/` tree, `.env`, database backups, and rollback releases are not included or replaced by the release archive.

The Growth worker remains bounded and explicitly invoked. This release does not add a recurring Growth process, enable Growth, change attribution gates, or relax Pinterest approval/publishing restrictions.

The sitemap is rendered dynamically in production. CI deliberately uses a non-production loopback database placeholder and cannot snapshot translator membership into the artifact; `/sitemap.xml` reads the VPS-local database at request time and must retain the approved 355 translator URLs.

## Migration safety

Phase 12.2 introduces the reviewed migration `20261016120000_growth_analytics_gap_recovery`. It is additive: it adds one job enum value, recovery tables and indexes, and permits null Pin metric counts for provider-incomplete observations. It does not drop, rename or rewrite existing rows, and it does not modify immutable Phase 12 learning runs. The deployed Phase 12.1 application continues to write non-null metric counts and is compatible with the migrated schema while Growth remains disabled and recovery has not run.

Production PostgreSQL remains private at `127.0.0.1:5433`. The deployment workflow never receives database credentials and `scripts/hostinger-deploy.sh` never runs `prisma migrate deploy`. Its existing zero-pending safety gate remains mandatory: any pending or failed migration stops deployment before application files are replaced. Because the GitHub production environment has no required reviewers, the workflow's production deployment job runs **only** on an explicit `workflow_dispatch` from `main`, with an operator-supplied `expected_release_sha` that must match the exact GitHub commit SHA. A push to `main` runs the CI/build/artifact job but skips the deployment job.

## Agent-operated, exact-SHA production release bridge

The original `.github/workflows/deploy-hostinger.yml` workflow stays **manual dispatch only** for production and retains its exact `expected_release_sha` check, full CI/build, verified release archive, protected PG18 backup, zero-pending-migrations check, pinned PM2 process, readiness and rollback behavior. `push` to `main` still produces an artifact and skips deployment.

To allow the connected GitHub assistant to request an **individually authorized code-only release**, `.github/workflows/production-release-bridge.yml` listens for an issue comment **created** on the default branch. It checks the authenticated owner `belhaouazakaria` is the request issue creator, the commenter, and the event sender; other GitHub identities cannot request a deployment. The issue must be open (not a PR), and its exact title/body must be:

```text
Title: SayTwist production release <exact-current-main-SHA>

RELEASE_SHA=<exact-current-main-SHA>
RELEASE_TARGET=saytwist.com
```

A **new explicit approval comment** by the same owner must be exactly:

```text
APPROVE SAYTWIST PRODUCTION DEPLOY <exact-current-main-SHA>
```

The bridge checks issue/comment identities and message contents against the event's main SHA in `scripts/authorize-production-release.mjs`, re-reads the **current** `main` HEAD immediately before dispatch, then uses the job-limited `GITHUB_TOKEN` (only `contents:read` and `actions:write`) to run:

```bash
gh workflow run deploy-hostinger.yml --ref main -f expected_release_sha="<exact-current-main-SHA>"
```

GitHub explicitly allows `workflow_dispatch` emitted by a `GITHUB_TOKEN` workflow to start another workflow. The bridge does **not** hold Hostinger secrets, call SSH, run migrations, publish Pinterest content, enable Growth, or deploy anything itself. The existing production job remains the sole executor of a validated code release.

The assistant must obtain per-release user authorization (including the exact release scope) before posting the approval comment. Creating a draft issue is **not** approval. Do not create an approval for a commit with unreviewed migrations; separately prepare and approve any schema migration first. Audit trail: the owner-authored issue, approval comment, bridge run and guarded deploy run. Re-check `main` and the release SHA on each request. When an issue/comment check fails or the branch has moved, **do not** bypass the check.

Migration is a separate operator action using `scripts/hostinger-prepare-migration.sh`. The script is not called by either GitHub Actions workflow. It requires all of the following before it can run:

- the exact CI-built release artifact and its embedded `.release-sha`;
- the full reviewed merge SHA;
- exact typed approval `APPLY 20261016120000_growth_analytics_gap_recovery`;
- exactly that migration, and no other migration, pending in `_prisma_migrations`;
- healthy `/api/healthz` and `/api/readyz` responses from the currently deployed application;
- PostgreSQL 18 `pg_dump` and `pg_restore` at the verified absolute paths;
- a non-empty custom-format backup that passes `pg_restore --list`.

It takes the shared `.deploy-lock`, applies only the allow-listed migration, verifies Prisma status, and checks the old application again. It records the reviewed SHA, migration and backup path without recording credentials. It never restarts PM2, publishes application files, restores a database, or invokes `migrate reset`.

Production PostgreSQL is server version `18.6`. The default `pg_dump` is version `16.15` and is incompatible, so it must never be used. Before acquiring the deployment lock or creating a backup, the script requires executable PostgreSQL 18 binaries at `/usr/lib/postgresql/18/bin/pg_dump` and `/usr/lib/postgresql/18/bin/pg_restore`, parses both reported versions, and rejects every major version other than 18. There is no PATH fallback to PostgreSQL 16 or 17 tooling.

The migration preparation backup must be non-empty and readable before the manual migration. The later deployment takes and verifies a second backup, then requires `prisma migrate status` to be current. Connection errors, drift, failed migrations, or any remaining pending migration stop deployment before application files are replaced.

For this and future releases:

1. Confirm sufficient disk space for both a custom-format database backup and one previous application release before approval.
2. Record the current application SHA, PM2 process state, and database health in the release record.
3. Never use `prisma migrate reset` in production.
4. Apply this migration only through the separately invoked authenticated VPS preparation script after CI and explicit operator approval. Never copy the private database URL to Actions.
5. Keep the deployment script's zero-pending gate. Future migrations require their own reviewed allow-list and operator procedure; never broaden this release's allow-list.
6. Treat destructive SQL, table rewrites, required-column additions without safe defaults, and irreversible data transformations as separate reviewed maintenance work.

Prisma does not provide automatic down migrations. The preferred rollback is to leave this additive schema in place and roll back only application files; the preparation script proves the old application stays healthy before deployment. Keep Growth disabled and do not run recovery during the rollback observation window. If database restoration becomes unavoidable, stop the web process and all database-using workers, verify the recorded backup with PostgreSQL 18 `pg_restore --list`, restore it first into a separate private validation database, validate it, and obtain a second explicit operator approval before a controlled database swap. Never run `migrate reset`, `--clean` against the live database, or an improvised reverse migration.

## Verified production runtime and PM2 prerequisite

The 2026-10-13 VPS preflight established this production contract:

- application directory: `/home/saytwist/htdocs/saytwist.com`;
- Node/npm directory: `/home/saytwist/.nvm/versions/node/v24.20.0/bin` (Node `24.20.0`);
- existing web process: the single PM2 process named `saytwist`, registered as the approved npm binary with argument `start` and the application directory as `pm_cwd`;
- environment: `NODE_ENV=production`, `PORT=3001`, and `PM2_HOME=/home/saytwist/.pm2`;
- process manager: PM2 `7.0.4`, using the existing user-owned daemon (observed PID `270612` during preflight), with no SayTwist PM2 systemd unit;
- local probes: `http://127.0.0.1:3001/api/healthz` and `/api/readyz`. Port `3000` is not the SayTwist runtime and returned HTTP 404 during preflight.

PM2 was not available from the standard, global, or NVM CLI locations inspected during preflight. The existing PM2 7.0.4 CLI was verified at `/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2`; store that exact path in the GitHub production environment as `HOSTINGER_PM2_CLI`. Validate it on the VPS with the production user:

```bash
test -x /home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2
test -S /home/saytwist/.pm2/rpc.sock
test -S /home/saytwist/.pm2/pub.sock
PM2_HOME=/home/saytwist/.pm2 \
  /home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 --version
PM2_HOME=/home/saytwist/.pm2 \
  /home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 jlist
```

The version must be `7.0.4`, `jlist` must show exactly one `saytwist` process with the contract above, and the PID in `/home/saytwist/.pm2/pm2.pid` must remain unchanged. Do not use `npx`, install PM2, start another daemon, recreate the application process, or add a systemd service to satisfy this prerequisite.

At deployment time, the script checks the configured CLI is an executable absolute path, confirms the existing daemon PID and both sockets before invoking it, runs the CLI with the explicit production `PM2_HOME`, and confirms the daemon PID did not change. These checks occur before the database backup, Prisma commands, or replacement of application files.

## Recommended merge and deployment sequence

1. Review the final branch diff and QA record.
2. Merge the approved pull request into `main` without squashing away the release evidence unless repository policy requires it.
3. Wait for the standalone CI workflow and the push-triggered deploy workflow CI Gate to pass for the exact merge SHA; confirm the `Production Deploy` job was **skipped**, not executed. Do not manually dispatch deployment yet.
4. Verify the uploaded artifact is `hostinger-release-<merge-sha>`, its bundle-content check passed, and its embedded `.release-sha` equals the merge SHA.
5. Download that artifact on an operator workstation, copy the archive and reviewed `scripts/hostinger-prepare-migration.sh` to a SHA-specific private VPS staging directory, and extract the archive there. Do not extract it over the live application.

   ```bash
   release_sha=<full-reviewed-merge-sha>
   workflow_run_id=<successful-deploy-workflow-run-id>
   local_stage="$(mktemp -d)"
   gh run download "$workflow_run_id" \
     --name "hostinger-release-$release_sha" \
     --dir "$local_stage"
   ssh -p <ssh-port> saytwist@<host> \
     "mkdir -p -m 700 /home/saytwist/migration-staging/$release_sha"
   scp -P <ssh-port> \
     "$local_stage/release.tar.gz" \
     scripts/hostinger-prepare-migration.sh \
     "saytwist@<host>:/home/saytwist/migration-staging/$release_sha/"
   ssh -p <ssh-port> saytwist@<host> \
     "tar -xzf /home/saytwist/migration-staging/$release_sha/release.tar.gz -C /home/saytwist/migration-staging/$release_sha"
   ```
6. Record the current production SHA, PM2 application PID/restart count, PM2 daemon PID, health/readiness, disk space, migration state, Growth/attribution disabled state, and intentionally active workers.
7. On the VPS as `saytwist`, invoke the migration preparation explicitly:

   ```bash
   RELEASE_SHA=<full-reviewed-merge-sha>
   MIGRATION_ROOT=/home/saytwist/migration-staging/$RELEASE_SHA
   test -f "$MIGRATION_ROOT/.release-sha"
   test "$(tr -d '[:space:]' < "$MIGRATION_ROOT/.release-sha")" = "$RELEASE_SHA"

   HOSTINGER_APP_PATH=/home/saytwist/htdocs/saytwist.com \
   HOSTINGER_NODE_BIN=/home/saytwist/.nvm/versions/node/v24.20.0/bin/node \
   HOSTINGER_ENV_FILE=/home/saytwist/htdocs/saytwist.com/.env \
   HOSTINGER_MIGRATION_ROOT="$MIGRATION_ROOT" \
   HOSTINGER_RELEASE_SHA="$RELEASE_SHA" \
   HOSTINGER_MIGRATION_APPROVAL="APPLY 20261016120000_growth_analytics_gap_recovery" \
   bash "$MIGRATION_ROOT/hostinger-prepare-migration.sh"
   ```

8. Save the emitted `.deploy-backups/pre-migration-...record`, backup path, old-application health evidence, and current Prisma status in the release record. If the script fails, do not approve deployment. Investigate or use the documented database rollback process; do not rerun with a broader allow-list.
9. Only after migration preparation succeeds, manually trigger the `Deploy to Hostinger` workflow on `main`, supplying the exact approved merge SHA as `expected_release_sha`: `gh workflow run deploy-hostinger.yml --ref main -f expected_release_sha=<full-reviewed-merge-sha>`. Verify `main` still points to that SHA first. The manually dispatched workflow reruns CI/build, verifies the supplied SHA, and only then invokes the production deployment job. The GitHub production environment currently has no required-reviewer gate; the explicit manual dispatch and no-pending-migrations script check are the mandatory release gates.
10. The deployment script validates the archive SHA and staged layout, verifies the existing PM2 process and daemon, takes and verifies another PostgreSQL 18 backup, and requires migration status to be current. It never executes a migration.
11. The script preserves `public/generated` and does not touch `storage/`, `.env`, or non-web PM2 processes. It saves the previous runtime paths, publishes the staged release, and restarts only the existing `saytwist` npm-start process without `--update-env`.
12. Require an increased PM2 restart count, changed application PID, unchanged daemon PID, the verified runtime identity, and passing local health/readiness on port 3001. Restart/readiness failure restores the previous application paths.
13. Verify public health/readiness, robots, sitemap, representative canonical/noindex behavior, ads.txt, admin authentication, and generated assets. Confirm the approved 355 translator URLs remain present.
14. Keep Growth and attribution disabled. Run only non-publishing Pinterest/admin smoke checks. Do not queue analytics recovery during the application rollback observation window.

## Application rollback

1. Stop or pause the rollout if health, readiness, sitemap, authentication, asset, or worker checks fail. The deployment script automatically restores the immediately previous application paths when restart or local health validation fails.
2. Run `PM2_HOME=/home/saytwist/.pm2 /home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 describe saytwist`. Confirm it reports the production npm binary, `args: start`, application working directory, `PORT=3001`, and `NODE_ENV=production`. Restart only with `PM2_HOME=/home/saytwist/.pm2 /home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 restart saytwist`; do not use `--update-env`, delete/recreate the process, restart an editorial worker, or start a persistent Growth worker.
3. If manual application rollback is required, select `.deploy-releases/<failed-release>` or the last known-good SHA-addressed artifact, restore only the runtime paths listed in the deploy script, and restart `saytwist`.
4. Record that `20261016120000_growth_analytics_gap_recovery` was applied separately and which verified pre-migration backup belongs to it. Do not attempt to reverse it during ordinary application rollback; it is compatible with the prior application while recovery has not run.
5. Re-run local and public health/readiness checks, followed by the SEO, ads.txt, authentication, generated-asset, and non-publishing Pinterest smoke checks.
6. If database state is incompatible, keep the web application and database-using workers stopped. Apply a reviewed forward correction or restore the verified custom-format backup with the appropriate PostgreSQL restore procedure. Database restore is deliberately never automatic.

Rollback must not delete generated assets, publication evidence, indexing logs, editorial records, or Growth audit history. Never use a force reset or production seed as a rollback mechanism.
