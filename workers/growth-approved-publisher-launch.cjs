/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const { loadPinterestRuntimeEnv } = require("./growth-one-account-sync-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const APPROVAL_PREFIX = "SAYTWIST_APPROVED_PUBLISHER_SCHEDULED:";
const ALLOWED = new Set([
  "GROWTH_APPROVED_PUBLISHER=IDLE",
  "GROWTH_APPROVED_PUBLISHER=QUOTA_PAUSED",
  "GROWTH_APPROVED_PUBLISHER=PUBLISHED",
  "GROWTH_APPROVED_PUBLISHER=RECONCILIATION_PENDING",
]);

function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_APPROVED_PUBLISHER_LAUNCH !== "true" ||
      !fs.existsSync(APP + "/workers/growth-approved-publisher.ts") ||
      !fs.existsSync(APP + "/node_modules/tsx/dist/cli.mjs") ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) {
    throw Error("APPROVED_PUBLISHER_HOST_INVALID");
  }
  const system = args => spawnSync("/usr/bin/systemctl", args, {
    encoding: "utf8", timeout: 5000, maxBuffer: 4096,
  });
  for (const timer of [
    "saytwist-growth-lease-watchdog.timer",
    "saytwist-growth-daily-observe.timer",
    "saytwist-growth-autonomous-cycle.timer",
  ]) {
    if (system(["is-active", "--quiet", timer]).status !== 0) {
      throw Error("APPROVED_PUBLISHER_TIMER_MISSING");
    }
  }
  if (system(["show", "-P", "Result", "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success" ||
      !system(["show", "-P", "Environment", "saytwist-growth-lease-watchdog.service"]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha) ||
      system(["is-active", "--quiet", "saytwist-growth-autonomous-cycle.service"]).status === 0 ||
      system(["is-active", "--quiet", "saytwist-growth-daily-observe.service"]).status === 0) {
    throw Error("APPROVED_PUBLISHER_WATCHDOG_OR_CYCLE_UNSAFE");
  }

  const listing = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10_000, maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env, PM2_HOME: "/home/saytwist/.pm2",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
    },
  });
  if (listing.status !== 0 || listing.error) throw Error("PM2_UNAVAILABLE");
  const apps = JSON.parse(listing.stdout);
  const db = validatedDatabaseUrl(apps);
  const web = apps.find(app => app.name === "saytwist").pm2_env;
  const read = name => web[name] ?? web.env?.[name];
  for (const flag of [
    "GROWTH_WORKER_RUN_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (read(flag) === "true") throw Error("UNEXPECTED_WEB_AUTOMATION");
  if (["OBSERVE", "RECOMMEND"].includes(read("GROWTH_ROLLOUT_MODE"))) {
    throw Error("WEB_ROLLOUT_NOT_OFF");
  }
  const childEnv = {
    NODE_ENV: "production", HOME: "/home/saytwist",
    PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
    DATABASE_URL: db, EXPECTED_RELEASE: sha,
    GROWTH_APPROVED_PUBLISHER_ENABLED: "true",
    GROWTH_APPROVED_PUBLISHER_APPROVAL: APPROVAL_PREFIX + sha,
    GROWTH_APPROVED_PUBLISHER_ENTRYPOINT: "true",
    GROWTH_WORKER_RUN_ENABLED: "false",
    GROWTH_ROLLOUT_MODE: "OFF",
    GROWTH_AI_IMAGE_ENABLED: "false",
    GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
    GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
    TELEGRAM_REPORTS_ENABLED: "false",
    APP_BASE_URL: "https://saytwist.com",
  };
  Object.assign(childEnv, loadPinterestRuntimeEnv(APP));
  const child = spawnSync(NODE, [
    "node_modules/tsx/dist/cli.mjs",
    "workers/growth-approved-publisher.ts",
  ], {
    cwd: APP, encoding: "utf8", timeout: 225_000,
    maxBuffer: 4096, env: childEnv,
  });
  const lines = (child.stdout || "").trim().split("\n");
  if (child.error || child.status !== 0 || lines.length !== 3 ||
      !ALLOWED.has(lines[0]) ||
      lines[1] !== "GROWTH_APPROVED_PUBLISHER_GROWTH=OFF" ||
      lines[2] !== "GROWTH_APPROVED_PUBLISHER_AI_CALLS=0") {
    throw Error("APPROVED_PUBLISHER_CHILD_BLOCKED");
  }
  process.stdout.write(lines.join("\n") + "\n");
}

if (require.main === module) {
  try { run(); }
  catch {
    // Production service receives only this fixed code. No stdout/stderr,
    // PM2 environment, credentials, provider messages, or job IDs escape.
    process.stderr.write("GROWTH_APPROVED_PUBLISHER_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
