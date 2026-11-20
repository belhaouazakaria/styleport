#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const PM2 =
  "/home/saytwist/.npm/_npx/5f7878ce38f1eb13/node_modules/pm2/bin/pm2";
const fail = () => {
  process.stderr.write("MANUAL_GAP_FILL_LAUNCH_BLOCKED\n");
  process.exit(1);
};

if (
  process.env.GROWTH_MANUAL_GAP_FILL_LAUNCH !== "true" ||
  process.env.NODE_ENV !== "production" ||
  process.env.GROWTH_MANUAL_GAP_FILL_ENABLED !== "true" ||
  !/^[0-9a-f-]{36}$/i.test(
    process.env.GROWTH_MANUAL_GAP_FILL_REQUEST_ID || "",
  ) ||
  !/^[a-f0-9]{40}$/.test(process.env.EXPECTED_RELEASE || "") ||
  readFileSync(APP + "/.deployed-release", "utf8").trim() !==
    process.env.EXPECTED_RELEASE ||
  process.cwd() !== APP ||
  process.getuid?.() === 0 ||
  process.env.USER !== "saytwist" ||
  process.execPath !== NODE ||
  !/^sk-[A-Za-z0-9_-]{12,}$/.test(process.env.GROWTH_OPENAI_API_KEY || "") ||
  !/^proj_[A-Za-z0-9_-]{3,128}$/.test(
    process.env.GROWTH_OPENAI_PROJECT_ID || "",
  )
)
  fail();

const listed = spawnSync(PM2, ["jlist"], {
  cwd: APP,
  encoding: "utf8",
  timeout: 10_000,
  maxBuffer: 16 * 1024 * 1024,
  env: {
    HOME: "/home/saytwist",
    USER: "saytwist",
    PATH: "/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/local/bin:/usr/bin:/bin",
    PM2_HOME: "/home/saytwist/.pm2",
  },
});
if (listed.status !== 0 || listed.error) fail();

let apps;
try {
  apps = JSON.parse(listed.stdout);
} catch {
  fail();
}
const web = apps.find(
  (app) => app.name === "saytwist" && app.pm2_env?.status === "online",
);
if (!web || web.pm2_env.pm_cwd !== APP) fail();
const appEnv = web.pm2_env;
const read = (key) => appEnv[key] ?? appEnv.env?.[key];
const rawDatabaseUrl = read("DATABASE_URL");
let databaseUrl;
try {
  const db = new URL(rawDatabaseUrl || "");
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    db.hostname !== "127.0.0.1" ||
    db.port !== "5433" ||
    decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
    db.searchParams.has("host") ||
    !db.username
  )
    fail();
  databaseUrl = rawDatabaseUrl;
} catch {
  fail();
}

const child = spawnSync(
  NODE,
  ["node_modules/tsx/dist/cli.mjs", "workers/growth-manual-gap-fill.ts"],
  {
    cwd: APP,
    encoding: "utf8",
    timeout: 1_080_000,
    maxBuffer: 4096,
    env: {
      NODE_ENV: "production",
      HOME: "/home/saytwist",
      PATH: "/home/saytwist/.nvm/versions/node/v24.20.0/bin:/usr/local/bin:/usr/bin:/bin",
      DATABASE_URL: databaseUrl,
      APP_BASE_URL: "https://saytwist.com",
      EXPECTED_RELEASE: process.env.EXPECTED_RELEASE,
      GROWTH_MANUAL_GAP_FILL_ENABLED: "true",
      GROWTH_MANUAL_GAP_FILL_ENTRYPOINT: "true",
      GROWTH_MANUAL_GAP_FILL_REQUEST_ID:
        process.env.GROWTH_MANUAL_GAP_FILL_REQUEST_ID,
      GROWTH_WORKER_RUN_ENABLED: "false",
      GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
      GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
      TELEGRAM_REPORTS_ENABLED: "false",
      GROWTH_AI_IMAGE_ENABLED: "true",
      GROWTH_GENZ_AI_IMAGE_ENABLED: "true",
      GROWTH_OPENAI_IMAGE_MODEL: "gpt-image-2",
      GROWTH_OPENAI_API_KEY: process.env.GROWTH_OPENAI_API_KEY,
      GROWTH_OPENAI_PROJECT_ID: process.env.GROWTH_OPENAI_PROJECT_ID,
      GROWTH_ROLLOUT_MODE: "OFF",
      GROWTH_MAIN_PIN_DESIGN_STYLE: "genz_editorial",
    },
  },
);
if (child.error || child.status !== 0) fail();
process.stdout.write("MANUAL_GAP_FILL_COMPLETED\n");
