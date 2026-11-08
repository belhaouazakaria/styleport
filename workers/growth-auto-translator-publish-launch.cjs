/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
// Explicit opt-in local website Translator publication only.
// Absolutely no OpenAI, Pinterest, Telegram or public-site secrets in child.
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const NODE = NODEDIR + "/node";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const ALLOWED = new Set([
  "GROWTH_AUTO_TRANSLATOR_PUBLICATION=PUBLISHED",
  "GROWTH_AUTO_TRANSLATOR_PUBLICATION=NONE",
  "GROWTH_AUTO_TRANSLATOR_PUBLICATION=INELIGIBLE",
  "GROWTH_AUTO_TRANSLATOR_PUBLICATION=SATISFIED",
]);
function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_AUTO_TRANSLATOR_PUBLISH_LAUNCH !== "true" ||
      !(now.getUTCHours() === 6 && now.getUTCMinutes() >= 57 &&
        now.getUTCMinutes() < 59) ||
      !fs.existsSync(APP + "/workers/growth-auto-translator-publish.ts") ||
      !fs.existsSync(APP + "/node_modules/tsx/dist/cli.mjs") ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) {
    throw Error("AUTO_TRANSLATOR_HOST_INVALID");
  }
  const system = args => spawnSync("/usr/bin/systemctl", args, {
    encoding: "utf8", timeout: 5000, maxBuffer: 4096,
  });
  for (const timer of [
    "saytwist-growth-lease-watchdog.timer",
    "saytwist-growth-daily-observe.timer",
    "saytwist-growth-autonomous-cycle.timer",
    "saytwist-growth-approved-publisher.timer",
    "saytwist-growth-daily-fresh.timer",
  ]) {
    if (system(["is-active", "--quiet", timer]).status !== 0) {
      throw Error("AUTO_TRANSLATOR_DEPENDENCY_TIMER_INACTIVE");
    }
  }
  if (system(["show", "-P", "Result", "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success" ||
      !system(["show", "-P", "Environment", "saytwist-growth-lease-watchdog.service"]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha) ||
      !system(["show", "-P", "Environment", "saytwist-growth-approved-publisher.service"]).stdout.includes(
        "EXPECTED_RELEASE=" + sha) ||
      system(["is-active", "--quiet", "saytwist-growth-autonomous-content.service"]).status === 0 ||
      system(["is-active", "--quiet", "saytwist-growth-approved-publisher.service"]).status === 0 ||
      system(["is-active", "--quiet", "saytwist-growth-daily-fresh.service"]).status === 0) {
    throw Error("AUTO_TRANSLATOR_DEPENDENCIES_BUSY");
  }
  const listing = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    env: { PM2_HOME: "/home/saytwist/.pm2", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (listing.status !== 0 || listing.error) throw Error("AUTO_TRANSLATOR_PM2_UNAVAILABLE");
  const apps = JSON.parse(listing.stdout);
  const db = validatedDatabaseUrl(apps);
  const app = apps.find(x => x.name === "saytwist").pm2_env;
  const read = key => app[key] ?? app.env?.[key];
  for (const key of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (read(key) === "true") throw Error("AUTO_TRANSLATOR_UNEXPECTED_WEB_AUTOMATION");
  if (["OBSERVE", "RECOMMEND", "PREPARE", "ANALYTICS"].includes(read("GROWTH_ROLLOUT_MODE"))) {
    throw Error("AUTO_TRANSLATOR_UNEXPECTED_ROLLOUT");
  }
  const child = spawnSync(NODE, [
    "node_modules/tsx/dist/cli.mjs", "workers/growth-auto-translator-publish.ts",
  ], {
    cwd: APP, encoding: "utf8", timeout: 60_000, maxBuffer: 4096,
    env: {
      NODE_ENV: "production", HOME: "/home/saytwist",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
      DATABASE_URL: db, EXPECTED_RELEASE: sha,
      APP_BASE_URL: "https://saytwist.com",
      GROWTH_AUTO_TRANSLATOR_PUBLISH_ENTRYPOINT: "true",
      GROWTH_TRANSLATOR_PUBLISH_ENABLED: "true",
      GROWTH_TRANSLATOR_PUBLISH_APPROVAL: "SAYTWIST_AUTONOMOUS_TRANSLATOR_PUBLICATION:" + sha,
      GROWTH_TRANSLATOR_PUBLISH_DAY: now.toISOString().slice(0, 10),
      GROWTH_WORKER_RUN_ENABLED: "false",
      GROWTH_ROLLOUT_MODE: "OFF",
      GROWTH_AI_IMAGE_ENABLED: "false",
      GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
      TELEGRAM_REPORTS_ENABLED: "false",
      GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
    },
  });
  const lines = (child.stdout || "").trim().split("\n");
  if (child.error || child.status !== 0 || lines.length !== 4 ||
      !ALLOWED.has(lines[0]) ||
      lines[1] !== "GROWTH_AUTO_TRANSLATOR_PINS_PUBLISHED=0" ||
      lines[2] !== "GROWTH_AUTO_TRANSLATOR_AI_CALLS=0" ||
      lines[3] !== "GROWTH_AUTO_TRANSLATOR_GROWTH=OFF") {
    throw Error("AUTO_TRANSLATOR_CHILD_BLOCKED");
  }
  process.stdout.write(lines.join("\n") + "\n");
}
if (require.main === module) {
  try { run(); }
  catch {
    process.stderr.write("GROWTH_AUTO_TRANSLATOR_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
