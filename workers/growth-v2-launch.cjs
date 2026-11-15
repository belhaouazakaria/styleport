/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { validatedDatabaseUrl } = require("./growth-lease-watchdog-launch.cjs");
const APP = "/home/saytwist/htdocs/saytwist.com";
const NODEDIR = "/home/saytwist/.nvm/versions/node/v24.20.0/bin";
const PM2 = "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const mode = process.env.GROWTH_V2_SERVICE_MODE;
  if (!/^[a-f0-9]{40}$/.test(sha) || !["courier", "intelligence"].includes(mode) || process.env.GROWTH_V2_SERVICE_APPROVAL !== "SAYTWIST_V2:" + mode + ":" + sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" || process.getuid?.() === 0 || process.execPath !== NODEDIR + "/node" || fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha) throw Error("V2_HOST_GUARD");
  const snapshot = spawnSync(PM2, ["jlist"], { cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024, env: { PM2_HOME: "/home/saytwist/.pm2", HOME: "/home/saytwist", PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" } });
  if (snapshot.error || snapshot.status !== 0) throw Error("V2_PM2_GUARD");
  const env = { NODE_ENV: "production", HOME: "/home/saytwist", PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin", DATABASE_URL: validatedDatabaseUrl(JSON.parse(snapshot.stdout)), APP_BASE_URL: "https://saytwist.com", EXPECTED_RELEASE: sha,
    GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF", GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false", TELEGRAM_REPORTS_ENABLED: "false" };
  const keys = mode === "courier" ? ["GROWTH_AUTOMATIC_REVIEW_PREPARATION_ENABLED", "GROWTH_DISCORD_ENABLED", "GROWTH_DISCORD_COURIER_ENABLED", "DISCORD_APPLICATION_ID", "DISCORD_PUBLIC_KEY", "DISCORD_OWNER_USER_ID", "DISCORD_BOT_TOKEN", "GROWTH_DISCORD_OWNER_USER_ID"]
    : ["GROWTH_AUTOMATIC_BOARD_SYNC_ENABLED", "GROWTH_V2_INTELLIGENCE_ENABLED", "GROWTH_SOURCE_ANALYTICS_ENABLED", "GROWTH_AUTOMATIC_BACKFILL_ENABLED", "PINTEREST_APP_ID", "PINTEREST_APP_SECRET", "PINTEREST_REDIRECT_URI", "PINTEREST_API_ENVIRONMENT", "GROWTH_CREDENTIAL_ENCRYPTION_KEY"];
  for (const key of keys) env[key] = process.env[key] || "";
  env[mode === "courier" ? "GROWTH_DISCORD_COURIER_ENTRYPOINT" : "GROWTH_V2_INTELLIGENCE_ENTRYPOINT"] = "true";
  const file = mode === "courier" ? "workers/growth-discord-courier.ts" : "workers/growth-v2-intelligence.ts";
  const child = spawnSync(NODEDIR + "/node", ["node_modules/tsx/dist/cli.mjs", file], { cwd: APP, env, encoding: "utf8", timeout: 120000, maxBuffer: 4096 });
  if (child.error || child.status !== 0) throw Error("V2_CHILD_BLOCKED");
  process.stdout.write("GROWTH_V2_SERVICE=COMPLETED\n");
}
if (require.main === module) { try { run(); } catch { process.stderr.write("GROWTH_V2_SERVICE=BLOCKED\n"); process.exitCode = 1; } }
module.exports = { run };
