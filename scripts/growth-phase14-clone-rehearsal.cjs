#!/usr/bin/env node
"use strict";

/*
 * Exact-SHA source-only rehearsal against the already-restored production clone.
 * Reads production migration history and PM2 DB identity; makes DDL changes to
 * the specific clone ONLY. Fail closed before any Prisma CLI invocation.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const PRISMA = APP + "/node_modules/prisma/build/index.js";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const BASE = "/home/saytwist/.local/share/saytwist/phase14-rehearsal/";
const ROOT = path.resolve(__dirname, "..");
const PROD = "saytwist";
const CLONE = "saytwist_phase14_rehearsal_20261030";
const MIGRATION = "20261029220000_growth_worker_activation_expiry";
const PSQL = "/usr/lib/postgresql/18/bin/psql";

function fail() { throw new Error("PHASE14_CLONE_REHEARSAL_BLOCKED"); }
function check(condition) { if (!condition) fail(); }
function same(a,b) { return JSON.stringify(a) === JSON.stringify(b); }

function source() {
  check(typeof process.getuid === "function" && process.getuid() !== 0);
  const sha = process.env.GROWTH_PHASE14_RELEASE_SHA || "";
  check(/^[a-f0-9]{40}$/.test(sha) && ROOT === BASE + sha);
  check(fs.readFileSync(path.join(ROOT, ".release-sha"), "utf8").trim() === sha);
  check(fs.existsSync(PRISMA) && fs.existsSync(NODE) && fs.existsSync(PSQL));
  const root = path.join(ROOT, "prisma/migrations");
  const names = fs.readdirSync(root, { withFileTypes: true })
    .filter(x => x.isDirectory()).map(x => x.name).sort();
  check(names.length === 32 && names[31] === MIGRATION);
  for (const name of names) check(/^\d{14}_[a-z0-9_]+$/.test(name) &&
    fs.statSync(path.join(root, name, "migration.sql")).isFile());
  return names;
}

function connection() {
  check(fs.existsSync(PM2));
  const apps = JSON.parse(execFileSync(PM2, ["jlist"], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 12000,
    env: { ...process.env, PM2_HOME: "/home/saytwist/.pm2",
      PATH: "/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/local/bin:/usr/bin:/bin" },
  }));
  const app = apps.find(x => x.name === "saytwist" && x.pm2_env?.status === "online");
  check(Boolean(app));
  const state = app.pm2_env;
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED"]) {
    check((state[flag] ?? state.env?.[flag]) !== "true");
  }
  const raw = state.DATABASE_URL ?? state.env?.DATABASE_URL;
  check(typeof raw === "string");
  const url = new URL(raw);
  check(["postgres:", "postgresql:"].includes(url.protocol) &&
    url.hostname === "127.0.0.1" && url.port === "5433" &&
    decodeURIComponent(url.pathname.slice(1)) === PROD &&
    Boolean(url.username) && Boolean(url.password) && !url.searchParams.has("host"));
  return url;
}

function query(url, target, sql) {
  check([PROD, CLONE].includes(target));
  const env = { ...process.env,
    PGHOST: "127.0.0.1", PGPORT: "5433", PGDATABASE: target,
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "5" };
  delete env.DATABASE_URL;
  delete env.PGOPTIONS;
  const run = spawnSync(PSQL, ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1",
    "-d", target, "-c", sql], { env, encoding: "utf8", timeout: 15000,
      maxBuffer: 1024 * 1024 });
  if (run.status !== 0 || run.error) fail();
  return run.stdout.trim();
}

function history(url, target) {
  check(query(url, target, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL') === "0");
  const result = query(url, target, 'SELECT migration_name || \'|\' || checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');
  return result.split("\n").filter(Boolean).map(x => x.split("|"));
}

function main() {
  const names = source();
  const url = connection();
  const beforeProd = history(url, PROD);
  const beforeClone = history(url, CLONE);
  check(beforeProd.length === 31 && beforeClone.length === 31 && same(beforeProd, beforeClone));
  for (let i = 0; i < 31; i += 1) {
    check(beforeProd[i][0] === names[i]);
    const sql = fs.readFileSync(path.join(ROOT, "prisma/migrations", names[i], "migration.sql"));
    check(crypto.createHash("sha256").update(sql).digest("hex") === beforeProd[i][1]);
  }
  check(query(url, CLONE,
    "SELECT (pg_get_userbyid(datdba)=current_user)::int FROM pg_database WHERE datname=current_database()") === "1");
  for (const db of [PROD, CLONE]) {
    check(query(url, db,
      'SELECT (NOT "enabled" AND NOT "attributionEnabled")::int FROM "GrowthSettings" WHERE id=\'global\'') === "1");
    check(query(url, db, 'SELECT count(*) FROM "GrowthJob" WHERE status IN (\'PENDING\', \'CLAIMED\', \'RUNNING\', \'FAILED_RETRYABLE\')') === "0");
    check(query(url, db, "SELECT count(*) FROM information_schema.columns WHERE table_name='GrowthSettings' AND column_name='workerActivationExpiresAt'") === "0");
  }
  console.log("PHASE14_CLONE_BASELINE_VERIFIED=true");
  const cloneUrl = new URL(url.toString());
  cloneUrl.pathname = "/" + CLONE;
  const env = { ...process.env, DATABASE_URL: cloneUrl.toString(),
    PATH: "/home/saytwist/.nvm/versions/node/v24.20.0/bin:" + (process.env.PATH || "") };
  delete env.DIRECT_URL;
  delete env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK;
  const run = spawnSync(NODE, [PRISMA, "migrate", "deploy",
    "--schema", path.join(ROOT, "prisma/schema.prisma")], {
    cwd: ROOT, env, encoding: "utf8", timeout: 180000, maxBuffer: 1024 * 1024,
  });
  if (run.status !== 0 || run.error) fail();
  const afterClone = history(url, CLONE);
  check(afterClone.length === 32 && afterClone[31][0] === MIGRATION &&
    same(afterClone.slice(0,31), beforeClone));
  check(query(url, CLONE, "SELECT count(*) FROM information_schema.columns WHERE table_name='GrowthSettings' AND column_name='workerActivationExpiresAt' AND is_nullable='YES'") === "1");
  check(query(url, CLONE,
    'SELECT (NOT "enabled" AND "workerActivationExpiresAt" IS NULL)::int FROM "GrowthSettings" WHERE id=\'global\'') === "1");
  check(same(history(url, PROD), beforeProd));
  check(query(url, PROD, "SELECT count(*) FROM information_schema.columns WHERE table_name='GrowthSettings' AND column_name='workerActivationExpiresAt'") === "0");
  console.log("PHASE14_CLONE_PRISMA_MIGRATION_APPLIED=true");
  console.log("PHASE14_CLONE_SETTINGS_PRESERVED=true");
  console.log("PHASE14_PRODUCTION_HISTORY_UNCHANGED=true");
  console.log("PHASE14_GROWTH_REMAINS_OFF=true");
}

try { main(); }
catch { console.error("PHASE14_CLONE_REHEARSAL_BLOCKED"); process.exitCode = 1; }
