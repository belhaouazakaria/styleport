/**
 * Daily read-only Google collector (GA4 + Search Console). Runs from the app
 * user's crontab, independent of the release-pinned Growth timers. It never
 * writes to Google, Pinterest or any Growth workflow state.
 *
 *   npx tsx workers/google-analytics-collector.ts [--backfill]
 */
import { synchronizeGoogleAnalytics } from "@/lib/growth/google/sync";
import { collectGoogleInsights } from "@/lib/growth/google/insights";
import { prisma } from "@/lib/prisma";

async function main() {
  const backfill = process.argv.includes("--backfill");
  const now = new Date();
  const basic = await synchronizeGoogleAnalytics(now, process.env);
  const insights = await collectGoogleInsights(now, process.env, { days: backfill ? 28 : 3 });
  console.log(JSON.stringify({ at: now.toISOString(), basic, insights }));
  if (insights.errors.length) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error("GOOGLE_COLLECTOR_FAILED", error instanceof Error ? error.message : "error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
