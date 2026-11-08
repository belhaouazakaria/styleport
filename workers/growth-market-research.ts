import { readFileSync } from "node:fs";
import os from "node:os";

import { getGrowthCadencePolicy } from "@/lib/growth/portfolio/cadence-settings";
import { planProactiveMarketResearch } from "@/lib/growth/market-research/cadence";
import { evaluateAndArchiveMarketTrends } from "@/lib/growth/market-research/gaps";
import { fetchAuthorizedPinterestMarketTrends } from "@/lib/growth/market-research/pinterest-trends";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { prisma } from "@/lib/prisma";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const ACTION = "MARKET_DISCOVERY_REVIEW_READY";
const ENTITY = "GrowthMarketResearch";

/** A source-only, owner-opt-in daily research decision. Never enables Growth. */
export function assertScheduledMarketResearchRuntime(
  env: Record<string, string | undefined>,
  release: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  const day = env.GROWTH_MARKET_RESEARCH_DAY || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || release !== sha ||
      !Number.isFinite(now.getTime()) ||
      day !== now.toISOString().slice(0, 10) ||
      env.NODE_ENV !== "production" ||
      env.GROWTH_MARKET_RESEARCH_ENABLED !== "true" ||
      env.GROWTH_PINTEREST_TRENDS_ACCESS_APPROVED !== "true" ||
      env.GROWTH_MARKET_RESEARCH_APPROVAL !== "SAYTWIST_MARKET_RESEARCH:" + sha ||
      !(now.getUTCHours() === 5 && now.getUTCMinutes() >= 10 &&
        now.getUTCMinutes() < 25)) throw Error("MARKET_RELEASE_OR_APPROVAL_INVALID");
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) {
    throw Error("MARKET_IDENTITY_INVALID");
  }
  if (env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.PINTEREST_API_ENVIRONMENT !== "production" ||
      env.APP_BASE_URL !== "https://saytwist.com") {
    throw Error("MARKET_SCOPE_INVALID");
  }
  for (const key of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "GROWTH_AI_IMAGE_ENABLED",
  ]) if (env[key] !== "false") throw Error("MARKET_OTHER_AUTOMATION_INVALID");
  let db: URL;
  try { db = new URL(env.DATABASE_URL || ""); }
  catch { throw Error("MARKET_DB_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.hostname !== "127.0.0.1" || db.port !== "5433" ||
      decodeURIComponent(db.pathname.slice(1)) !== "saytwist" ||
      db.searchParams.has("host") || !db.username) throw Error("MARKET_DB_INVALID");
  return { sha, day };
}

/** Never assumes an API permission or available quota from an internal signal. */
export async function runScheduledMarketResearch(now = new Date()) {
  const [settings, blocking, cadence, last, qualified] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true,
        workerActivationExpiresAt: true } }),
    countBlockingGrowthJobs(prisma),
    getGrowthCadencePolicy(),
    prisma.growthActivity.findFirst({
      where: { entityType: ENTITY, entityId: "US:growing", action: ACTION },
      orderBy: { createdAt: "desc" }, select: { createdAt: true },
    }),
    prisma.growthOpportunity.count({ where: {
      status: "OPEN", evidenceQuality: "KNOWN", 
      analysisRun: { is: { completedAt: {
        gte: new Date(now.getTime() - 48 * 60 * 60_000),
      } } },
    } }),
  ]);
  if (!settings || settings.enabled || settings.attributionEnabled ||
      settings.workerActivationExpiresAt !== null || blocking !== 0) {
    throw Error("MARKET_GROWTH_NOT_IDLE");
  }
  if (cadence.pinCreatives.mode === "PAUSED" &&
      cadence.translatorCreates.mode === "PAUSED") {
    return { status: "OWNER_PAUSED" as const, inspected: 0, proposals: 0 };
  }
  const plan = planProactiveMarketResearch({
    now, lastCompletedScanAt: last?.createdAt || null,
    internalEligibleOpportunities: qualified,
    desiredDailyCandidateMinimum: Math.max(
      cadence.pinCreatives.minimum, cadence.translatorCreates.minimum),
    // Permission and admission are also independently enforced by the
    // network adapter and the rolling 24h DB reservation.
    approvedSourceAvailable: true,
    conservativePinterestBudgetAvailable: true,
  });
  if (plan.decision !== "RESEARCH_DUE") {
    return { status: plan.decision as "NOT_DUE" | "BLOCKED", inspected: 0, proposals: 0 };
  }
  const trends = await fetchAuthorizedPinterestMarketTrends({ now });
  const report = await evaluateAndArchiveMarketTrends(trends, now);
  const post = await prisma.growthSettings.findUnique({ where: { id: "global" },
    select: { enabled: true, attributionEnabled: true,
      workerActivationExpiresAt: true } });
  if (!post || post.enabled || post.attributionEnabled ||
      post.workerActivationExpiresAt !== null) {
    throw Error("MARKET_POSTCONDITION_INVALID");
  }
  return {
    status: "RESEARCHED" as const,
    inspected: report.inspected, proposals: report.signals.length,
  };
}

async function main() {
  try {
    assertScheduledMarketResearchRuntime(
      process.env,
      readFileSync(APP + "/.deployed-release", "utf8").trim(),
      { username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath },
    );
    const result = await runScheduledMarketResearch();
    console.log("GROWTH_MARKET_RESEARCH=" + result.status);
    console.log("GROWTH_MARKET_RESEARCH_INSPECTED=" + result.inspected);
    console.log("GROWTH_MARKET_RESEARCH_PROPOSALS=" + result.proposals);
    console.log("GROWTH_MARKET_RESEARCH_PIN_WRITES=0");
    console.log("GROWTH_MARKET_RESEARCH_AI_CALLS=0");
    console.log("GROWTH_MARKET_RESEARCH_GROWTH=OFF");
  } catch {
    console.error("GROWTH_MARKET_RESEARCH=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_MARKET_RESEARCH_ENTRYPOINT === "true") void main();
