#!/usr/bin/env node
"use strict";

/*
 * Only run from a verified, temporary, out-of-webroot archive of the reviewed
 * Phase 13 branch. Requires production credentials from existing PM2 but
 * explicitly changes the database name to the isolated rehearsal clone.
 * Never prints PM2 process configuration, database URLs or provider secrets.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const NODE_DIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const APP_ROOT = "/home/saytwist/htdocs/saytwist.com";
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_ROOT = path.join(ROOT, "prisma/migrations");
const CLONE = "saytwist_phase13_rehearsal_20261025";
const PRODUCTION = "saytwist";
const HOST = "127.0.0.1";
const PORT = "5433";
const LATEST_BASELINE = "20261016120000_growth_analytics_gap_recovery";
const PENDING = [
  "20261018120000_growth_economics_limits",
  "20261024190000_growth_telegram_delivery_default",
  "20261024210000_growth_ai_usage_evidence",
  "20261025150000_growth_daily_report_append_only",
];
const PG = "/usr/lib/postgresql/18/bin";
const PRISMA = path.join(APP_ROOT, "node_modules/prisma/build/index.js");
const SAFE_ERRORS = new Set([
  "UNSAFE_EXECUTION_USER", "SOURCE_BUNDLE_OUTSIDE_PRIVATE_DIRECTORY",
  "MISSING_SOURCE_BUNDLE", "UNEXPECTED_SOURCE_MIGRATIONS",
  "PM2_NOT_FOUND", "PM2_RUNTIME_NOT_FOUND", "UNEXPECTED_PRODUCTION_TARGET",
  "PRODUCTION_BASELINE_CHANGED", "REHEARSAL_CLONE_NOT_OWNED",
  "REHEARSAL_NOT_AT_BASELINE", "MIGRATION_CHECKSUM_MISMATCH",
  "DATABASE_QUERY_FAILED", "CLONE_MIGRATION_FAILED",
  "MIGRATION_RESULT_INVALID", "CLONE_SCHEMA_VERIFICATION_FAILED",
  "ARCHIVE_GUARD_TEST_FAILED",
]);
const fail = code => { throw new Error(code); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function verifyBundle() {
  if (process.getuid && process.getuid() === 0) fail("UNSAFE_EXECUTION_USER");
  if (!ROOT.startsWith("/home/saytwist/.local/share/saytwist/phase13-rehearsal/")) {
    fail("SOURCE_BUNDLE_OUTSIDE_PRIVATE_DIRECTORY");
  }
  if (!fs.existsSync(path.join(ROOT, "prisma/schema.prisma")) ||
      !fs.existsSync(PRISMA) || !fs.existsSync(MIGRATIONS_ROOT)) {
    fail("MISSING_SOURCE_BUNDLE");
  }
  const names = fs.readdirSync(MIGRATIONS_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name).sort();
  if (names.length !== 31 || !eq(names.slice(-4), PENDING)) {
    fail("UNEXPECTED_SOURCE_MIGRATIONS");
  }
  for (const name of names) {
    if (!/^[0-9]{14}_[a-z0-9_]+$/.test(name) ||
        !fs.statSync(path.join(MIGRATIONS_ROOT, name, "migration.sql")).isFile()) {
      fail("MISSING_SOURCE_BUNDLE");
    }
  }
  return names;
}

function getLiveDatabaseUrl() {
  const candidates = [
    "/home/saytwist/.npm-global/bin/pm2",
    "/home/saytwist/.local/bin/pm2",
    NODE_DIR + "/pm2",
  ];
  const pm2 = candidates.find(fs.existsSync);
  if (!pm2) fail("PM2_NOT_FOUND");
  const processes = JSON.parse(execFileSync(pm2, ["jlist"], {
    encoding: "utf8",
    timeout: 12000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PM2_HOME: "/home/saytwist/.pm2",
      PATH: NODE_DIR + ":/usr/local/bin:/usr/bin:/bin" },
  }));
  const app = processes.find(p => p.name === "saytwist");
  const raw = app?.pm2_env?.DATABASE_URL ?? app?.pm2_env?.env?.DATABASE_URL;
  if (!raw) fail("PM2_RUNTIME_NOT_FOUND");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== HOST || url.port !== PORT ||
      decodeURIComponent(url.pathname.slice(1)) !== PRODUCTION ||
      !url.username || !url.password || url.searchParams.has("host")) {
    fail("UNEXPECTED_PRODUCTION_TARGET");
  }
  return url;
}

function pgEnvironment(url, dbName) {
  const env = {
    ...process.env,
    PGHOST: HOST, PGPORT: PORT,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: dbName, PGCONNECT_TIMEOUT: "5",
  };
  delete env.DATABASE_URL;
  delete env.PGOPTIONS;
  return env;
}

function query(url, database, sql) {
  if (![PRODUCTION, CLONE].includes(database)) fail("DATABASE_QUERY_FAILED");
  const run = spawnSync(PG + "/psql", [
    "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", sql,
  ], { env: pgEnvironment(url, database), encoding: "utf8",
       timeout: 20000, maxBuffer: 1024 * 1024 });
  if (run.error || run.status !== 0) fail("DATABASE_QUERY_FAILED");
  return run.stdout.trim();
}

function readHistory(url, db) {
  const out = query(url, db, 'SELECT "migration_name" || \'|\' || "checksum" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL ORDER BY "migration_name"');
  const unfinished = query(url, db, 'SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL');
  if (unfinished !== "0") fail(db === PRODUCTION ? "PRODUCTION_BASELINE_CHANGED" : "REHEARSAL_NOT_AT_BASELINE");
  const rows = out ? out.split("\n").map(s => s.split("|")) : [];
  if (rows.some(x => x.length !== 2)) fail("MIGRATION_RESULT_INVALID");
  return rows;
}

function assertBaseline(rows, sourceNames, problem) {
  if (rows.length !== 27 || rows[26][0] !== LATEST_BASELINE ||
      !eq(rows.map(r => r[0]), sourceNames.slice(0, 27))) fail(problem);
  for (const [name, expectedChecksum] of rows) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_ROOT, name, "migration.sql"));
    const sha = crypto.createHash("sha256").update(sql).digest("hex");
    if (sha !== expectedChecksum) fail("MIGRATION_CHECKSUM_MISMATCH");
  }
}

function verifyCloneSafety(url) {
  const result = query(url, CLONE,
    "SELECT (pg_get_userbyid(datdba) = current_user)::int FROM pg_database WHERE datname = current_database()");
  if (result !== "1") fail("REHEARSAL_CLONE_NOT_OWNED");
}

function deployToClone(url) {
  const cloneUrl = new URL(url.toString());
  cloneUrl.pathname = "/" + CLONE;
  if (cloneUrl.hostname !== HOST || cloneUrl.port !== PORT ||
      decodeURIComponent(cloneUrl.pathname.slice(1)) !== CLONE) {
    fail("UNEXPECTED_PRODUCTION_TARGET");
  }
  const childEnv = { ...process.env, DATABASE_URL: cloneUrl.toString(),
    PATH: NODE_DIR + ":" + (process.env.PATH || "") };
  delete childEnv.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK;
  delete childEnv.DIRECT_URL;
  const result = spawnSync(NODE_DIR + "/node", [
    PRISMA, "migrate", "deploy", "--schema", path.join(ROOT, "prisma/schema.prisma"),
  ], { cwd: ROOT, env: childEnv, encoding: "utf8",
       timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
  // Suppress raw provider/CLI outputs: a failure can contain connection metadata.
  if (result.error || result.status !== 0) fail("CLONE_MIGRATION_FAILED");
  console.log("CLONE_MIGRATION_COMMAND_SUCCEEDED: true");
}

function verifySchema(url) {
  const tables = ["GrowthAiBudgetReservation", "GrowthAiUsageEvent",
    "GrowthDailyReport", "GrowthReportDelivery"];
  const present = query(url, CLONE, "SELECT " + tables.map(t =>
    "((to_regclass('public.\""+t+"\"') IS NOT NULL)::int)").join(" + "));
  if (present !== "4") fail("CLONE_SCHEMA_VERIFICATION_FAILED");
  const cols = query(url, CLONE, "SELECT count(*) FROM information_schema.columns " +
    "WHERE table_schema='public' AND table_name='GrowthSettings' AND column_name IN " +
    "('aiDailyBudgetCents','aiMonthlyBudgetCents','aiImagesPerDayCap'," +
    "'translatorCreatesPerDayCap','translatorUpdatesPerDayCap','ideaCreatesPerWeekCap')");
  if (cols !== "6") fail("CLONE_SCHEMA_VERIFICATION_FAILED");
  const triggers = query(url, CLONE, "SELECT count(*) FROM pg_trigger " +
    "WHERE tgname IN ('GrowthAiUsageEvent_append_only','GrowthDailyReport_append_only') " +
    "AND tgenabled='O' AND NOT tgisinternal");
  if (triggers !== "2") fail("CLONE_SCHEMA_VERIFICATION_FAILED");
  const deliveryDefault = query(url, CLONE, "SELECT column_default FROM information_schema.columns " +
    "WHERE table_schema='public' AND table_name='GrowthReportDelivery' AND column_name='channel'");
  if (!deliveryDefault.includes("TELEGRAM")) fail("CLONE_SCHEMA_VERIFICATION_FAILED");
  const disabled = query(url, CLONE, 'SELECT (NOT "enabled" AND NOT "attributionEnabled")::int ' +
    'FROM "GrowthSettings" WHERE id = \'global\'');
  if (disabled !== "1") fail("CLONE_SCHEMA_VERIFICATION_FAILED");
}

function verifyAppendOnlyRuntime(url) {
  const sql = String.raw[
    "BEGIN;",
    "INSERT INTO \"GrowthDailyReport\" (\"id\",\"reportDate\",\"version\",\"snapshot\",\"digestText\")",
    "VALUES ('phase13_rehearsal_probe',DATE '1900-01-01','probe','{}'::jsonb,'probe');",
    "INSERT INTO \"GrowthAiBudgetReservation\"",
    "(\"id\",\"requestKey\",\"kind\",\"provider\",\"model\",\"pricingVersion\",\"reservedCents\")",
    "VALUES ('phase13_rehearsal_budget','phase13_rehearsal_budget','TEXT','probe','probe','probe',1);",
    "INSERT INTO \"GrowthAiUsageEvent\" (\"id\",\"reservationId\",\"outcome\")",
    "VALUES ('phase13_rehearsal_usage','phase13_rehearsal_budget','RESPONSE_RECEIVED');",
    "DO $probe$",
    "DECLARE errmsg text;",
    "BEGIN",
    "  BEGIN",
    "    UPDATE \"GrowthDailyReport\" SET \"digestText\"='changed' WHERE id='phase13_rehearsal_probe';",
    "  EXCEPTION WHEN OTHERS THEN",
    "    GET STACKED DIAGNOSTICS errmsg = MESSAGE_TEXT;",
    "  END;",
    "  IF errmsg IS DISTINCT FROM 'GrowthDailyReport archive is immutable' THEN",
    "    RAISE EXCEPTION 'DAILY_REPORT_GUARD_NOT_ENFORCED';",
    "  END IF;",
    "  errmsg := NULL;",
    "  BEGIN",
    "    UPDATE \"GrowthAiUsageEvent\" SET \"outcome\"='RESPONSE_RECEIVED' WHERE id='phase13_rehearsal_usage';",
    "  EXCEPTION WHEN OTHERS THEN",
    "    GET STACKED DIAGNOSTICS errmsg = MESSAGE_TEXT;",
    "  END;",
    "  IF errmsg IS DISTINCT FROM 'GrowthAiUsageEvent evidence is immutable' THEN",
    "    RAISE EXCEPTION 'USAGE_EVIDENCE_GUARD_NOT_ENFORCED';",
    "  END IF;",
    "END $probe$;",
    "ROLLBACK;",
  ].join("\n");
  query(url, CLONE, sql);
  // Extra confirmation transaction probes did not persist anything.
  const n = query(url, CLONE,
    "SELECT count(*) FROM \"GrowthDailyReport\" WHERE id='phase13_rehearsal_probe'");
  if (n !== "0") fail("ARCHIVE_GUARD_TEST_FAILED");
}

function main() {
  const sourceNames = verifyBundle();
  const url = getLiveDatabaseUrl();
  verifyCloneSafety(url);
  const prodBefore = readHistory(url, PRODUCTION);
  const cloneBefore = readHistory(url, CLONE);
  assertBaseline(prodBefore, sourceNames, "PRODUCTION_BASELINE_CHANGED");
  assertBaseline(cloneBefore, sourceNames, "REHEARSAL_NOT_AT_BASELINE");
  if (!eq(prodBefore, cloneBefore)) fail("REHEARSAL_NOT_AT_BASELINE");
  console.log("CLONE_BASELINE_MATCHED_PRODUCTION: true");
  console.log("PENDING_MIGRATIONS_APPROVED:", PENDING.length);
  deployToClone(url);
  const after = readHistory(url, CLONE);
  if (after.length !== 31 || !eq(after.map(r=>r[0]), sourceNames)) {
    fail("MIGRATION_RESULT_INVALID");
  }
  verifySchema(url);
  verifyAppendOnlyRuntime(url);
  if (!eq(readHistory(url, PRODUCTION), prodBefore)) {
    fail("PRODUCTION_BASELINE_CHANGED");
  }
  console.log("CLONE_MIGRATIONS_APPLIED:", PENDING.length);
  console.log("CLONE_SCHEMA_AND_IMMUTABILITY_VERIFIED: true");
  console.log("PRODUCTION_MIGRATION_HISTORY_UNCHANGED: true");
  console.log("PRODUCTION_DATABASE_MIGRATED: false");
}

try {
  main();
} catch (error) {
  console.error(SAFE_ERRORS.has(error.message)
    ? error.message : "PHASE13_CLONE_REHEARSAL_FAILED");
  process.exitCode = 1;
}
