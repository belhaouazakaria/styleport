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
const CREDENTIAL = /^sk-[A-Za-z0-9_-]{12,}$/;
const PROJECT = /^proj_[A-Za-z0-9_-]{3,128}$/;

function run() {
  const sha = process.env.EXPECTED_RELEASE || "";
  const now = new Date();
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      process.env.GROWTH_AUTONOMOUS_CONTENT_LAUNCH !== "true" ||
      !(now.getUTCHours() === 6 && now.getUTCMinutes() >= 30 && now.getUTCMinutes() < 50) ||
      fs.readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) throw Error("RUNTIME_INVALID");
  const sys = args => spawnSync("/usr/bin/systemctl", args,
    { encoding: "utf8", timeout: 5000, maxBuffer: 4096 });
  if (sys(["is-active", "--quiet", "saytwist-growth-lease-watchdog.timer"]).status !== 0 ||
      sys(["show", "-P", "Result", "saytwist-growth-lease-watchdog.service"]).stdout.trim() !== "success" ||
      !sys(["show", "-P", "Environment", "saytwist-growth-lease-watchdog.service"]).stdout.includes(
        "WATCHDOG_EXPECTED_RELEASE_SHA=" + sha) ||
      sys(["is-active", "--quiet", "saytwist-growth-autonomous-cycle.timer"]).status !== 0 ||
      sys(["show", "-P", "Result", "saytwist-growth-autonomous-cycle.service"]).stdout.trim() !== "success") {
    throw Error("DEPENDENCY_NOT_READY");
  }
  const p = spawnSync(PM2, ["jlist"], {
    cwd: APP, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PM2_HOME: "/home/saytwist/.pm2",
      PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin" },
  });
  if (p.status !== 0 || p.error) throw Error("PM2_UNAVAILABLE");
  const rows = JSON.parse(p.stdout);
  const db = validatedDatabaseUrl(rows);
  const app = rows.find(x => x.name === "saytwist").pm2_env;
  const value = key => app[key] ?? app.env?.[key];
  for (const flag of ["GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED"]) {
    if (value(flag) === "true") throw Error("CONFLICTING_AUTOMATION");
  }
  if (["OBSERVE", "RECOMMEND", "PREPARE", "APPROVED_PUBLISH"].includes(
    value("GROWTH_ROLLOUT_MODE"))) throw Error("GLOBAL_ROLLOUT_NOT_OFF");
  loadEnvConfig(APP, false);
  const key = process.env.GROWTH_OPENAI_API_KEY || "";
  const project = process.env.GROWTH_OPENAI_PROJECT_ID || "";
  const normalKey = process.env.OPENAI_API_KEY || "";
  if (!CREDENTIAL.test(key) || !PROJECT.test(project) ||
      !normalKey || key === normalKey) throw Error("AI_PROJECT_NOT_ISOLATED");
  if (!fs.existsSync("workers/growth-autonomous-content.ts") ||
      !fs.existsSync("node_modules/tsx/dist/cli.mjs")) throw Error("RELEASE_MISSING");
  // No provider credentials in argv, stdout, child stderr or persistent PM2.
  const child = spawnSync(NODE,
    ["node_modules/tsx/dist/cli.mjs", "workers/growth-autonomous-content.ts"], {
      cwd: APP, encoding: "utf8", timeout: 900_000, maxBuffer: 4096,
      env: {
        NODE_ENV: "production", HOME: "/home/saytwist",
        PATH: NODEDIR + ":/usr/local/bin:/usr/bin:/bin",
        DATABASE_URL: db, EXPECTED_RELEASE: sha,
        APP_BASE_URL: "https://saytwist.com",
        OPENAI_API_KEY: normalKey, OPENAI_MODEL: "gpt-4.1-mini",
        GROWTH_OPENAI_API_KEY: key, GROWTH_OPENAI_PROJECT_ID: project,
        GROWTH_AI_IMAGE_ENABLED: "false",
        GROWTH_AUTONOMOUS_CONTENT_DATE: now.toISOString().slice(0, 10),
        GROWTH_AUTONOMOUS_CONTENT_ENABLED: "true",
        GROWTH_AUTONOMOUS_CONTENT_APPROVAL: "SAYTWIST_CONTENT_PREPARATION:" + sha,
        GROWTH_AUTONOMOUS_CONTENT_ENTRYPOINT: "true",
        GROWTH_WORKER_RUN_ENABLED: "false", GROWTH_ROLLOUT_MODE: "OFF",
      },
    });
  const lines = (child.stdout || "").trim().split("\n");
  if (child.error || child.status !== 0 || lines.length !== 5 ||
      lines[0] !== "GROWTH_AUTONOMOUS_CONTENT=PASSED" ||
      !/^GROWTH_AUTONOMOUS_DECISIONS=[0-2]$/.test(lines[1] || "") ||
      !/^GROWTH_AUTONOMOUS_CONTENT_PREPARED=[0-2]$/.test(lines[2] || "") ||
      !/^GROWTH_AUTONOMOUS_PIN_CANDIDATES=[0-2]$/.test(lines[3] || "") ||
      lines[4] !== "GROWTH_AUTONOMOUS_PUBLICATIONS=0") {
    throw Error("CONTENT_CYCLE_FAILED");
  }
  process.stdout.write(lines.join("\n") + "\n");
}
if (require.main === module) {
  try { run(); } catch {
    process.stderr.write("GROWTH_AUTONOMOUS_CONTENT_LAUNCH=BLOCKED\n");
    process.exitCode = 1;
  }
}
module.exports = { run };
