/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
// Opt-in official Pinterest Trends research. No OpenAI, Telegram, Pin writes,
// visitor attribution or generic Growth worker execution.
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const { loadPinterestRuntimeEnv } = require("./growth-one-account-sync-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const TIMERS = [
  "saytwist-growth-lease-watchdog",
  "saytwist-growth-daily-observe",
  "saytwist-growth-autonomous-cycle",
  "saytwist-growth-approved-publisher",
  "saytwist-growth-daily-fresh",
  "saytwist-growth-private-report",
];

function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_MARKET_RESEARCH_LAUNCH !== "true" ||
      process.env.GROWTH_MARKET_RESEARCH_ENABLED !== "true" ||
      process.env.GROWTH_PINTEREST_TRENDS_ACCESS_APPROVED !== "true" ||
      process.env.GROWTH_MARKET_RESEARCH_APPROVAL !== "SAYTWIST_MARKET_RESEARCH:" + sha ||
      !(now.getUTCHours() === 5 && now.getUTCMinutes() >= 10 &&
        now.getUTCMinutes() < 25) ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      !fs.existsSync(APP + "/workers/growth-market-research.ts") ||
      !fs.existsSync(APP + "/node_modules/tsx/dist/cli.mjs") ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) {
    throw Error("MARKET_HOST_INVALID");
  }
  const system = args => spawnSync("/usr/bin/systemctl", args, {
    encoding: "utf8", timeout: 5000, maxBuffer: 4096,
  });
  for (const name of TIMERS) {
    if (system(["is-active", "--quiet", name + ".timer"]).status !== 0 ||
        system(["is-enabled", "--quiet", name + ".timer"]).status !== 0) {
      throw Error("MARKET_DEPENDENCY_TIMER_INVALID");
    }
    if (system(["is-active", "--quiet", name + ".service"]).status === 0) {
      throw Error("MARKET_DEPENDENCY_BUSY");
    }
  }
  if (system(["show", "-P", "Result",
      "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success" ||
      !system(["show", "-P", "Environment",
        "saytwist-growth-lease-watchdog.service"]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha)) {
    throw Error("MARKET_WATCHDOG_UNVERIFIED");
  }
  for (const name of TIMERS.slice(1)) {
    if (!system(["show", "-P", "Environment", name + ".service"])
        .stdout.includes("EXPECTED_RELEASE=" + sha)) {
      throw Error("MARKET_RELEASE_PIN_MISMATCH");
    }
  }
  const listing = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { PM2_HOME: "/home/saytwist/.pm2", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (listing.status !== 0 || listing.error) throw Error("MARKET_PM2_UNAVAILABLE");
  const processes = JSON.parse(listing.stdout);
  const db = validatedDatabaseUrl(processes);
  const app = processes.find(row => row.name === "saytwist").pm2_env;
  const read = key => app[key] ?? app.env?.[key];
  for (const flag of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
  ]) if (read(flag) === "true") throw Error("MARKET_WEB_AUTOMATION_UNEXPECTED");
  if (["OBSERVE", "RECOMMEND", "PREPARE", "ANALYTICS"].includes(
      read("GROWTH_ROLLOUT_MODE"))) throw Error("MARKET_WEB_ROLLOUT_UNEXPECTED");

  const childEnv = {
    NODE_ENV: "production", HOME: "/home/saytwist",
    PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
    DATABASE_URL: db, EXPECTED_RELEASE: sha,
    APP_BASE_URL: "https://saytwist.com",
    GROWTH_MARKET_RESEARCH_ENTRYPOINT: "true",
    GROWTH_MARKET_RESEARCH_DAY: now.toISOString().slice(0, 10),
    GROWTH_MARKET_RESEARCH_ENABLED: "true",
    GROWTH_PINTEREST_TRENDS_ACCESS_APPROVED: "true",
    GROWTH_MARKET_RESEARCH_APPROVAL: "SAYTWIST_MARKET_RESEARCH:" + sha,
    GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
    GROWTH_AI_IMAGE_ENABLED: "false",
    GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
    GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
    TELEGRAM_REPORTS_ENABLED: "false",
  };
  Object.assign(childEnv, loadPinterestRuntimeEnv(APP));
  const child = spawnSync(NODE,
    ["node_modules/tsx/dist/cli.mjs", "workers/growth-market-research.ts"], {
      cwd: APP, encoding: "utf8", timeout: 80_000,
      maxBuffer: 4096, env: childEnv,
    });
  const output = (child.stdout || "").trim();
  const pattern = /^GROWTH_MARKET_RESEARCH=(RESEARCHED|NOT_DUE|OWNER_PAUSED)\nGROWTH_MARKET_RESEARCH_INSPECTED=(\d{1,2})\nGROWTH_MARKET_RESEARCH_PROPOSALS=(\d{1,2})\nGROWTH_MARKET_RESEARCH_PIN_WRITES=0\nGROWTH_MARKET_RESEARCH_AI_CALLS=0\nGROWTH_MARKET_RESEARCH_GROWTH=OFF$/;
  const match = pattern.exec(output);
  if (child.error || child.status !== 0 || !match ||
      Number(match[2]) > 50 || Number(match[3]) > 12 ||
      (match[1] !== "RESEARCHED" &&
        (Number(match[2]) !== 0 || Number(match[3]) !== 0))) {
    throw Error("MARKET_CHILD_BLOCKED");
  }
  process.stdout.write(output + "\n");
}

if (require.main === module) {
  try { run(); }
  catch {
    process.stderr.write("GROWTH_MARKET_RESEARCH_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
