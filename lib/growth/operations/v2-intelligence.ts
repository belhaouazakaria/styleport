import { learnViralNativeOutcomes } from "@/lib/growth/viral/native-learning";
import { auditPinterestReadiness } from "@/lib/growth/pinterest/account-readiness";
import { prisma } from "@/lib/prisma";
import { runAutomaticAnalyticsRecovery } from "@/lib/growth/pinterest/automatic-recovery";
import { refreshGrowthAnalyticsCoverage } from "@/lib/growth/pinterest/coverage";
import { evaluateTrackedViralPins } from "@/lib/growth/viral/analytics";
import {
  prepareViralWinnerConversions,
  reconcileViralConversions,
} from "@/lib/growth/viral/conversion";
import { collectSourceExperimentAnalytics } from "@/lib/growth/viral/source-analytics";

/** Independent stages: a notification, source or analytics outage cannot
 * suppress unrelated planning. Every failure has bounded audit evidence. */
export async function runGrowthV2Intelligence(
  now = new Date(),
  config: Record<string, string | undefined> = process.env,
) {
  const outcomes: Record<string, unknown> = {};
  const program = await prisma.growthViralProgramSettings.findUnique({
    where: { id: "global" },
    select: { mode: true },
  });
  const viralActive = program?.mode === "ACTIVE";
  const stages: [string, () => Promise<unknown>][] = [
    [
      "accountReadiness",
      () =>
        auditPinterestReadiness(
          now,
          config.GROWTH_AUTOMATIC_BOARD_SYNC_ENABLED === "true",
        ),
    ],
    [
      "analyticsCoverage",
      () =>
        refreshGrowthAnalyticsCoverage(
          now,
          config.GROWTH_AUTOMATIC_BACKFILL_ENABLED === "true",
        ),
    ],
    ...(config.GROWTH_AUTOMATIC_BACKFILL_ENABLED === "true"
      ? [
          ["analyticsRecovery", () => runAutomaticAnalyticsRecovery(now)] as [
            string,
            () => Promise<unknown>,
          ],
        ]
      : []),
    ...(config.GROWTH_SOURCE_ANALYTICS_ENABLED === "true"
      ? [
          ["sourceAnalytics", () => collectSourceExperimentAnalytics(now)] as [
            string,
            () => Promise<unknown>,
          ],
        ]
      : []),
    [
      "viralEvaluation",
      () =>
        viralActive
          ? evaluateTrackedViralPins(now)
          : Promise.resolve({ status: "PAUSED" }),
    ],
    ["winnerConversion", () => prepareViralWinnerConversions(now)],
    ["nativeCampaigns", () => reconcileViralConversions(now)],
    ["nativeLearning", () => learnViralNativeOutcomes(now)],
  ];
  for (const [name, run] of stages) {
    try {
      outcomes[name] = await run();
    } catch {
      outcomes[name] = { status: "BLOCKED" };
      const dedupeKey =
        "growth-incident:" + name + ":" + now.toISOString().slice(0, 10);
      await prisma.growthNotification.upsert({
        where: { dedupeKey },
        update: {},
        create: {
          dedupeKey,
          payload: {
            content:
              "SayTwist Growth requires attention: " +
              name +
              " was blocked. Independent stages continue. Review https://saytwist.com/admin/growth/intelligence",
            allowed_mentions: { parse: [] },
          },
        },
      });
      await prisma.growthActivity.create({
        data: {
          actorKind: "SYSTEM",
          entityType: "GrowthV2Stage",
          entityId: name,
          action: "GROWTH_V2_STAGE_BLOCKED",
          summary: { stage: name, safeToRetryReads: true },
        },
      });
    }
  }
  return outcomes;
}
