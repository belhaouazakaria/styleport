/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const WATCHDOG = "saytwist-growth-lease-watchdog.service";
const TIMER = "saytwist-growth-lease-watchdog.timer";
const DAILY = "saytwist-growth-daily-observe.timer";
const REPORTS = [
  "GROWTH_AUTONOMOUS_CYCLE=PASSED",
  "GROWTH_AUTONOMOUS_GROWTH=OFF",
  "GROWTH_AUTONOMOUS_LEASE=NONE",
  "GROWTH_AUTONOMOUS_PROVIDER_CALLS=0",
  "GROWTH_AUTONOMOUS_AI_CALLS=0",
  "GROWTH_AUTONOMOUS_PIN_PUBLICATIONS=0",
];

function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_AUTONOMOUS_CYCLE_LAUNCH !== "true" ||
      !(now.getUTCHours() === 4 && now.getUTCMinutes() >= 30 && now.getUTCMinutes() < 50) ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) throw Error("HOST_INVALID");
  const sys = args => spawnSync("/usr/bin/systemctl", args,
    { encoding: "utf8", timeout: 5000, maxBuffer: 4096 });
  if (sys(["is-active", "--quiet", TIMER]).status !== 0 ||
      sys(["show", "-P", "Result", WATCHDOG]).stdout.trim() !== "success" ||
      sys(["show", "-P", "OnFailure", WATCHDOG]).stdout.trim() !==
        "saytwist-growth-lease-watchdog-alert.service" ||
      !sys(["show", "-P", "Environment", WATCHDOG]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha) ||
      sys(["is-active", "--quiet", DAILY]).status !== 0 ||
      sys(["show", "-P", "Result", "saytwist-growth-daily-observe.service"]).stdout.trim() !== "success") {
    throw Error("OBSERVE_OR_WATCHDOG_UNHEALTHY");
  }

  const processList = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
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
  if (!fs.existsSync("workers/growth-autonomous-cycle.ts") ||
      !fs.existsSync("node_modules/tsx/dist/cli.mjs")) throw Error("MISSING_RELEASE");

  const child = spawnSync(NODE,
    ["node_modules/tsx/dist/cli.mjs", "workers/growth-autonomous-cycle.ts"], {
      cwd: APP, encoding: "utf8", timeout: 420_000, maxBuffer: 4096,
      env: {
        NODE_ENV: "production", HOME: "/home/saytwist",
        PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
        DATABASE_URL: db, EXPECTED_RELEASE: sha,
        GROWTH_AUTONOMOUS_CYCLE_DATE: now.toISOString().slice(0, 10),
        GROWTH_AUTONOMOUS_CYCLE_ENABLED: "true",
        GROWTH_AUTONOMOUS_CYCLE_APPROVAL: "SAYTWIST_GROWTH_CYCLE_SCHEDULED:" + sha,
        GROWTH_AUTONOMOUS_CYCLE_ENTRYPOINT: "true",
        GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
      },
    });
  const lines = (child.stdout || "").trim().split("\n");
  const completed = lines.find(x => x.startsWith("GROWTH_AUTONOMOUS_JOBS_COMPLETED="));
  const reused = lines.find(x => x.startsWith("GROWTH_AUTONOMOUS_JOBS_REUSED="));
  if (child.status !== 0 || child.error || lines.length !== 9 ||
      !REPORTS.every(x => lines.includes(x)) ||
      !/^GROWTH_AUTONOMOUS_JOBS_COMPLETED=[0-3]$/.test(completed || "") ||
      !/^GROWTH_AUTONOMOUS_JOBS_REUSED=[0-3]$/.test(reused || "") ||
      Number(completed.slice(-1)) + Number(reused.slice(-1)) !== 3) {
    throw Error("BOUNDED_CYCLE_FAILED");
  }
  process.stdout.write(lines.join("\n") + "\n");
}
if (require.main === module) {
  try { run(); } catch {
    process.stderr.write("GROWTH_AUTONOMOUS_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
