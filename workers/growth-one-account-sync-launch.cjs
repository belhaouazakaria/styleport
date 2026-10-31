/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE_DIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODE_DIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const SERVICE = "saytwist-growth-lease-watchdog.service";
const TIMER = "saytwist-growth-lease-watchdog.timer";
const ALERT = "saytwist-growth-lease-watchdog-alert.service";
const EXPECTED_LINES = [
  "GROWTH_ONE_ACCOUNT_SYNC=PASSED",
  "GROWTH_ONE_ACCOUNT_SYNC_JOB=SUCCEEDED",
  "GROWTH_ONE_ACCOUNT_SYNC_GROWTH=OFF",
  "GROWTH_ONE_ACCOUNT_SYNC_LEASE=NONE",
  "GROWTH_ONE_ACCOUNT_SYNC_ACTIVE_QUEUE=0",
  "GROWTH_ONE_ACCOUNT_SYNC_PROVIDER_GETS=1",
  "GROWTH_ONE_ACCOUNT_SYNC_PROVIDER_WRITES=0",
  "GROWTH_ONE_ACCOUNT_SYNC_AI_CALLS=0",
  "GROWTH_ONE_ACCOUNT_SYNC_TELEGRAM=0",
];

function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_ONE_ACCOUNT_SYNC_LAUNCH !== "true" ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) {
    throw Error("INVALID_RUNTIME");
  }
  const sys = args => spawnSync("/usr/bin/systemctl", args,
    { encoding: "utf8", timeout: 5000, maxBuffer: 4096 });
  if (sys(["is-active", "--quiet", TIMER]).status !== 0 ||
      sys(["show", "-P", "Result", SERVICE]).stdout.trim() !== "success" ||
      sys(["show", "-P", "OnFailure", SERVICE]).stdout.trim() !== ALERT ||
      !sys(["show", "-P", "Environment", SERVICE]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha)) throw Error("WATCHDOG_UNHEALTHY");

  const list = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PM2_HOME: "/home/saytwist/.pm2",
      PATH: NODE_DIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (list.status !== 0 || list.error) throw Error("PM2_UNAVAILABLE");
  const rows = JSON.parse(list.stdout);
  const db = validatedDatabaseUrl(rows);
  const app = rows.find(row => row.name === "saytwist").pm2_env;
  const value = key => app[key] ?? app.env?.[key];
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (value(flag) === "true") throw Error("AUTOMATION_NOT_OFF");
  }
  if (["OBSERVE","RECOMMEND"].includes(value("GROWTH_ROLLOUT_MODE"))) {
    throw Error("ROLLOUT_NOT_OFF");
  }
  if (!fs.existsSync("workers/growth-one-account-sync.ts") ||
      !fs.existsSync("node_modules/tsx/dist/cli.mjs")) throw Error("RELEASE_MISSING");
  // Values remain in child process memory. Never print the PM2 snapshot or child stderr.
  const childEnv = {
    NODE_ENV: "production", HOME: "/home/saytwist",
    PATH: NODE_DIR + ":/usr/local/bin:/usr/bin:/bin",
    DATABASE_URL: db, EXPECTED_RELEASE: sha,
    GROWTH_PINTEREST_ONE_SYNC_APPROVAL: "RUN SAYTWIST GROWTH ONE ACCOUNT SYNC " + sha,
    GROWTH_PINTEREST_ONE_SYNC_ENTRYPOINT: "true",
    GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
  };
  for (const key of ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET",
    "PINTEREST_REDIRECT_URI", "PINTEREST_API_ENVIRONMENT",
    "GROWTH_CREDENTIAL_ENCRYPTION_KEY"]) {
    const v = value(key);
    if (typeof v !== "string" || !v) throw Error("PIN_ENV_MISSING");
    childEnv[key] = v;
  }
  const child = spawnSync(NODE,
    ["node_modules/tsx/dist/cli.mjs", "workers/growth-one-account-sync.ts"], {
      cwd: APP, env: childEnv, encoding: "utf8",
      timeout: 75_000, maxBuffer: 8192,
    });
  if (child.status !== 0 || child.error ||
      (child.stdout || "").trim() !== EXPECTED_LINES.join("\n")) {
    throw Error("BOUNDED_SYNC_FAILED");
  }
  process.stdout.write(EXPECTED_LINES.join("\n") + "\n");
}
if (require.main === module) {
  try { run(); } catch {
    process.stderr.write("GROWTH_ONE_ACCOUNT_SYNC_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
