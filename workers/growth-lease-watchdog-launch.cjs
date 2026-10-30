/* eslint-disable @typescript-eslint/no-require-imports -- Intentionally plain Node CommonJS bootstrap: no transpiler before credentials are scoped. */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const APP = "/home/saytwist/htdocs/saytwist.com";
const HOME = "/home/saytwist/.pm2";
const NODE_DIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODE_DIR + "/node";
const PM2_OPTIONS = [
  "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2",
  NODE_DIR + "/pm2",
];
const VALID_OUTPUT = new Set([
  "GROWTH_LEASE_CLEANUP=NO_EXPIRED_LEASE",
  "GROWTH_LEASE_CLEANUP=EXPIRED_REVOKED",
]);

function validatedDatabaseUrl(processList) {
  const rows = typeof processList === "string" ? JSON.parse(processList) : processList;
  if (!Array.isArray(rows)) throw new Error("PM2_LIST_INVALID");
  const matches = rows.filter(row => row && row.name === "saytwist");
  if (matches.length !== 1) throw new Error("PM2_PROCESS_MISMATCH");
  const entry = matches[0];
  const env = entry.pm2_env || {};
  if (env.status !== "online" || !(Number.isInteger(entry.pid) && entry.pid > 0) ||
      env.pm_cwd !== APP || env.pm_exec_path !== NODE_DIR + "/npm" ||
      env.NODE_ENV !== "production" || String(env.PORT || "") !== "3001") {
    throw new Error("PM2_PROCESS_UNTRUSTED");
  }
  const raw = env.DATABASE_URL || env.env?.DATABASE_URL;
  if (typeof raw !== "string" || raw.length > 8192) throw new Error("DATABASE_URL_MISSING");
  const u = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(u.protocol) ||
      u.hostname !== "127.0.0.1" || u.port !== "5433" ||
      decodeURIComponent(u.pathname.slice(1)) !== "saytwist" ||
      u.searchParams.has("host") || !u.username) {
    throw new Error("DATABASE_TARGET_UNTRUSTED");
  }
  return raw;
}

function run({ exec = spawnSync, read = fs.readFileSync, exists = fs.existsSync } = {}) {
  if (process.env.GROWTH_LEASE_CLEANUP_ENABLED !== "true") {
    process.stdout.write("GROWTH_LEASE_CLEANUP=DISABLED\n");
    return;
  }
  if (typeof process.getuid !== "function" || process.getuid() === 0 ||
      os.userInfo().username !== "saytwist" || process.cwd() !== APP ||
      process.env.NODE_ENV !== "production" || process.execPath !== NODE) {
    throw new Error("RUNTIME_IDENTITY_INVALID");
  }
  const expected = process.env.WATCHDOG_EXPECTED_RELEASE_SHA || "";
  if (!/^[a-f0-9]{40}$/.test(expected) ||
      read(path.join(APP, ".deployed-release"), "utf8").trim() !== expected) {
    throw new Error("RELEASE_MISMATCH");
  }
  const pm2 = PM2_OPTIONS.find(candidate => exists(candidate));
  if (!pm2) throw new Error("PM2_CLI_UNAVAILABLE");
  const listing = exec(pm2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env, PM2_HOME: HOME,
      PATH: NODE_DIR + ":/usr/local/bin:/usr/bin:/bin",
    },
  });
  if (listing.error || listing.status !== 0) throw new Error("PM2_READ_FAILED");
  const db = validatedDatabaseUrl(listing.stdout);
  const child = exec(NODE, ["node_modules/tsx/dist/cli.mjs", "workers/growth-lease-watchdog.ts"], {
    cwd: APP, encoding: "utf8", timeout: 40000, maxBuffer: 65536,
    env: {
      NODE_ENV: "production", PATH: NODE_DIR + ":/usr/local/bin:/usr/bin:/bin",
      HOME: "/home/saytwist", DATABASE_URL: db,
      GROWTH_LEASE_CLEANUP_ENABLED: "true",
    },
  });
  // Never relay tool stderr, PM2 JSON or exception messages to systemd logs.
  if (child.error || child.status !== 0 ||
      !VALID_OUTPUT.has((child.stdout || "").trim())) {
    throw new Error("WATCHDOG_CHILD_FAILED");
  }
  process.stdout.write(child.stdout.trim() + "\n");
}

if (require.main === module) {
  try { run(); }
  catch { process.stderr.write("GROWTH_LEASE_WATCHDOG_RUNNER=ERROR\n"); process.exitCode = 1; }
}

module.exports = { validatedDatabaseUrl, run };
