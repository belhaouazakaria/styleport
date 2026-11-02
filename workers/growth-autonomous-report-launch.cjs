/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { loadEnvConfig } = require("@next/env");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const TOKEN = /^[1-9][0-9]{5,14}:[A-Za-z0-9_-]{30,}$/;
const PRIVATE_ID = /^[1-9][0-9]{4,15}$/;

function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_AUTONOMOUS_REPORT_LAUNCH !== "true" ||
      now.getUTCHours() !== 5 || now.getUTCMinutes() < 30 ||
      now.getUTCMinutes() >= 50 ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) throw Error("RUNTIME_INVALID");
  const sys = args => spawnSync("/usr/bin/systemctl", args,
    { encoding: "utf8", timeout: 5000, maxBuffer: 4096 });
  if (sys(["is-active", "--quiet", "saytwist-growth-lease-watchdog.timer"]).status !== 0 ||
      sys(["show", "-P", "Result", "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success" ||
      !sys(["show", "-P", "Environment", "saytwist-growth-lease-watchdog.service"]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha) ||
      sys(["is-active", "--quiet", "saytwist-growth-autonomous-cycle.timer"]).status !== 0 ||
      sys(["show", "-P", "Result", "saytwist-growth-autonomous-cycle.service"]).stdout.trim() !== "success") {
    throw Error("DEPENDENCY_UNHEALTHY");
  }
  const processList = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PM2_HOME: "/home/saytwist/.pm2",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (processList.status !== 0 || processList.error) throw Error("PM2_UNAVAILABLE");
  const rows = JSON.parse(processList.stdout);
  const db = validatedDatabaseUrl(rows);
  const app = rows.find(row => row.name === "saytwist").pm2_env;
  const value = key => app[key] ?? app.env?.[key];
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (value(flag) === "true") throw Error("UNEXPECTED_AUTOMATION");
  }
  if (["OBSERVE", "RECOMMEND"].includes(value("GROWTH_ROLLOUT_MODE"))) {
    throw Error("ROLLOUT_NOT_OFF");
  }
  loadEnvConfig(APP, false);
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID || "";
  if (!TOKEN.test(botToken) || !PRIVATE_ID.test(chatId)) {
    throw Error("PRIVATE_TELEGRAM_NOT_CONFIGURED");
  }
  if (!fs.existsSync("workers/growth-report-runner.ts") ||
      !fs.existsSync("node_modules/tsx/dist/cli.mjs")) throw Error("RELEASE_INVALID");
  const child = spawnSync(NODE,
    ["node_modules/tsx/dist/cli.mjs", "workers/growth-report-runner.ts"], {
      cwd: APP, encoding: "utf8", timeout: 110_000, maxBuffer: 2048,
      env: {
        NODE_ENV: "production", HOME: "/home/saytwist",
        PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin", DATABASE_URL: db,
        GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "true", TELEGRAM_REPORTS_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_REPORT_CHAT_ID: chatId,
      },
    });
  const result = (child.stdout || "").trim();
  if (child.error || child.status !== 0 ||
      !["[growth-report] SUBMITTED", "[growth-report] ALREADY_SENT"].includes(result)) {
    // Child logs may contain internal report details. Never print them.
    throw Error("REPORT_DELIVERY_FAILED_OR_UNKNOWN");
  }
  process.stdout.write("GROWTH_AUTONOMOUS_REPORT=" +
    (result.endsWith("SUBMITTED") ? "SUBMITTED" : "ALREADY_SENT") + "\n");
}
if (require.main === module) {
  try { run(); } catch {
    process.stderr.write("GROWTH_AUTONOMOUS_REPORT=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
