/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const { loadPinterestRuntimeEnv } = require("./growth-one-account-sync-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE_DIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODE_DIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const NAMES = [
  "lease-watchdog", "daily-observe", "autonomous-cycle",
  "approved-publisher", "daily-fresh", "private-report",
  "autonomous-content", "daily-account-analytics",
  "auto-translator-publish", "viral-discovery", "viral-source",
];
const EXPECTED = [
  "GROWTH_OWNER_PENDING_BOARD=SUCCEEDED",
  "GROWTH_OWNER_PENDING_ACCOUNT=SUCCEEDED",
  "GROWTH_OWNER_PENDING_QUEUE=EMPTY",
  "GROWTH_OWNER_PENDING_PROVIDER_WRITES=0",
  "GROWTH_OWNER_PENDING_AI_CALLS=0",
  "GROWTH_OWNER_PENDING_GLOBAL=OFF",
].join("\n");

function system(args) {
  return spawnSync("/usr/bin/systemctl", args, {
    encoding: "utf8", timeout: 5000, maxBuffer: 4096,
  });
}
function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_OWNER_QUEUED_SYNC_LAUNCH !== "true" ||
      process.env.GROWTH_OWNER_QUEUED_SYNC_OWNER_APPROVAL !==
        "SAYTWIST_COMPLETE_TWO_QUEUED_SYNCS:" + sha ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE ||
      !fs.existsSync("workers/growth-owner-queued-pinterest-sync.ts") ||
      !fs.existsSync("node_modules/tsx/dist/cli.mjs")) {
    throw Error("OWNER_SYNC_LAUNCH_RUNTIME_INVALID");
  }
  for (const name of NAMES) {
    const base = "saytwist-growth-" + name;
    if (system(["is-enabled", "--quiet", base + ".timer"]).status !== 0 ||
        system(["is-active", "--quiet", base + ".timer"]).status !== 0 ||
        system(["is-active", "--quiet", base + ".service"]).status === 0) {
      throw Error("OWNER_SYNC_DEPENDENCY_NOT_IDLE");
    }
    const key = name === "lease-watchdog"
      ? "WATCHDOG_EXPECTED_RELEASE_SHA=" : "EXPECTED_RELEASE=";
    if (!system(["show", "-P", "Environment", base + ".service"])
      .stdout.includes(key + sha)) {
      throw Error("OWNER_SYNC_DEPENDENCY_RELEASE_MISMATCH");
    }
  }
  if (system(["show", "-P", "Result",
    "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success") {
    throw Error("OWNER_SYNC_WATCHDOG_UNHEALTHY");
  }
  const listing = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000,
    maxBuffer: 16 * 1024 * 1024,
    env: { PM2_HOME: "/home/saytwist/.pm2", HOME: "/home/saytwist",
      PATH: NODE_DIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (listing.status !== 0 || listing.error) throw Error("OWNER_SYNC_PM2_UNAVAILABLE");
  const rows = JSON.parse(listing.stdout);
  const databaseUrl = validatedDatabaseUrl(rows);
  const web = rows.find(x => x.name === "saytwist")?.pm2_env;
  if (!web) throw Error("OWNER_SYNC_WEB_PROCESS_MISSING");
  const value = key => web[key] ?? web.env?.[key];
  for (const key of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
  ]) {
    if (value(key) === "true") throw Error("OWNER_SYNC_WEB_AUTOMATION_UNEXPECTED");
  }
  if (["OBSERVE", "RECOMMEND", "PREPARE", "ANALYTICS"].includes(
    value("GROWTH_ROLLOUT_MODE"))) {
    throw Error("OWNER_SYNC_WEB_ROLLOUT_UNEXPECTED");
  }
  const childEnv = {
    HOME: "/home/saytwist", NODE_ENV: "production",
    PATH: NODE_DIR + ":/usr/local/bin:/usr/bin:/bin",
    DATABASE_URL: databaseUrl, EXPECTED_RELEASE: sha,
    GROWTH_OWNER_QUEUED_SYNC_ENTRYPOINT: "true",
    GROWTH_OWNER_QUEUED_SYNC_APPROVAL: "SAYTWIST_COMPLETE_TWO_QUEUED_SYNCS:" + sha,
    GROWTH_WORKER_RUN_ENABLED: "false",
    GROWTH_ROLLOUT_MODE: "OFF",
    GROWTH_AI_IMAGE_ENABLED: "false",
    GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
    TELEGRAM_REPORTS_ENABLED: "false",
    GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
    APP_BASE_URL: "https://saytwist.com",
  };
  Object.assign(childEnv, loadPinterestRuntimeEnv(APP));
  const child = spawnSync(NODE, [
    "node_modules/tsx/dist/cli.mjs",
    "workers/growth-owner-queued-pinterest-sync.ts",
  ], {
    cwd: APP, env: childEnv, encoding: "utf8",
    timeout: 330_000, maxBuffer: 4096,
  });
  if (child.error || child.status !== 0 ||
      (child.stdout || "").trim() !== EXPECTED) {
    const stage = (child.stderr || "").match(
      /GROWTH_OWNER_PENDING_STAGE=(RUNTIME|BOARD|ACCOUNT|POSTCONDITION)/,
    )?.[1] || "UNKNOWN";
    process.stderr.write("GROWTH_OWNER_PENDING_STAGE=" + stage + "\n");
    throw Error("OWNER_SYNC_CHILD_BLOCKED");
  }
  process.stdout.write(EXPECTED + "\n");
}
if (require.main === module) {
  try { run(); }
  catch {
    process.stderr.write("GROWTH_OWNER_PENDING_SYNC_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
