# Production release and rollback runbook

Updated: 2026-10-13

This runbook applies to the Hostinger production workflow. It does not authorize a merge or deployment by itself.

## Release gates

Before merging:

1. Confirm full ESLint, Vitest, TypeScript, and production build all pass on the release commit.
2. Confirm the focused SEO, Pinterest sharing/publishing, and Ezoic redirect tests pass.
3. Confirm the production SEO impact approval is attached to the release record. The approved 2026-10-13 report retained all 355 translator URLs, removed none from the sitemap, and changed no robots metadata.
4. Confirm strict human-review indexing enforcement is still disabled.
5. Confirm the Ezoic managed response contains the operator-approved AdSense seller authorization.
6. Confirm the GitHub `production` environment has required reviewers so a push to `main` cannot migrate or deploy without approval.
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

This feature branch introduces no Prisma migration relative to `origin/main`. `prisma migrate deploy` must therefore be a no-op for an up-to-date production database. Production PostgreSQL remains bound privately at `127.0.0.1:5433`; neither its port nor its credentials are exposed to a GitHub-hosted runner.

After production-environment approval, the authenticated SSH script performs these operations on the VPS, using `/home/saytwist/.nvm/versions/node/v24.20.0/bin/node` and the existing application `.env` (or the already-running PM2 process environment when that file is not present) without printing `DATABASE_URL`:

```bash
# Internally, the script parses DATABASE_URL into PGHOST/PGPORT/PGUSER/
# PGPASSWORD/PGDATABASE and passes them only through the pg_dump environment.
/usr/lib/postgresql/18/bin/pg_dump \
  --format=custom \
  --file "$APP_PATH/.deploy-backups/saytwist-<release>.dump"
/usr/lib/postgresql/18/bin/pg_restore \
  --list "$APP_PATH/.deploy-backups/saytwist-<release>.dump" >/dev/null

cd "$STAGING_DIR"
/home/saytwist/.nvm/versions/node/v24.20.0/bin/node \
  --env-file="$APP_PATH/.env" \
  node_modules/prisma/build/index.js migrate status
/home/saytwist/.nvm/versions/node/v24.20.0/bin/node \
  --env-file="$APP_PATH/.env" \
  node_modules/prisma/build/index.js migrate deploy
/home/saytwist/.nvm/versions/node/v24.20.0/bin/node \
  --env-file="$APP_PATH/.env" \
  node_modules/prisma/build/index.js migrate status
```

Production PostgreSQL is server version `18.6`. The default `pg_dump` is version `16.15` and is incompatible, so it must never be used. Before acquiring the deployment lock or creating a backup, the script requires executable PostgreSQL 18 binaries at `/usr/lib/postgresql/18/bin/pg_dump` and `/usr/lib/postgresql/18/bin/pg_restore`, parses both reported versions, and rejects every major version other than 18. There is no PATH fallback to PostgreSQL 16 or 17 tooling.

The first status command must report that the schema is already current. Any connection error, failed migration, drift, or pending migration stops this release before application files are replaced. The backup must be non-empty and readable by the PostgreSQL 18 `pg_restore --list` before `migrate deploy` is invoked.

For this and future releases:

1. Confirm sufficient disk space for both a custom-format database backup and one previous application release before approval.
2. Record the current application SHA, PM2 process state, and database health in the release record.
3. Never use `prisma migrate reset` in production.
4. Apply migrations only through the authenticated VPS script, after validation/build and production-environment approval. Never copy the private database URL to Actions.
5. A future release with intended pending migrations must replace this release's explicit zero-pending gate with an exact reviewed migration allow-list; an unexpected migration must always stop deployment.
6. Treat destructive SQL, table rewrites, required-column additions without safe defaults, and irreversible data transformations as separate reviewed maintenance work.

Prisma does not provide automatic down migrations. If a future migration causes a production problem, stop incompatible application and worker processes, then either apply a reviewed forward corrective migration or restore the verified pre-deployment database backup. Do not improvise a reverse migration against live data.

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
3. Wait for the standalone CI workflow and the deploy workflow's CI Gate to pass for the exact merge SHA.
4. Verify the uploaded artifact is named for that SHA and that its bundle-content check passed.
5. Record the current production application SHA, health status on port 3001, PM2 `saytwist` PID and restart count, PM2 daemon PID, migration state, disk space, and intentionally active worker configuration. Confirm the configured `HOSTINGER_PM2_CLI` passes the prerequisite above.
6. Approve the GitHub `production` environment. The workflow then uploads the already-validated artifact and invokes the authenticated VPS script.
7. The VPS script validates the archive and staged layout, connects to the existing PM2 daemon, and verifies the single `saytwist` process still runs `/home/saytwist/.nvm/versions/node/v24.20.0/bin/npm start` from `/home/saytwist/htdocs/saytwist.com` with `NODE_ENV=production` and `PORT=3001`. It then takes and verifies the PostgreSQL backup, confirms migration status is already current, and runs the expected no-op `migrate deploy`.
8. The script preserves `public/generated` and does not touch `storage/`, `.env`, or non-web PM2 processes. It moves the current runtime paths into `.deploy-releases/<release>`, publishes all staged paths, and asks the existing daemon to restart only `saytwist`. It deliberately omits `--update-env`, so the registered npm command, runtime paths, port, and environment are preserved.
9. The script requires an increased PM2 restart count, a changed application PID, the unchanged daemon PID, the complete runtime identity above, and successful local `/api/healthz` and `/api/readyz` responses on validated port 3001. A restart or readiness failure restores the previous application paths and restarts the same registered process; it cannot report success while the old application PID remains active.
10. Verify public `/api/healthz`, `/api/readyz`, `/robots.txt`, `/sitemap.xml`, representative translator canonicals/robots metadata, `/ads.txt`, admin authentication, and generated asset routes.
11. Confirm the sitemap still contains the approved 355 translator URLs and no sitemap URL emits `noindex`.
12. Run a non-publishing Pinterest configuration/admin smoke check. Do not create a Pin merely to validate deployment.

## Application rollback

1. Stop or pause the rollout if health, readiness, sitemap, authentication, asset, or worker checks fail. The deployment script automatically restores the immediately previous application paths when restart or local health validation fails.
2. Run `PM2_HOME=/home/saytwist/.pm2 /home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 describe saytwist`. Confirm it reports the production npm binary, `args: start`, application working directory, `PORT=3001`, and `NODE_ENV=production`. Restart only with `PM2_HOME=/home/saytwist/.pm2 /home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2 restart saytwist`; do not use `--update-env`, delete/recreate the process, restart an editorial worker, or start a persistent Growth worker.
3. If manual application rollback is required, select `.deploy-releases/<failed-release>` or the last known-good SHA-addressed artifact, restore only the runtime paths listed in the deploy script, and restart `saytwist`.
4. Record whether a migration was applied. For this release, none is expected because the pre-migration status gate refuses pending migrations.
5. Re-run local and public health/readiness checks, followed by the SEO, ads.txt, authentication, generated-asset, and non-publishing Pinterest smoke checks.
6. If database state is incompatible, keep the web application and database-using workers stopped. Apply a reviewed forward correction or restore the verified custom-format backup with the appropriate PostgreSQL restore procedure. Database restore is deliberately never automatic.

Rollback must not delete generated assets, publication evidence, indexing logs, editorial records, or Growth audit history. Never use a force reset or production seed as a rollback mechanism.
