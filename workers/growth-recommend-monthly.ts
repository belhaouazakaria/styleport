import { readFileSync } from "node:fs";
import os from "node:os";
import { prisma } from "@/lib/prisma";
import { runRecommendTrial } from "./growth-recommend-trial";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const EXPECTED_FLAGS = [
  "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
  "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
];

export function assertMonthlyRecommendationRuntime(
  env: Record<string, string | undefined>,
  release: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || release !== sha ||
      env.GROWTH_MONTHLY_RECOMMEND_APPROVAL !== "SAYTWIST_MONTHLY_RECOMMEND:" + sha ||
      env.GROWTH_MONTHLY_RECOMMEND_ENTRYPOINT !== "true" ||
      env.NODE_ENV !== "production") throw Error("RELEASE_OR_APPROVAL");
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("HOST_IDENTITY");
  if (now.getUTCDate() !== 1 || now.getUTCHours() !== 15 ||
      now.getUTCMinutes() >= 15) throw Error("MONTHLY_WINDOW_INVALID");
  if (EXPECTED_FLAGS.some(flag => env[flag] === "true") ||
      env.GROWTH_ROLLOUT_MODE === "OBSERVE" ||
      env.GROWTH_ROLLOUT_MODE === "RECOMMEND") throw Error("AUTOMATION_NOT_OFF");
  let target: URL;
  try { target = new URL(env.DATABASE_URL || ""); }
  catch { throw Error("DB_TARGET"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      target.hostname !== "127.0.0.1" || target.port !== "5433" ||
      decodeURIComponent(target.pathname.slice(1)) !== "saytwist" ||
      target.searchParams.has("host") || !target.username) throw Error("DB_TARGET");
  return sha;
}

async function main() {
  try {
    const sha = assertMonthlyRecommendationRuntime(
      process.env, readFileSync(".deployed-release", "utf8").trim(),
      {
        username: os.userInfo().username,
        uid: process.getuid?.() ?? -1,
        cwd: process.cwd(),
        node: process.execPath,
      },
    );
    const result = await runRecommendTrial(sha, true);
    if (result.job !== "SUCCEEDED" || result.growth !== "OFF" ||
        result.lease !== "NONE" || result.activeQueue !== 0) throw Error();
    console.log("GROWTH_MONTHLY_RECOMMEND=PASSED");
    console.log("GROWTH_MONTHLY_RECOMMEND_JOB=SUCCEEDED");
    console.log("GROWTH_MONTHLY_RECOMMEND_GROWTH=OFF");
    console.log("GROWTH_MONTHLY_RECOMMEND_LEASE=NONE");
    console.log("GROWTH_MONTHLY_RECOMMEND_PROVIDER_CALLS=0");
    console.log("GROWTH_MONTHLY_RECOMMEND_AI_CALLS=0");
    console.log("GROWTH_MONTHLY_RECOMMEND_PUBLICATIONS=0");
  } catch {
    console.error("GROWTH_MONTHLY_RECOMMEND=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_MONTHLY_RECOMMEND_ENTRYPOINT === "true") void main();
