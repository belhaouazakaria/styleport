"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */
// One budgeted Pinterest analytics GET per approved maintenance tick.
// No Pin writes, generative AI, generic worker scan or queue fan-out.
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const { loadPinterestRuntimeEnv } = require("./growth-one-account-sync-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const HOURS = [10, 12, 14, 16, 18, 20, 22];
const NAMES = [
  "lease-watchdog", "daily-observe", "autonomous-cycle", "approved-publisher",
  "daily-fresh", "private-report", "autonomous-content",
  "daily-account-analytics", "auto-translator-publish",
  "viral-discovery", "viral-source",
];
function system(args) {
  return spawnSync("/usr/bin/systemctl", args, {
    encoding: "utf8", timeout: 5000, maxBuffer: 4096,
  });
}
function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_PIN_MAINTENANCE_LAUNCH !== "true" ||
      process.env.GROWTH_PIN_MAINTENANCE_ENABLED !== "true" ||
      process.env.GROWTH_PIN_MAINTENANCE_OWNER_APPROVAL !==
        "SAYTWIST_PIN_MAINTENANCE:" + sha ||
      !HOURS.includes(now.getUTCHours()) || now.getUTCMinutes() < 45 ||
      now.getUTCMinutes() >= 55 ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      !fs.existsSync(APP + "/workers/growth-pin-maintenance.ts") ||
      !fs.existsSync(APP + "/node_modules/tsx/dist/cli.mjs") ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) {
    throw Error("PIN_MAINTENANCE_HOST_INVALID");
  }
  for (const name of NAMES) {
    const unit = "saytwist-growth-" + name;
    if (system(["is-active", "--quiet", unit + ".timer"]).status !== 0 ||
        system(["is-enabled", "--quiet", unit + ".timer"]).status !== 0) {
      throw Error("PIN_MAINTENANCE_TIMERS_INVALID");
    }
    if (name !== "lease-watchdog" &&
        system(["is-active", "--quiet", unit + ".service"]).status === 0) {
      throw Error("PIN_MAINTENANCE_DEPENDENCY_BUSY");
    }
    const key = name === "lease-watchdog" ? "WATCHDOG_EXPECTED_RELEASE_SHA=" : "EXPECTED_RELEASE=";
    if (!system(["show", "-P", "Environment", unit + ".service"])
      .stdout.includes(key + sha)) throw Error("PIN_MAINTENANCE_RELEASE_MISMATCH");
  }
  if (system(["show", "-P", "Result",
      "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success") {
    throw Error("PIN_MAINTENANCE_WATCHDOG_UNHEALTHY");
  }
  const proc = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    env: { PM2_HOME: "/home/saytwist/.pm2", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (proc.status !== 0 || proc.error) throw Error("PIN_MAINTENANCE_PM2_UNAVAILABLE");
  const rows = JSON.parse(proc.stdout);
  const db = validatedDatabaseUrl(rows);
  const pm = rows.find(x => x.name === "saytwist")?.pm2_env;
  if (!pm) throw Error("PIN_MAINTENANCE_WEB_MISSING");
  const read = key => pm[key] ?? pm.env?.[key];
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED", "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (read(flag) === "true") throw Error("PIN_MAINTENANCE_WEB_AUTOMATION_ACTIVE");
  }
  if (["OBSERVE", "RECOMMEND", "PREPARE", "ANALYTICS"].includes(read("GROWTH_ROLLOUT_MODE"))) {
    throw Error("PIN_MAINTENANCE_WEB_ROLLOUT_ACTIVE");
  }
  const env = {
    NODE_ENV: "production", HOME: "/home/saytwist",
    PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
    DATABASE_URL: db, EXPECTED_RELEASE: sha,
    APP_BASE_URL: "https://saytwist.com",
    GROWTH_PIN_MAINTENANCE_ENTRYPOINT: "true",
    GROWTH_PIN_MAINTENANCE_ENABLED: "true",
    GROWTH_PIN_MAINTENANCE_APPROVAL: "SAYTWIST_PIN_MAINTENANCE:" + sha,
    GROWTH_PIN_MAINTENANCE_DAY: now.toISOString().slice(0, 10),
    GROWTH_PIN_MAINTENANCE_SCOPE: "false",
    GROWTH_WORKER_RUN_ENABLED: "false",
    GROWTH_ROLLOUT_MODE: "OFF",
    GROWTH_DAILY_ANALYTICS_SCOPE: "false",
    GROWTH_AI_IMAGE_ENABLED: "false",
    GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
    TELEGRAM_REPORTS_ENABLED: "false",
    GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
  };
  Object.assign(env, loadPinterestRuntimeEnv(APP));
  const child = spawnSync(NODE,
    ["node_modules/tsx/dist/cli.mjs", "workers/growth-pin-maintenance.ts"], {
      cwd: APP, env, encoding: "utf8", timeout: 180000, maxBuffer: 4096,
    });
  const output = (child.stdout || "").trim();
  const lines = output.split("\n");
  const matches = /^(?:GROWTH_PIN_MAINTENANCE=(INVENTORY_SUCCEEDED|PIN_SUCCEEDED|SKIPPED_BUSY|SKIPPED_NO_PINS|SKIPPED_BUDGET|ALREADY_ATTEMPTED)\nGROWTH_PIN_MAINTENANCE_GROWTH=OFF\nGROWTH_PIN_MAINTENANCE_PROVIDER_GET_MAX=(0|1)\nGROWTH_PIN_MAINTENANCE_PROVIDER_WRITES=0\nGROWTH_PIN_MAINTENANCE_AI_CALLS=0)$/.exec(output);
  const successful = matches &&
    (matches[1].endsWith("_SUCCEEDED") ? matches[2] === "1" : matches[2] === "0");
  if (child.status !== 0 || child.error || lines.length !== 5 || !successful) {
    throw Error("PIN_MAINTENANCE_CHILD_BLOCKED");
  }
  process.stdout.write(output + "\n");
}
if (require.main === module) {
  try { run(); }
  catch {
    // Never log secrets, provider bodies or PM2 environmental snapshots.
    process.stderr.write("GROWTH_PIN_MAINTENANCE_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
