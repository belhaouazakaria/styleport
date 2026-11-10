import {
  GrowthPublicationStatus, Prisma,
} from "@prisma/client";
import {
  planViralPortfolio,
} from "@/lib/growth/viral/portfolio";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { assertActiveRotationAccount } from "@/lib/growth/portfolio/daily-rotation";

const AUTHORIZED_MAX_DAILY_PINS = 5;
export const VIRAL_PORTFOLIO_APPROVAL_LOCK =
  "growth-viral-portfolio-approval-v1";

export function utcPinScheduleWindow(date: Date) {
  if (!Number.isFinite(date.getTime())) throw Error("VIRAL_PIN_SCHEDULE_INVALID");
  const start = new Date(Date.UTC(
    date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
  ));
  return { start, end: new Date(start.getTime() + 86400000) };
}

/** Call inside an existing DB transaction AFTER taking the shared viral
 * portfolio advisory lock. Enforces one total quota across ordinary SayTwist
 * publications and source-linked experiments. Source policy defaults PAUSED
 * and has no effect on the preexisting publisher until owner turns ACTIVE.
 */
export async function assertViralPortfolioApproval(
  tx: Prisma.TransactionClient,
  channel: "SOURCE" | "SAYTWIST",
  scheduledAt: Date,
  accountId: string,
) {
  const policy = await tx.growthViralProgramSettings.findUnique({
    where: { id: "global" },
  });
  if (!policy || policy.mode !== "ACTIVE") {
    if (channel === "SOURCE") throw Error("SOURCE_PIN_PROGRAM_NOT_ACTIVE");
    return { enabled: false, sourceAllowed: 0, saytwistAllowed: 0 };
  }
  const rotation = await readDailyRotation(scheduledAt, tx);
  assertActiveRotationAccount(rotation, accountId);
  const dailyLimit = Math.min(AUTHORIZED_MAX_DAILY_PINS, rotation.targetPins);
  const { start, end } = utcPinScheduleWindow(scheduledAt);
  const [saytwistCommitted, sourceCommitted] = await Promise.all([
    tx.growthPinPublication.count({
      where: {
        scheduledAt: { gte: start, lt: end },
        status: { notIn: [
          GrowthPublicationStatus.CANCELLED,
          GrowthPublicationStatus.FAILED_TERMINAL,
        ] },
      },
    }),
    tx.growthViralPinTest.count({
      where: {
        channel: "SOURCE", scheduledAt: { gte: start, lt: end },
        status: { in: ["APPROVED","PUBLISHING","OUTCOME_UNKNOWN","PUBLISHED"] },
      },
    }),
  ]);
  const committed = saytwistCommitted + sourceCommitted;
  const plan = planViralPortfolio({
    mode: "ACTIVE", sourceSharePercent: policy.sourceSharePercent,
    maxPinsPerDay: Math.min(policy.maxPinsPerDay, dailyLimit),
  }, {
    day: start.toISOString().slice(0, 10),
    saytwistCommitted, sourceCommitted,
    hardDailyPinCap: dailyLimit,
    remainingProviderPublicationCapacity:
      Math.max(0, dailyLimit - committed),
    originalConceptsQualified: 1, sourceConceptsQualified: 1,
    sourcePublishingRightsVerified: true,
  });
  const allowed = channel === "SOURCE" ?
    plan.additional.source : plan.additional.saytwist;
  if (allowed !== 1) throw Error("VIRAL_CHANNEL_QUOTA_EXHAUSTED");
  return { enabled: true, sourceAllowed: plan.target.source,
    saytwistAllowed: plan.target.saytwist };
}
