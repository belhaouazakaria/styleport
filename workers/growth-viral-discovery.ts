import { readFileSync } from "node:fs";
import os from "node:os";

import { prisma } from "@/lib/prisma";
import { scanViralSourceCatalog } from "@/lib/growth/viral/store";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";

/** One review-only, fixed-source scan per UTC day, never a generic Growth worker. */
export function assertViralDiscoveryRuntime(
  env: Record<string, string | undefined>, deployedSha: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE ?? "";
  const day = now.toISOString().slice(0, 10);
  if (!/^[a-f0-9]{40}$/.test(sha) || deployedSha !== sha ||
      env.NODE_ENV !== "production" ||
      env.GROWTH_VIRAL_DISCOVERY_ENTRYPOINT !== "true" ||
      env.GROWTH_VIRAL_DISCOVERY_ENABLED !== "true" ||
      env.GROWTH_VIRAL_DISCOVERY_APPROVAL !== "SAYTWIST_VIRAL_DISCOVERY:" + sha ||
      env.GROWTH_VIRAL_DISCOVERY_DATE !== day ||
      now.getUTCHours() !== 8 || now.getUTCMinutes() < 15 ||
      now.getUTCMinutes() >= 30) throw Error("DISCOVERY_RELEASE_OR_WINDOW_INVALID");
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) throw Error("DISCOVERY_IDENTITY_INVALID");
  if (env.GROWTH_WORKER_RUN_ENABLED !== "false" ||
      env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.GROWTH_AI_IMAGE_ENABLED !== "false" ||
      env.GROWTH_ATTRIBUTION_COLLECTION_ENABLED !== "false" ||
      env.TELEGRAM_REPORTS_ENABLED !== "false" ||
      env.GROWTH_DAILY_REPORT_SCHEDULE_ENABLED !== "false") {
    throw Error("DISCOVERY_CONFLICTING_AUTOMATION");
  }
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ""); }
  catch { throw Error("DISCOVERY_DATABASE_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5433" ||
      decodeURIComponent(url.pathname.slice(1)) !== "saytwist" ||
      !url.username || url.searchParams.has("host")) {
    throw Error("DISCOVERY_DATABASE_INVALID");
  }
  return { sha, day };
}

async function assertSafeDatabaseState() {
  const [growth, viral] = await Promise.all([
    prisma.growthSettings.findUnique({ where: { id: "global" },
      select: { enabled: true, attributionEnabled: true,
        workerActivationExpiresAt: true } }),
    prisma.growthViralProgramSettings.findUnique({ where: { id: "global" },
      select: { mode: true } }),
  ]);
  if (!growth || growth.enabled || growth.attributionEnabled ||
      growth.workerActivationExpiresAt !== null || viral?.mode !== "REVIEW") {
    throw Error("DISCOVERY_DATABASE_NOT_REVIEW_ONLY");
  }
}

/**
 * The existing catalog scan supplies the advisory lock, single UTC-day
 * reservation, robots check, request/byte limits, ranking and audit trail.
 * A previously reserved scan is successful no-op work, not a retry.
 */
export async function runDailyViralDiscovery(now = new Date()) {
  await assertSafeDatabaseState();
  let outcome: "SCANNED" | "ALREADY_RESERVED" = "SCANNED";
  let result: Awaited<ReturnType<typeof scanViralSourceCatalog>> | null = null;
  try {
    result = await scanViralSourceCatalog(now);
  } catch (error) {
    if (error instanceof Error && error.message === "VIRAL_SOURCE_ALREADY_SCANNED_TODAY") {
      outcome = "ALREADY_RESERVED";
    } else {
      throw error;
    }
  }
  await assertSafeDatabaseState();
  return { outcome, inspected: result?.inspected ?? 0,
    created: result?.created ?? 0, published: 0, aiCalls: 0 };
}

async function main() {
  try {
    const now = new Date();
    assertViralDiscoveryRuntime(process.env,
      readFileSync(".deployed-release", "utf8").trim(), {
        username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath,
      }, now);
    const result = await runDailyViralDiscovery(now);
    console.log("GROWTH_VIRAL_DISCOVERY=" + result.outcome);
    console.log("GROWTH_VIRAL_DISCOVERY_INSPECTED=" + result.inspected);
    console.log("GROWTH_VIRAL_DISCOVERY_CREATED=" + result.created);
    console.log("GROWTH_VIRAL_DISCOVERY_PIN_WRITES=0");
    console.log("GROWTH_VIRAL_DISCOVERY_AI_CALLS=0");
    console.log("GROWTH_VIRAL_DISCOVERY_GROWTH=OFF");
  } catch {
    console.error("GROWTH_VIRAL_DISCOVERY=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_VIRAL_DISCOVERY_ENTRYPOINT === "true") void main();
