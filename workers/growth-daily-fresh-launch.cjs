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
const ALLOWED = new Set([
  "GROWTH_DAILY_FRESH=PASSED",
  "GROWTH_DAILY_FRESH=PAUSED",
  "GROWTH_DAILY_FRESH=SATISFIED",
  "GROWTH_DAILY_FRESH=NO_QUALIFIED_TARGET",
]);

function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  const trial = process.env.GROWTH_DAILY_FRESH_MODE === "TRIAL";
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_DAILY_FRESH_LAUNCH !== "true" ||
      (trial
        ? process.env.GROWTH_DAILY_FRESH_TRIAL_APPROVAL !== "RUN SAYTWIST DAILY FRESH TRIAL " + sha
        : (process.env.GROWTH_DAILY_FRESH_MODE &&
           process.env.GROWTH_DAILY_FRESH_MODE !== "SCHEDULED") ||
          !(now.getUTCHours() === 7 && now.getUTCMinutes() >= 2 && now.getUTCMinutes() < 15)) ||
      !fs.existsSync(APP + "/workers/growth-daily-fresh-creatives.ts") ||
      !fs.existsSync(APP + "/node_modules/tsx/dist/cli.mjs") ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP ||
      os.userInfo().username !== "saytwist" || process.getuid?.() === 0 ||
      process.execPath !== NODE) throw Error("FRESH_HOST_INVALID");
  const system = args => spawnSync("/usr/bin/systemctl", args, {
    encoding: "utf8", timeout: 5000, maxBuffer: 4096,
  });
  for (const timer of [
    "saytwist-growth-lease-watchdog.timer",
    "saytwist-growth-daily-observe.timer",
    "saytwist-growth-autonomous-cycle.timer",
    "saytwist-growth-approved-publisher.timer",
  ]) {
    if (system(["is-active", "--quiet", timer]).status !== 0) throw Error("FRESH_TIMER_UNHEALTHY");
  }
  if (system(["show", "-P", "Result", "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success" ||
      !system(["show", "-P", "Environment", "saytwist-growth-lease-watchdog.service"]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha) ||
      !system(["show", "-P", "Environment", "saytwist-growth-approved-publisher.service"]).stdout.includes(
        "EXPECTED_RELEASE=" + sha) ||
      system(["is-active", "--quiet", "saytwist-growth-approved-publisher.service"]).status === 0 ||
      system(["is-active", "--quiet", "saytwist-growth-autonomous-cycle.service"]).status === 0 ||
      system(["is-active", "--quiet", "saytwist-growth-daily-observe.service"]).status === 0) {
    throw Error("FRESH_WATCHDOG_OR_PUBLISHER_BUSY");
  }
  const processList = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PM2_HOME: "/home/saytwist/.pm2",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (processList.status !== 0 || processList.error) throw Error("FRESH_PM2_UNAVAILABLE");
  const apps = JSON.parse(processList.stdout);
  const db = validatedDatabaseUrl(apps);
  const app = apps.find(x => x.name === "saytwist").pm2_env;
  const read = key => app[key] ?? app.env?.[key];
  for (const key of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (read(key) === "true") throw Error("FRESH_UNEXPECTED_AUTOMATION");
  if (["OBSERVE", "RECOMMEND"].includes(read("GROWTH_ROLLOUT_MODE"))) {
    throw Error("FRESH_ROLLOUT_NOT_OFF");
  }

  // Reuse only the existing isolated Growth OpenAI project credentials.
  // Never forward the public site's OpenAI key, Pinterest secrets or PM2 environment.
  loadEnvConfig(APP, false);
  const growthKey = process.env.GROWTH_OPENAI_API_KEY || "";
  const growthProject = process.env.GROWTH_OPENAI_PROJECT_ID || "";
  if (!/^sk-[A-Za-z0-9_-]{12,}$/.test(growthKey) ||
      !/^proj_[A-Za-z0-9_-]{3,128}$/.test(growthProject) ||
      growthKey === process.env.OPENAI_API_KEY) {
    throw Error("FRESH_GROWTH_OPENAI_PROJECT_MISSING");
  }
  const child = spawnSync(NODE, [
    "node_modules/tsx/dist/cli.mjs",
    "workers/growth-daily-fresh-creatives.ts",
  ], {
    cwd: APP, encoding: "utf8", timeout: 810_000, maxBuffer: 4096,
    env: {
      NODE_ENV: "production", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
      DATABASE_URL: db, APP_BASE_URL: "https://saytwist.com",
      EXPECTED_RELEASE: sha,
      GROWTH_DAILY_FRESH_ENABLED: "true",
      GROWTH_DAILY_FRESH_DAY: now.toISOString().slice(0, 10),
      GROWTH_DAILY_FRESH_MODE: trial ? "TRIAL" : "SCHEDULED",
      GROWTH_DAILY_FRESH_APPROVAL: trial
        ? "RUN SAYTWIST DAILY FRESH TRIAL " + sha
        : "SAYTWIST_DAILY_FRESH_SCHEDULED:" + sha,
      GROWTH_DAILY_FRESH_ENTRYPOINT: "true",
      GROWTH_WORKER_RUN_ENABLED: "false",
      GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
      TELEGRAM_REPORTS_ENABLED: "false",
      GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
      GROWTH_AI_IMAGE_ENABLED: "true",
      GROWTH_OPENAI_API_KEY: growthKey,
      GROWTH_OPENAI_PROJECT_ID: growthProject,
      GROWTH_OPENAI_IMAGE_MODEL: "gpt-image-2",
      GROWTH_ROLLOUT_MODE: "OFF",
    },
  });
  const lines = (child.stdout || "").trim().split("\n");
  if (child.error || child.status !== 0 ||
      lines.length !== 5 || !ALLOWED.has(lines[0]) ||
      !/^GROWTH_DAILY_FRESH_CREATED=[0-3]$/.test(lines[1]) ||
      lines[2] !== lines[1].replace("GROWTH_DAILY_FRESH_CREATED=", "GROWTH_DAILY_FRESH_AI_CALLS=") ||
      lines[3] !== "GROWTH_DAILY_FRESH_PINS_PUBLISHED=0" ||
      lines[4] !== "GROWTH_DAILY_FRESH_GROWTH=OFF" ||
      (lines[0] !== "GROWTH_DAILY_FRESH=PASSED" &&
        lines[1] !== "GROWTH_DAILY_FRESH_CREATED=0") ||
      (lines[0] === "GROWTH_DAILY_FRESH=PASSED" &&
        lines[1] === "GROWTH_DAILY_FRESH_CREATED=0")) {
    throw Error("FRESH_CHILD_BLOCKED");
  }
  process.stdout.write(lines.join("\n") + "\n");
}

if (require.main === module) {
  try { run(); }
  catch {
    process.stderr.write("GROWTH_DAILY_FRESH_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
