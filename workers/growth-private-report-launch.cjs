/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
// Exact-SHA, private, opt-in daily report launcher. Never runs a generic worker.
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";

function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_PRIVATE_REPORT_LAUNCH !== "true" ||
      process.env.GROWTH_PRIVATE_REPORT_APPROVAL !== "SAYTWIST_PRIVATE_DAILY_REPORT:" + sha ||
      process.env.TELEGRAM_REPORTS_ENABLED !== "true" ||
      process.env.GROWTH_DAILY_REPORT_SCHEDULE_ENABLED !== "true" ||
      now.getUTCHours() !== 5 || now.getUTCMinutes() >= 20 ||
      !fs.existsSync(APP + "/workers/growth-report-runner.ts") ||
      !fs.existsSync(APP + "/node_modules/tsx/dist/cli.mjs") ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) throw Error("REPORT_HOST_INVALID");
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chat = process.env.TELEGRAM_REPORT_CHAT_ID || "";
  if (!/^[1-9][0-9]{5,14}:[A-Za-z0-9_-]{30,}$/.test(token) ||
      !/^[1-9][0-9]{4,15}$/.test(chat)) throw Error("REPORT_PRIVATE_CREDENTIALS_INVALID");
  const ps = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    env: { PM2_HOME: "/home/saytwist/.pm2", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (ps.error || ps.status !== 0) throw Error("REPORT_PM2_UNAVAILABLE");
  const apps = JSON.parse(ps.stdout);
  const db = validatedDatabaseUrl(apps);
  const app = apps.find(x => x.name === "saytwist").pm2_env;
  const read = key => app[key] ?? app.env?.[key];
  for (const key of ["GROWTH_WORKER_RUN_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED"]) {
    if (read(key) === "true") throw Error("REPORT_WEB_AUTOMATION_NOT_ISOLATED");
  }
  const child = spawnSync(NODE, ["node_modules/tsx/dist/cli.mjs", "workers/growth-report-runner.ts"], {
    cwd: APP, encoding: "utf8", timeout: 120_000, maxBuffer: 4096,
    env: {
      NODE_ENV: "production", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
      DATABASE_URL: db, APP_BASE_URL: "https://saytwist.com",
      GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "true",
      TELEGRAM_REPORTS_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: token,
      TELEGRAM_REPORT_CHAT_ID: chat,
      GROWTH_TELEGRAM_PIN_APPROVALS_ENABLED: process.env.GROWTH_TELEGRAM_PIN_APPROVALS_ENABLED === "true" ? "true" : "false",
      GROWTH_TELEGRAM_PIN_OWNER_USER_ID: process.env.GROWTH_TELEGRAM_PIN_OWNER_USER_ID || "",
      GROWTH_TELEGRAM_PIN_WEBHOOK_SECRET: process.env.GROWTH_TELEGRAM_PIN_WEBHOOK_SECRET || "",
      GROWTH_WORKER_RUN_ENABLED: "false",
      GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
      GROWTH_ROLLOUT_MODE: "OFF",
    },
  });
  // Never print child output: errors can include provider text or IDs.
  if (child.error || child.status !== 0) throw Error("REPORT_CHILD_FAILED");
  if (!/^\[growth-report\] (SUBMITTED|ALREADY_SENT)\n?$/.test(child.stdout || "")) {
    throw Error("REPORT_UNEXPECTED_RESULT");
  }
  process.stdout.write("GROWTH_PRIVATE_REPORT=ACCEPTED_OR_PREVIOUSLY_SENT\n");
}
if (require.main === module) {
  try { run(); } catch {
    process.stderr.write("GROWTH_PRIVATE_REPORT=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
