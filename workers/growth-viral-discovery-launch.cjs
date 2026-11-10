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
const NAMES = [
  "lease-watchdog", "daily-observe", "autonomous-cycle",
  "approved-publisher", "daily-fresh", "private-report",
  "autonomous-content", "daily-account-analytics", "auto-translator-publish",
];
function system(args) {
  return spawnSync("/usr/bin/systemctl", args, {
    encoding: "utf8", timeout: 5000, maxBuffer: 4096,
  });
}
function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_VIRAL_DISCOVERY_LAUNCH !== "true" ||
      process.env.GROWTH_VIRAL_DISCOVERY_ENABLED !== "true" ||
      process.env.GROWTH_VIRAL_DISCOVERY_OWNER_APPROVAL !==
        "SAYTWIST_VIRAL_DISCOVERY:" + sha ||
      now.getUTCHours() !== 8 || now.getUTCMinutes() < 15 ||
      now.getUTCMinutes() >= 30 ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE ||
      !fs.existsSync("workers/growth-viral-discovery.ts") ||
      !fs.existsSync("node_modules/tsx/dist/cli.mjs")) {
    throw Error("DISCOVERY_LAUNCH_RUNTIME_BLOCKED");
  }
  for (const name of NAMES) {
    const prefix = "saytwist-growth-" + name;
    if (system(["is-active", "--quiet", prefix + ".timer"]).status !== 0 ||
        system(["is-enabled", "--quiet", prefix + ".timer"]).status !== 0 ||
        system(["is-active", "--quiet", prefix + ".service"]).status === 0) {
      throw Error("DISCOVERY_DEPENDENCIES_NOT_IDLE");
    }
    const key = name === "lease-watchdog"
      ? "WATCHDOG_EXPECTED_RELEASE_SHA=" : "EXPECTED_RELEASE=";
    if (!system(["show", "-P", "Environment", prefix + ".service"])
      .stdout.includes(key + sha)) throw Error("DISCOVERY_RELEASE_MISMATCH");
  }
  if (system(["show", "-P", "Result", "saytwist-growth-lease-watchdog.service"])
    .stdout.trim() !== "success") throw Error("DISCOVERY_WATCHDOG_UNHEALTHY");

  const listing = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    env: { HOME: "/home/saytwist", PM2_HOME: "/home/saytwist/.pm2",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (listing.status !== 0 || listing.error) throw Error("DISCOVERY_PM2_UNAVAILABLE");
  const rows = JSON.parse(listing.stdout);
  const databaseUrl = validatedDatabaseUrl(rows);
  const web = rows.find(x => x.name === "saytwist")?.pm2_env;
  if (!web) throw Error("DISCOVERY_WEB_PROCESS_MISSING");
  const value = key => web[key] ?? web.env?.[key];
  for (const name of [
    "GROWTH_WORKER_RUN_ENABLED", "TELEGRAM_REPORTS_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (value(name) === "true") throw Error("DISCOVERY_GLOBAL_AUTOMATION_ACTIVE");
  if (["OBSERVE", "RECOMMEND", "PREPARE", "ANALYTICS"].includes(
    value("GROWTH_ROLLOUT_MODE"))) throw Error("DISCOVERY_ROLLOUT_ACTIVE");

  const child = spawnSync(NODE, [
    "node_modules/tsx/dist/cli.mjs", "workers/growth-viral-discovery.ts",
  ], {
    cwd: APP, encoding: "utf8", timeout: 90_000, maxBuffer: 4096,
    env: {
      NODE_ENV: "production", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
      DATABASE_URL: databaseUrl, EXPECTED_RELEASE: sha,
      GROWTH_VIRAL_DISCOVERY_ENTRYPOINT: "true",
      GROWTH_VIRAL_DISCOVERY_ENABLED: "true",
      GROWTH_VIRAL_DISCOVERY_APPROVAL: "SAYTWIST_VIRAL_DISCOVERY:" + sha,
      GROWTH_VIRAL_DISCOVERY_DATE: now.toISOString().slice(0, 10),
      GROWTH_WORKER_RUN_ENABLED: "false",
      GROWTH_ROLLOUT_MODE: "OFF",
      GROWTH_AI_IMAGE_ENABLED: "false",
      GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
      TELEGRAM_REPORTS_ENABLED: "false",
      GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
    },
  });
  const output = (child.stdout || "").trim();
  const lines = output.split("\n");
  if (child.status !== 0 || child.error || lines.length !== 7 ||
      !/^GROWTH_VIRAL_DISCOVERY=(SCANNED|ALREADY_RESERVED)$/.test(lines[0]) ||
      !/^GROWTH_VIRAL_DISCOVERY_INSPECTED=(0|[1-9][0-9]{0,2})$/.test(lines[1]) ||
      !/^GROWTH_VIRAL_DISCOVERY_CREATED=(0|[1-9][0-9]{0,2})$/.test(lines[2]) ||
      !/^GROWTH_VIRAL_DISCOVERY_SOURCE_DRAFTS=(0|[1-3])$/.test(lines[3]) ||
      lines[4] !== "GROWTH_VIRAL_DISCOVERY_PIN_WRITES=0" ||
      lines[5] !== "GROWTH_VIRAL_DISCOVERY_AI_CALLS=0" ||
      lines[6] !== "GROWTH_VIRAL_DISCOVERY_GROWTH=OFF") {
    throw Error("DISCOVERY_CHILD_BLOCKED");
  }
  process.stdout.write(output + "\n");
}
if (require.main === module) {
  try { run(); } catch {
    process.stderr.write("GROWTH_VIRAL_DISCOVERY_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
