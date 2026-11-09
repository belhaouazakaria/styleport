"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */
// Standalone approved source Pin publisher. No web worker or auto-approval.
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const { loadPinterestRuntimeEnv } = require("./growth-one-account-sync-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const NAMES = [
  "lease-watchdog","daily-observe","autonomous-cycle",
  "approved-publisher","daily-fresh","private-report",
  "autonomous-content","daily-account-analytics","auto-translator-publish",
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
      process.env.GROWTH_VIRAL_SOURCE_LAUNCH !== "true" ||
      process.env.GROWTH_VIRAL_SOURCE_ENABLED !== "true" ||
      process.env.GROWTH_VIRAL_SOURCE_OWNER_APPROVAL !==
        "SAYTWIST_VIRAL_SOURCE:" + sha ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE ||
      now.getUTCHours() < 15 || now.getUTCMinutes() > 45 ||
      !fs.existsSync(APP + "/node_modules/tsx/dist/cli.mjs") ||
      !fs.existsSync(APP + "/workers/growth-viral-source-publisher.ts")) {
    throw Error("VIRAL_SOURCE_HOST_BLOCKED");
  }
  const permit = "/etc/saytwist-growth-viral-source-approval.env";
  const stat = fs.statSync(permit);
  if (!stat.isFile() || stat.uid !== 0 || stat.gid !== 0 ||
      (stat.mode & 0o777) !== 0o600) throw Error("VIRAL_SOURCE_APPROVAL_FILE_UNSAFE");
  for (const name of NAMES) {
    const unit = "saytwist-growth-" + name;
    if (system(["is-active","--quiet",unit + ".timer"]).status !== 0 ||
        system(["is-enabled","--quiet",unit + ".timer"]).status !== 0 ||
        system(["is-active","--quiet",unit + ".service"]).status === 0) {
      throw Error("VIRAL_SOURCE_DEPENDENCY_BUSY");
    }
    const variable = name === "lease-watchdog"
      ? "WATCHDOG_EXPECTED_RELEASE_SHA=" : "EXPECTED_RELEASE=";
    if (!system(["show","-P","Environment",unit + ".service"])
        .stdout.includes(variable + sha)) throw Error("VIRAL_SOURCE_RELEASE_MISMATCH");
  }
  if (system(["show","-P","Result","saytwist-growth-lease-watchdog.service"])
      .stdout.trim() !== "success") throw Error("VIRAL_SOURCE_WATCHDOG_UNSAFE");
  const listing = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    env: { PM2_HOME: "/home/saytwist/.pm2", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (listing.status !== 0 || listing.error) throw Error("VIRAL_SOURCE_PM2_UNAVAILABLE");
  const rows = JSON.parse(listing.stdout);
  const databaseUrl = validatedDatabaseUrl(rows);
  const web = rows.find(x => x.name === "saytwist").pm2_env;
  const read = key => web[key] ?? web.env?.[key];
  for (const name of [
    "GROWTH_WORKER_RUN_ENABLED","TELEGRAM_REPORTS_ENABLED",
    "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED","GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (read(name) === "true") throw Error("VIRAL_SOURCE_WEB_AUTOMATION_UNEXPECTED");
  if (["OBSERVE","RECOMMEND","PREPARE","ANALYTICS"].includes(read("GROWTH_ROLLOUT_MODE"))) {
    throw Error("VIRAL_SOURCE_WEB_ROLLOUT_UNEXPECTED");
  }
  const env = {
    NODE_ENV: "production", HOME: "/home/saytwist",
    PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
    DATABASE_URL: databaseUrl, EXPECTED_RELEASE: sha,
    APP_BASE_URL: "https://saytwist.com",
    GROWTH_VIRAL_SOURCE_ENABLED: "true",
    GROWTH_VIRAL_SOURCE_APPROVAL: "SAYTWIST_VIRAL_SOURCE:" + sha,
    GROWTH_VIRAL_SOURCE_ENTRYPOINT: "true",
    GROWTH_WORKER_RUN_ENABLED: "false",
    GROWTH_ROLLOUT_MODE: "OFF",
    GROWTH_AI_IMAGE_ENABLED: "false",
    GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
    TELEGRAM_REPORTS_ENABLED: "false",
    GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
  };
  Object.assign(env, loadPinterestRuntimeEnv(APP));
  const child = spawnSync(NODE, [
    "node_modules/tsx/dist/cli.mjs",
    "workers/growth-viral-source-publisher.ts",
  ], { cwd: APP, encoding: "utf8", env, timeout: 220000, maxBuffer: 4096 });
  const output = (child.stdout || "").trim();
  if (child.status !== 0 || child.error ||
      !/^GROWTH_VIRAL_SOURCE=(IDLE|PUBLISHED|FAILED_PRE_REQUEST|OUTCOME_UNKNOWN)\nGROWTH_VIRAL_SOURCE_GROWTH=OFF\nGROWTH_VIRAL_SOURCE_AI_CALLS=0$/.test(output)) {
    throw Error("VIRAL_SOURCE_CHILD_BLOCKED");
  }
  process.stdout.write(output + "\n");
}
if (require.main === module) {
  try { run(); } catch {
    process.stderr.write("GROWTH_VIRAL_SOURCE_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
