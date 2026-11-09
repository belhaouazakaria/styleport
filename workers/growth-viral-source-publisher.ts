import { readFileSync } from "node:fs";
import os from "node:os";
import { prisma } from "@/lib/prisma";
import { publishOneApprovedSourcePin } from "@/lib/growth/viral/source-publisher";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const ALLOWED = new Set(["IDLE","PUBLISHED","FAILED_PRE_REQUEST","OUTCOME_UNKNOWN"]);

export function assertViralSourceRuntime(env: NodeJS.ProcessEnv, now = new Date()) {
  const sha = env.EXPECTED_RELEASE || "";
  if (!/^[a-f0-9]{40}$/.test(sha) ||
      env.GROWTH_VIRAL_SOURCE_ENTRYPOINT !== "true" ||
      env.GROWTH_VIRAL_SOURCE_ENABLED !== "true" ||
      env.GROWTH_VIRAL_SOURCE_APPROVAL !== "SAYTWIST_VIRAL_SOURCE:" + sha ||
      env.GROWTH_WORKER_RUN_ENABLED !== "false" ||
      env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.GROWTH_AI_IMAGE_ENABLED !== "false" ||
      env.GROWTH_ATTRIBUTION_COLLECTION_ENABLED !== "false" ||
      env.TELEGRAM_REPORTS_ENABLED !== "false" ||
      env.APP_BASE_URL !== "https://saytwist.com" ||
      env.PINTEREST_API_ENVIRONMENT !== "production" ||
      env.NODE_ENV !== "production" ||
      now.getUTCHours() < 15 || now.getUTCHours() >= 24 ||
      now.getUTCMinutes() > 45) throw Error("VIRAL_SOURCE_RUNTIME_INVALID");
  const url = new URL(env.DATABASE_URL || "");
  if (!["postgres:","postgresql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5433" ||
      decodeURIComponent(url.pathname.slice(1)) !== "saytwist" ||
      url.searchParams.has("host") || !url.username ||
      readFileSync(APP + "/.deployed-release", "utf8").trim() !== sha ||
      process.cwd() !== APP || os.userInfo().username !== "saytwist" ||
      process.getuid?.() === 0 || process.execPath !== NODE) {
    throw Error("VIRAL_SOURCE_HOST_INVALID");
  }
  return sha;
}

async function main() {
  try {
    assertViralSourceRuntime(process.env);
    const status = await publishOneApprovedSourcePin();
    if (!ALLOWED.has(status)) throw Error("VIRAL_SOURCE_UNEXPECTED_RESULT");
    const global = await prisma.growthSettings.findUnique({
      where: { id: "global" },
      select: { enabled: true, attributionEnabled: true,
        workerActivationExpiresAt: true },
    });
    if (!global || global.enabled || global.attributionEnabled ||
        global.workerActivationExpiresAt) throw Error("VIRAL_SOURCE_POSTCONDITION");
    console.log("GROWTH_VIRAL_SOURCE=" + status);
    console.log("GROWTH_VIRAL_SOURCE_GROWTH=OFF");
    console.log("GROWTH_VIRAL_SOURCE_AI_CALLS=0");
  } catch {
    console.error("GROWTH_VIRAL_SOURCE=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (require.main === module) void main();
