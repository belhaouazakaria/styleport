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
pg_dump --format=custom --file "$APP_PATH/.deploy-backups/saytwist-<release>.dump"
pg_restore --list "$APP_PATH/.deploy-backups/saytwist-<release>.dump" >/dev/null

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

The first status command must report that the schema is already current. Any connection error, failed migration, drift, or pending migration stops this release before application files are replaced. The backup must be non-empty and readable by `pg_restore --list` before `migrate deploy` is invoked.

For this and future releases:

1. Confirm sufficient disk space for both a custom-format database backup and one previous application release before approval.
2. Record the current application SHA, PM2 process state, and database health in the release record.
3. Never use `prisma migrate reset` in production.
4. Apply migrations only through the authenticated VPS script, after validation/build and production-environment approval. Never copy the private database URL to Actions.
5. A future release with intended pending migrations must replace this release's explicit zero-pending gate with an exact reviewed migration allow-list; an unexpected migration must always stop deployment.
6. Treat destructive SQL, table rewrites, required-column additions without safe defaults, and irreversible data transformations as separate reviewed maintenance work.

Prisma does not provide automatic down migrations. If a future migration causes a production problem, stop incompatible application and worker processes, then either apply a reviewed forward corrective migration or restore the verified pre-deployment database backup. Do not improvise a reverse migration against live data.

## Recommended merge and deployment sequence

1. Review the final branch diff and QA record.
2. Merge the approved pull request into `main` without squashing away the release evidence unless repository policy requires it.
3. Wait for the standalone CI workflow and the deploy workflow's CI Gate to pass for the exact merge SHA.
4. Verify the uploaded artifact is named for that SHA and that its bundle-content check passed.
5. Record the current production application SHA, health status, PM2 `saytwist` PID, migration state, disk space, and intentionally active worker configuration.
6. Approve the GitHub `production` environment. The workflow then uploads the already-validated artifact and invokes the authenticated VPS script.
7. The VPS script validates the archive and staged layout, verifies the existing PM2 `saytwist` process points to `<app-path>/server.js`, takes and verifies the PostgreSQL backup, confirms migration status is already current, and runs the expected no-op `migrate deploy`.
8. The script preserves `public/generated` and does not touch `storage/`, `.env`, or non-web PM2 processes. It moves the current runtime paths into `.deploy-releases/<release>`, publishes all staged paths, and runs `pm2 restart saytwist --update-env`.
9. The script requires a new PM2 PID plus successful local `/api/healthz` and `/api/readyz` responses. A restart or readiness failure restores the previous application paths and restarts `saytwist`; it cannot report success while the old PID remains active.
10. Verify public `/api/healthz`, `/api/readyz`, `/robots.txt`, `/sitemap.xml`, representative translator canonicals/robots metadata, `/ads.txt`, admin authentication, and generated asset routes.
11. Confirm the sitemap still contains the approved 355 translator URLs and no sitemap URL emits `noindex`.
12. Run a non-publishing Pinterest configuration/admin smoke check. Do not create a Pin merely to validate deployment.

## Application rollback

1. Stop or pause the rollout if health, readiness, sitemap, authentication, asset, or worker checks fail. The deployment script automatically restores the immediately previous application paths when restart or local health validation fails.
2. Confirm `pm2 describe saytwist` reports the expected `<app-path>/server.js`, then run `pm2 restart saytwist --update-env`. Do not restart, delete, or recreate an editorial worker; never start a persistent Growth worker.
3. If manual application rollback is required, select `.deploy-releases/<failed-release>` or the last known-good SHA-addressed artifact, restore only the runtime paths listed in the deploy script, and restart `saytwist`.
4. Record whether a migration was applied. For this release, none is expected because the pre-migration status gate refuses pending migrations.
5. Re-run local and public health/readiness checks, followed by the SEO, ads.txt, authentication, generated-asset, and non-publishing Pinterest smoke checks.
6. If database state is incompatible, keep the web application and database-using workers stopped. Apply a reviewed forward correction or restore the verified custom-format backup with the appropriate PostgreSQL restore procedure. Database restore is deliberately never automatic.

Rollback must not delete generated assets, publication evidence, indexing logs, editorial records, or Growth audit history. Never use a force reset or production seed as a rollback mechanism.
