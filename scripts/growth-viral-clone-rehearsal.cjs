#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

// Source-only rehearsal of exactly TWO new Prisma migrations against the
// operator-restored 2026-11-09 clone. Never execute as root or use production
// as a Prisma target. No timers, web processes, or provider APIs are touched.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const APP = "/home/saytwist/htdocs/saytwist.com";
const STAGING = "/home/saytwist/.local/share/saytwist/viral-clone-source/";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const PRISMA = APP + "/node_modules/prisma/build/index.js";
const PSQL = "/usr/lib/postgresql/18/bin/psql";
const ROOT = path.resolve(__dirname, "..");
const PROD = "saytwist";
const CLONE = "saytwist_growth_viral_rehearsal_20261109";
const OLD_RELEASE = "a73ed6a4d4a5d3244fe5735bd7f027aa8a6d81ff";
const PENDING = [
  "20261109180000_growth_viral_intelligence_foundation",
  "20261109190000_growth_viral_pin_approval",
];

function check(value) { if (!value) throw Error("VIRAL_CLONE_REHEARSAL_BLOCKED"); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function validateSource() {
  check(process.getuid?.() !== 0 && os.userInfo().username === "saytwist");
  const sha = process.env.GROWTH_VIRAL_CLONE_RELEASE_SHA || "";
  check(/^[a-f0-9]{40}$/.test(sha) && ROOT === STAGING + sha);
  check(fs.readFileSync(path.join(ROOT, ".release-sha"), "utf8").trim() === sha);
  check(fs.readFileSync(APP + "/.deployed-release", "utf8").trim() === OLD_RELEASE);
  for (const x of [NODE, PM2, PRISMA, PSQL]) check(fs.existsSync(x));
  const migrationRoot = path.join(ROOT, "prisma", "migrations");
  const names = fs.readdirSync(migrationRoot, { withFileTypes: true })
    .filter(x => x.isDirectory()).map(x => x.name).sort();
  check(names.length === 35 && same(names.slice(33), PENDING));
  for (const name of names) check(/^\d{14}_[a-z0-9_]+$/.test(name) &&
    fs.statSync(path.join(migrationRoot, name, "migration.sql")).isFile());
  return names;
}

function productionConnection() {
  const list = JSON.parse(execFileSync(PM2, ["jlist"], {
    encoding: "utf8", timeout: 15000, maxBuffer: 16 * 1024 * 1024,
    env: { PM2_HOME: "/home/saytwist/.pm2", HOME: "/home/saytwist",
      PATH: "/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/local/bin:/usr/bin:/bin" },
  }));
  const app = list.find(x => x.name === "saytwist" && x.pm2_env?.status === "online");
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
    Boolean(url.username) && Boolean(url.password) &&
    !url.searchParams.has("host"));
  return url;
}
function query(url, target, sql) {
  check([PROD, CLONE].includes(target));
  const env = { PGHOST: "127.0.0.1", PGPORT: "5433",
    PGDATABASE: target, PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: "5",
    PATH: "/usr/lib/postgresql/18/bin:/usr/bin:/bin" };
  const run = spawnSync(PSQL, ["-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1",
    "-d", target, "-c", sql], {
    env, encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024,
  });
  check(run.status === 0 && !run.error);
  return run.stdout.trim();
}
function history(url, target) {
  check(query(url, target, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL') === "0");
  return query(url, target, 'SELECT migration_name || \'|\' || checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')
    .split("\n").filter(Boolean).map(x => x.split("|"));
}
function safeOff(url, target) {
  check(query(url, target, 'SELECT (NOT "enabled" AND NOT "attributionEnabled" AND "workerActivationExpiresAt" IS NULL)::int FROM "GrowthSettings" WHERE id=\'global\'') === "1");
  check(query(url, target, 'SELECT count(*) FROM "GrowthJob" WHERE status IN (\'PENDING\',\'CLAIMED\',\'RUNNING\',\'FAILED_RETRYABLE\')') === "0");
}
function noViralTables(url, target) {
  check(query(url, target, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('GrowthViralProgramSettings','GrowthViralConcept','GrowthViralPinTest','GrowthViralMetricObservation','GrowthViralNicheProposal')") === "0");
}

function run() {
  const names = validateSource();
  const url = productionConnection();
  const prod = history(url, PROD);
  const clone = history(url, CLONE);
  check(prod.length === 33 && clone.length === 33 && same(prod, clone));
  for (let i = 0; i < 33; i += 1) {
    check(prod[i][0] === names[i]);
    check(prod[i][1] === sha256(fs.readFileSync(path.join(ROOT, "prisma/migrations", names[i], "migration.sql"))));
  }
  check(query(url, CLONE,
    "SELECT (pg_get_userbyid(datdba)=current_user)::int FROM pg_database WHERE datname=current_database()") === "1");
  safeOff(url, PROD); safeOff(url, CLONE);
  noViralTables(url, PROD); noViralTables(url, CLONE);
  const cloneJobCount = query(url, CLONE, 'SELECT count(*) FROM "GrowthJob"');
  const clonePinCount = query(url, CLONE, 'SELECT count(*) FROM "GrowthPinterestPin"');
  console.log("VIRAL_CLONE_BASELINE_VERIFIED=true");

  const cloneUrl = new URL(url.toString());
  cloneUrl.pathname = "/" + CLONE;
  const env = { ...process.env, DATABASE_URL: cloneUrl.toString(),
    PATH: "/home/saytwist/.nvm/versions/node/v24.20.0/bin:" + (process.env.PATH || "") };
  delete env.DIRECT_URL;
  delete env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK;
  const cmd = spawnSync(NODE, [PRISMA, "migrate", "deploy",
    "--schema", path.join(ROOT, "prisma/schema.prisma")], {
    cwd: ROOT, env, encoding: "utf8", timeout: 180000, maxBuffer: 1024 * 1024,
  });
  check(cmd.status === 0 && !cmd.error);
  const after = history(url, CLONE);
  check(after.length === 35 && same(after.slice(0,33), clone));
  for (let i = 0; i < 2; i += 1) {
    const name = PENDING[i];
    check(after[33 + i][0] === name &&
      after[33 + i][1] === sha256(fs.readFileSync(path.join(ROOT,"prisma/migrations",name,"migration.sql"))));
  }
  check(query(url, CLONE, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('GrowthViralProgramSettings','GrowthViralConcept','GrowthViralPinTest','GrowthViralMetricObservation','GrowthViralNicheProposal')") === "5");
  check(query(url, CLONE, "SELECT (mode='PAUSED' AND \"sourceSharePercent\"=50 AND \"maxPinsPerDay\"=3)::int FROM \"GrowthViralProgramSettings\" WHERE id='global'") === "1");
  check(query(url, CLONE, "SELECT count(*) FROM pg_constraint WHERE conname='GrowthViralPinTest_channel_destination_check'") === "1");
  check(query(url, CLONE, "SELECT count(*) FROM pg_trigger WHERE tgname IN ('growth_viral_pin_immutable_destination','growth_viral_metric_no_update_delete') AND NOT tgisinternal") === "2");
  check(query(url, CLONE, 'SELECT count(*) FROM "GrowthJob"') === cloneJobCount);
  check(query(url, CLONE, 'SELECT count(*) FROM "GrowthPinterestPin"') === clonePinCount);
  safeOff(url, CLONE);
  check(same(history(url, PROD), prod));
  safeOff(url, PROD); noViralTables(url, PROD);
  check(fs.readFileSync(APP + "/.deployed-release", "utf8").trim() === OLD_RELEASE);
  console.log("VIRAL_CLONE_TWO_MIGRATIONS_APPLIED=true");
  console.log("VIRAL_CLONE_EXISTING_ROWS_PRESERVED=true");
  console.log("VIRAL_CLONE_PRODUCTION_UNCHANGED=true");
  console.log("VIRAL_CLONE_PROGRAM_PAUSED=true");
}
try { run(); } catch {
  console.error("VIRAL_CLONE_REHEARSAL_BLOCKED");
  process.exitCode = 1;
}
