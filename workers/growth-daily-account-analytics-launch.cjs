/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
// One-account official Pinterest analytics GETs, bounded by shared provider
// quota and an exact per-day job; never performs a Pin write.
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const { loadPinterestRuntimeEnv } = require("./growth-one-account-sync-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const EXPECTED = [
  "GROWTH_DAILY_ACCOUNT_ANALYTICS=SUCCEEDED",
  "GROWTH_DAILY_ACCOUNT_ANALYTICS_GROWTH=OFF",
  "GROWTH_DAILY_ACCOUNT_ANALYTICS_PINS_PUBLISHED=0",
  "GROWTH_DAILY_ACCOUNT_ANALYTICS_AI_CALLS=0",
];
function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_DAILY_ACCOUNT_ANALYTICS_LAUNCH !== "true" ||
      !(now.getUTCHours() === 4 && now.getUTCMinutes() >= 20 &&
        now.getUTCMinutes() < 35) ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      !fs.existsSync(APP + "/workers/growth-daily-account-analytics.ts") ||
      !fs.existsSync(APP + "/node_modules/tsx/dist/cli.mjs") ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) {
    throw Error("DAILY_ANALYTICS_HOST_INVALID");
  }
  const system = args => spawnSync("/usr/bin/systemctl", args, {
    encoding: "utf8", timeout: 5000, maxBuffer: 4096,
  });
  for (const timer of [
    "saytwist-growth-lease-watchdog.timer",
    "saytwist-growth-daily-observe.timer",
    "saytwist-growth-autonomous-cycle.timer",
    "saytwist-growth-approved-publisher.timer",
  ]) {
    if (system(["is-active", "--quiet", timer]).status !== 0)
      throw Error("DAILY_ANALYTICS_DEPENDENCY_TIMER_INVALID");
  }
  if (system(["show", "-P", "Result",
      "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success" ||
      !system(["show", "-P", "Environment",
        "saytwist-growth-lease-watchdog.service"]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha) ||
      !system(["show", "-P", "Environment",
        "saytwist-growth-approved-publisher.service"]).stdout.includes(
        "EXPECTED_RELEASE=" + sha) ||
      system(["is-active", "--quiet", "saytwist-growth-approved-publisher.service"]).status === 0 ||
      system(["is-active", "--quiet", "saytwist-growth-autonomous-cycle.service"]).status === 0 ||
      system(["is-active", "--quiet", "saytwist-growth-daily-observe.service"]).status === 0) {
    throw Error("DAILY_ANALYTICS_DEPENDENCIES_BUSY");
  }
  const list = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10_000, maxBuffer: 16 * 1024 * 1024,
    env: { PM2_HOME: "/home/saytwist/.pm2", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (list.status !== 0 || list.error) throw Error("DAILY_ANALYTICS_PM2_UNAVAILABLE");
  const rows = JSON.parse(list.stdout);
  const db = validatedDatabaseUrl(rows);
  const app = rows.find(x => x.name === "saytwist").pm2_env;
  const read = key => app[key] ?? app.env?.[key];
  for (const flag of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (read(flag) === "true") throw Error("DAILY_ANALYTICS_UNEXPECTED_WEB_AUTOMATION");
  if (["OBSERVE", "RECOMMEND", "PREPARE", "ANALYTICS"].includes(read("GROWTH_ROLLOUT_MODE"))) {
    throw Error("DAILY_ANALYTICS_UNEXPECTED_WEB_ROLLOUT");
  }
  const childEnv = {
    NODE_ENV: "production", HOME: "/home/saytwist",
    PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
    DATABASE_URL: db, EXPECTED_RELEASE: sha,
    APP_BASE_URL: "https://saytwist.com",
    GROWTH_DAILY_ACCOUNT_ANALYTICS_ENTRYPOINT: "true",
    GROWTH_DAILY_ANALYTICS_ENABLED: "true",
    GROWTH_DAILY_ANALYTICS_APPROVAL: "SAYTWIST_DAILY_ACCOUNT_ANALYTICS:" + sha,
    GROWTH_DAILY_ANALYTICS_DAY: now.toISOString().slice(0, 10),
    GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
    GROWTH_AI_IMAGE_ENABLED: "false",
    GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
    TELEGRAM_REPORTS_ENABLED: "false",
    GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
  };
  // Only the exact official Pinterest API credentials enter the scoped child,
  // never PM2's full environment, Telegram, OpenAI or web secrets.
  Object.assign(childEnv, loadPinterestRuntimeEnv(APP));
  const child = spawnSync(NODE, [
    "node_modules/tsx/dist/cli.mjs",
    "workers/growth-daily-account-analytics.ts",
  ], {
    cwd: APP, encoding: "utf8", timeout: 225_000,
    maxBuffer: 4096, env: childEnv,
  });
  if (child.error || child.status !== 0 ||
      (child.stdout || "").trim() !== EXPECTED.join("\n")) {
    throw Error("DAILY_ANALYTICS_CHILD_BLOCKED");
  }
  process.stdout.write(EXPECTED.join("\n") + "\n");
}

if (require.main === module) {
  try { run(); }
  catch {
    // Never print child logs, provider messages or secret-bearing URLs.
    process.stderr.write("GROWTH_DAILY_ACCOUNT_ANALYTICS_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
