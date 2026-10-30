/**
 * Phase 14C migration qualification on disposable local PostgreSQL 18.
 * Replays the previous migration history, inserts an existing OFF settings
 * row, and verifies the additive migration and idempotent second apply.
 */
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const migrationName = "20261029220000_growth_worker_activation_expiry";
const databaseName = "saytwist_growth_phase2_test";

function requireDisposableDatabase() {
  const raw = process.env.GROWTH_TEST_DATABASE_URL;
  if (process.env.RUN_GROWTH_MIGRATION_QUALIFICATION !== "1" ||
      !raw || process.env.DATABASE_URL !== raw) throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.port !== "5432" || decodeURIComponent(url.pathname.slice(1)) !== databaseName ||
      url.searchParams.has("host")) throw new Error("DISPOSABLE_DATABASE_REQUIRED");
}

function prismaDeploy(schemaPath) {
  const command = spawnSync(process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", schemaPath],
    { cwd: resolve("."), env: process.env, encoding: "utf8", timeout: 120_000 });
  if (command.status !== 0) throw new Error("MIGRATION_DEPLOY_FAILED");
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

requireDisposableDatabase();
const tempRoot = mkdtempSync(join(tmpdir(), "saytwist-expiry-migration-"));
const client = new PrismaClient();

try {
  const oldSchema = join(tempRoot, "prisma", "schema.prisma");
  const oldMigrations = join(tempRoot, "prisma", "migrations");
  mkdirSync(oldMigrations, { recursive: true });
  cpSync("prisma/schema.prisma", oldSchema);
  for (const entry of readdirSync("prisma/migrations", { withFileTypes: true })) {
    if (entry.name === migrationName) continue;
    cpSync(join("prisma/migrations", entry.name), join(oldMigrations, entry.name), { recursive: true });
  }
  assert(existsSync(join("prisma/migrations", migrationName, "migration.sql")), "MIGRATION_MISSING");

  prismaDeploy(oldSchema);
  const columnBefore = await client.$queryRawUnsafe(
    "SELECT COUNT(*)::int AS count FROM information_schema.columns " +
    "WHERE table_schema = 'public' AND table_name = 'GrowthSettings' " +
    "AND column_name = 'workerActivationExpiresAt'");
  assert(columnBefore[0]?.count === 0, "LEGACY_COLUMN_ALREADY_PRESENT");
  await client.$executeRawUnsafe(
    "INSERT INTO \"GrowthSettings\" (\"id\", \"enabled\", \"workerBatchSize\", \"updatedAt\") " +
    "VALUES ('global', FALSE, 5, CURRENT_TIMESTAMP)");
  const before = await client.$queryRawUnsafe(
    "SELECT \"id\", \"enabled\", \"workerBatchSize\" FROM \"GrowthSettings\" WHERE \"id\" = 'global'");
  assert(before.length === 1 && before[0].enabled === false, "LEGACY_ROW_UNEXPECTED");

  prismaDeploy("prisma/schema.prisma");
  prismaDeploy("prisma/schema.prisma");
  const after = await client.$queryRawUnsafe(
    "SELECT \"id\", \"enabled\", \"workerBatchSize\", \"workerActivationExpiresAt\" " +
    "FROM \"GrowthSettings\" WHERE \"id\" = 'global'");
  assert(after.length === 1 && after[0].id === before[0].id &&
    after[0].enabled === before[0].enabled &&
    after[0].workerBatchSize === before[0].workerBatchSize &&
    after[0].workerActivationExpiresAt === null, "ROW_NOT_PRESERVED");
  const applied = await client.$queryRawUnsafe(
    "SELECT COUNT(*)::int AS count FROM \"_prisma_migrations\" " +
    "WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
    migrationName);
  assert(applied[0]?.count === 1, "MIGRATION_NOT_APPLIED_EXACTLY_ONCE");
  console.log("GROWTH_EXPIRY_MIGRATION_QUALIFIED=LEGACY_ROW_PRESERVED_NULL_DEFAULT_IDEMPOTENT");
} catch {
  console.error("GROWTH_EXPIRY_MIGRATION_QUALIFICATION_FAILED");
  process.exitCode = 1;
} finally {
  await client.$disconnect();
  rmSync(tempRoot, { recursive: true, force: true });
}
