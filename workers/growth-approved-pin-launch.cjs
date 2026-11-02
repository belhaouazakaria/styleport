/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const { loadPinterestRuntimeEnv } = require("./growth-daily-observe-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const ALLOWED = [
  "GROWTH_APPROVED_PUBLISH=NO_DUE",
  "GROWTH_APPROVED_PUBLISH=ONE_JOB_COMPLETED\nGROWTH_APPROVED_PUBLICATION_STATE=RECONCILED",
  "GROWTH_APPROVED_PUBLISH=ONE_JOB_COMPLETED\nGROWTH_APPROVED_PUBLICATION_STATE=RECONCILING",
  "GROWTH_APPROVED_PUBLISH=ONE_JOB_COMPLETED\nGROWTH_APPROVED_PUBLICATION_STATE=PUBLISHED",
];

function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_APPROVED_PUBLISH_LAUNCH !== "true" ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) {
    throw Error("HOST_INVALID");
  }
  const sys = args => spawnSync("/usr/bin/systemctl", args,
    { encoding: "utf8", timeout: 5000, maxBuffer: 4096 });
  if (sys(["is-active", "--quiet", "saytwist-growth-lease-watchdog.timer"]).status !== 0 ||
      sys(["show", "-P", "Result", "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success" ||
      !sys(["show", "-P", "Environment", "saytwist-growth-lease-watchdog.service"]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha) ||
      sys(["is-active", "--quiet", "saytwist-growth-daily-observe.timer"]).status !== 0) {
    throw Error("WATCHDOG_OR_OBSERVE_UNHEALTHY");
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
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (value(flag) === "true") throw Error("CONFLICTING_AUTOMATION");
  }
  if (["OBSERVE", "RECOMMEND", "APPROVED_PUBLISH"].includes(
    value("GROWTH_ROLLOUT_MODE"))) throw Error("GLOBAL_ROLLOUT_NOT_OFF");
  if (!fs.existsSync("workers/growth-approved-pin-tick.ts") ||
      !fs.existsSync("node_modules/tsx/dist/cli.mjs")) throw Error("RELEASE_MISSING");
  // Official Pinterest production credential set, scoped to one subprocess.
  const credentials = loadPinterestRuntimeEnv(APP);
  const child = spawnSync(NODE,
    ["node_modules/tsx/dist/cli.mjs", "workers/growth-approved-pin-tick.ts"], {
      cwd: APP, encoding: "utf8", timeout: 130_000, maxBuffer: 4096,
      env: {
        NODE_ENV: "production", HOME: "/home/saytwist",
        PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
        DATABASE_URL: db, EXPECTED_RELEASE: sha,
        GROWTH_APPROVED_PUBLISH_ENABLED: "true",
        GROWTH_APPROVED_PUBLISH_APPROVAL: "SAYTWIST_APPROVED_PIN_TIMER:" + sha,
        GROWTH_APPROVED_PUBLISH_ENTRYPOINT: "true",
        GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
        ...credentials,
      },
    });
  const result = (child.stdout || "").trim();
  if (child.error || child.status !== 0 || !ALLOWED.includes(result)) {
    throw Error("APPROVED_PUBLISH_JOB_BLOCKED");
  }
  process.stdout.write(result + "\n");
}
if (require.main === module) {
  try { run(); } catch {
    process.stderr.write("GROWTH_APPROVED_PUBLISH_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
