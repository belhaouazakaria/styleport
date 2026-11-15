import { prisma } from "@/lib/prisma";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { recommendPublicationTiming } from "@/lib/growth/publishing/service";

/** Recommendations consume no quota. Approval atomically rechecks all caps.
 * Account and destination are fixed before offering the review. */
export async function recommendReviewSchedule(
  accountId: string,
  subjectId: string,
  channel: "NATIVE" | "SOURCE",
  now = new Date(),
) {
  const policy = await prisma.growthViralProgramSettings.findUnique({
    where: { id: "global" },
  });
  for (let offset = 0; offset < 30; offset++) {
    const day = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + offset,
      ),
    );
    const end = new Date(day.getTime() + 86400000);
    const rotation = await readDailyRotation(day);
    if (policy?.mode === "ACTIVE" && rotation.accountId !== accountId) continue;
    const [native, sources] = await Promise.all([
      prisma.growthPinPublication.findMany({
        where: {
          scheduledAt: { gte: day, lt: end },
          status: { notIn: ["CANCELLED", "FAILED_TERMINAL"] },
        },
        select: { scheduledAt: true },
        take: 101,
      }),
      prisma.growthViralPinTest.findMany({
        where: {
          scheduledAt: { gte: day, lt: end },
          status: {
            in: ["APPROVED", "PUBLISHING", "OUTCOME_UNKNOWN", "PUBLISHED"],
          },
        },
        select: { scheduledAt: true },
        take: 101,
      }),
    ]);
    const cap = Math.min(
      5,
      policy?.maxPinsPerDay ?? 5,
      rotation.targetPins || 5,
    );
    const channelCount = channel === "SOURCE" ? sources.length : native.length;
    const channelCap =
      policy?.mode === "ACTIVE"
        ? channel === "SOURCE"
          ? rotation.source
          : rotation.original
        : cap;
    if (native.length + sources.length >= cap || channelCount >= channelCap)
      continue;
    const notBefore = new Date(
      Math.max(now.getTime() + 15 * 60000, day.getTime()),
    );
    const timing = await recommendPublicationTiming(
      accountId,
      subjectId,
      notBefore,
    );
    if (timing.scheduledAt < day || timing.scheduledAt >= end) continue;
    if (
      [...native, ...sources].some(
        (p) =>
          p.scheduledAt &&
          Math.abs(p.scheduledAt.getTime() - timing.scheduledAt.getTime()) <
            90 * 60000,
      )
    )
      continue;
    return timing.scheduledAt;
  }
  throw Error("REVIEW_NO_SAFE_SLOT");
}
