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

The deploy workflow must finish lint, typecheck, tests, build, production-dependency pruning, Prisma-engine checks, and bundle validation before the production-environment job can start.

## Artifact contract

The SHA-addressed `hostinger-release-<commit>` artifact is retained for 14 days and contains:

- the complete `.next` build and `public` assets;
- the Prisma schema, migrations, generated client, and both Hostinger-compatible query engines;
- production `node_modules`, including the `tsx` runtime;
- `lib/`, `workers/`, and `tsconfig.json` for the existing editorial worker and bounded Growth worker commands;
- `ecosystem.config.cjs`, `server.js`, Next configuration, and package manifests.

The workflow verifies those paths after creating the archive. The Hostinger script repeats critical staging checks before replacing runtime paths. It preserves `public/generated`; the separate `storage/` tree is not included or replaced by the release archive.

The Growth worker remains bounded and explicitly invoked. This release does not add a recurring Growth process, enable Growth, change attribution gates, or relax Pinterest approval/publishing restrictions.

## Migration safety

This feature branch introduces no Prisma migration relative to `origin/main`. `prisma migrate deploy` should therefore be a no-op for an up-to-date production database.

For this and future releases:

1. Take and verify a restorable PostgreSQL backup before approving the production environment.
2. Record `prisma migrate status` and the current application SHA in the release record.
3. Never use `prisma migrate reset` in production.
4. Apply migrations only through `prisma migrate deploy`, after validation and build have passed and after production-environment approval.
5. Treat destructive SQL, table rewrites, required-column additions without safe defaults, and irreversible data transformations as separate reviewed maintenance work.

Prisma does not provide automatic down migrations. If a future migration causes a production problem, stop incompatible application and worker processes, then either apply a reviewed forward corrective migration or restore the verified pre-deployment database backup. Do not improvise a reverse migration against live data.

## Recommended merge and deployment sequence

1. Review the final branch diff and QA record.
2. Merge the approved pull request into `main` without squashing away the release evidence unless repository policy requires it.
3. Wait for the standalone CI workflow and the deploy workflow's CI Gate to pass for the exact merge SHA.
4. Verify the uploaded artifact is named for that SHA and that its bundle-content check passed.
5. Take the production database backup and record the current production application SHA, health status, migration state, and currently active worker configuration.
6. Approve the GitHub `production` environment. Only then may the workflow run `prisma migrate deploy` and upload the application archive.
7. Restart the web process through the existing Hostinger mechanism. Restart the editorial worker only if it is already intentionally managed in production. Do not add or start a persistent Growth worker.
8. Verify `/api/healthz`, `/api/readyz`, `/robots.txt`, `/sitemap.xml`, representative translator canonicals/robots metadata, `/ads.txt`, admin authentication, and generated asset routes.
9. Confirm the sitemap still contains the approved 355 translator URLs and no sitemap URL emits `noindex`.
10. Run a non-publishing Pinterest configuration/admin smoke check. Do not create a Pin merely to validate deployment.

## Application rollback

1. Stop or pause the rollout if health, readiness, sitemap, authentication, asset, or worker checks fail.
2. Select the last known-good SHA-addressed artifact from GitHub Actions.
3. Record whether any migration was applied. For this release, none is expected because there are no new migration files.
4. Redeploy the last known-good application artifact through the same reviewed production environment and restart the previously active processes.
5. Re-run all post-deployment smoke checks.
6. If database state is incompatible, keep application and workers stopped and use the migration-safety procedure above: reviewed forward correction or verified backup restore.

Rollback must not delete generated assets, publication evidence, indexing logs, editorial records, or Growth audit history. Never use a force reset or production seed as a rollback mechanism.
