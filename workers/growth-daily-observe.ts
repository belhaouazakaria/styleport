import { readFileSync } from "node:fs";
import os from "node:os";

import { prisma } from "@/lib/prisma";
import { runOneAccountSync } from "./growth-one-account-sync";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";

export function assertDailyObserveRuntime(
  env: Record<string, string | undefined>,
  deployedSha: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  const day = env.GROWTH_DAILY_OBSERVE_DATE || "";
  const mode = env.GROWTH_DAILY_OBSERVE_MODE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployedSha ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      day !== now.toISOString().slice(0, 10) ||
      !["TRIAL", "SCHEDULED"].includes(mode) ||
      env.NODE_ENV !== "production") throw Error("RELEASE_OR_DATE_INVALID");
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("IDENTITY_INVALID");
  for (const key of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
  ]) if (env[key] === "true") throw Error("AUTOMATION_NOT_OFF");
  if (["OBSERVE", "RECOMMEND"].includes(env.GROWTH_ROLLOUT_MODE || "")) {
    throw Error("ROLLOUT_NOT_OFF");
  }
  const expectedApproval = mode === "TRIAL"
    ? "RUN SAYTWIST GROWTH DAILY OBSERVE TRIAL " + sha
    : "SAYTWIST_DAILY_OBSERVE_SCHEDULED:" + sha;
  if (env.GROWTH_DAILY_OBSERVE_APPROVAL !== expectedApproval) {
    throw Error("APPROVAL_INVALID");
  }
  // Scheduled runs can only start in this 10-minute UTC window.
  // Manual trials are separately GitHub owner-approved and may run anytime.
  if (mode === "SCHEDULED" &&
      !(now.getUTCHours() === 23 && now.getUTCMinutes() >= 50)) {
    throw Error("OUTSIDE_SCHEDULED_WINDOW");
  }
  let target: URL;
  try { target = new URL(env.DATABASE_URL || ""); }
  catch { throw Error("DATABASE_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      target.hostname !== "127.0.0.1" || target.port !== "5433" ||
      decodeURIComponent(target.pathname.slice(1)) !== "saytwist" ||
      target.searchParams.has("host") || !target.username) {
    throw Error("DATABASE_INVALID");
  }
  return { sha, day, mode };
}

async function main() {
  let stage = "RUNTIME";
  try {
    const { sha, day } = assertDailyObserveRuntime(process.env,
      readFileSync(".deployed-release", "utf8").trim(), {
        username: os.userInfo().username,
        uid: process.getuid?.() ?? -1, cwd: process.cwd(),
        node: process.execPath,
      });
    stage = "ONE_ACCOUNT_GET";
    const result = await runOneAccountSync(sha, { dailyUtcDate: day });
    console.log("GROWTH_DAILY_OBSERVE=PASSED");
    console.log("GROWTH_DAILY_OBSERVE_JOB=" + result.job);
    console.log("GROWTH_DAILY_OBSERVE_GROWTH=" + result.growth);
    console.log("GROWTH_DAILY_OBSERVE_LEASE=" + result.lease);
    console.log("GROWTH_DAILY_OBSERVE_ACTIVE_QUEUE=" + result.activeQueue);
    console.log("GROWTH_DAILY_OBSERVE_PROVIDER_GETS=" + result.providerGets);
    console.log("GROWTH_DAILY_OBSERVE_PROVIDER_WRITES=" + result.providerWrites);
    console.log("GROWTH_DAILY_OBSERVE_AI_CALLS=" + result.aiCalls);
    console.log("GROWTH_DAILY_OBSERVE_TELEGRAM=" + result.telegram);
  } catch (error) {
    // Classify only a literal known safety rejection. Never log raw exceptions.
    const reason = error instanceof Error &&
      error.message === "PINTEREST_ONE_SYNC_24H_BUDGET_EXHAUSTED"
      ? "24H_RESERVATION" : "OTHER";
    console.error("GROWTH_DAILY_OBSERVE=BLOCKED");
    console.error("GROWTH_DAILY_OBSERVE_REASON=" + reason);
    console.error("GROWTH_DAILY_OBSERVE_STAGE=" + stage);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}

if (process.env.GROWTH_DAILY_OBSERVE_ENTRYPOINT === "true") void main();
