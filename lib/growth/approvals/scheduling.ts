import { Prisma } from "@prisma/client";
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
  db: Prisma.TransactionClient | typeof prisma = prisma,
  notBeforeDate = now,
) {
  const pending = await db.growthApprovalRequest.findMany({
    where: { kind: { in: ["NATIVE_PIN", "SOURCE_PIN"] }, status: "PENDING", expiresAt: { gt: now }, subjectId: { not: subjectId } },
    select: { kind: true, snapshot: true }, take: 201,
  });
  if (pending.length > 200) throw Error("REVIEW_QUEUE_TOO_LARGE");
  const reservations = pending.flatMap(r => {
    const snapshot = r.snapshot as { scheduledAt?: string } | null;
    const scheduledAt = new Date(snapshot?.scheduledAt || "");
    return Number.isFinite(scheduledAt.getTime()) ? [{ scheduledAt, kind: r.kind }] : [];
  });
  const policy = await db.growthViralProgramSettings.findUnique({
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
    if (end <= notBeforeDate) continue;
    const rotation = await readDailyRotation(day, db);
    if (policy?.mode === "ACTIVE" && rotation.accountId !== accountId) continue;
    const [native, sources] = await Promise.all([
      db.growthPinPublication.findMany({
        where: {
          scheduledAt: { gte: day, lt: end },
          status: { notIn: ["CANCELLED", "FAILED_TERMINAL"] },
        },
        select: { scheduledAt: true },
        take: 101,
      }),
      db.growthViralPinTest.findMany({
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
    const reserved = reservations.filter(r => r.scheduledAt >= day && r.scheduledAt < end);
    native.push(...reserved.filter(r => r.kind === "NATIVE_PIN").map(r => ({ scheduledAt: r.scheduledAt })));
    sources.push(...reserved.filter(r => r.kind === "SOURCE_PIN").map(r => ({ scheduledAt: r.scheduledAt })));
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
      Math.max(now.getTime() + 15 * 60000, notBeforeDate.getTime(), day.getTime()),
    );
    let timing = await recommendPublicationTiming(
      accountId,
      subjectId,
      notBefore,
      [...native, ...sources].flatMap(p => p.scheduledAt ? [{ scheduledAt: p.scheduledAt }] : []),
    );
    // Try another controlled window on the SAME day before skipping it.
    for (let attempt = 0; attempt < 8 && timing.scheduledAt < end; attempt++) {
      if (![...native, ...sources].some(p => p.scheduledAt &&
          Math.abs(p.scheduledAt.getTime() - timing.scheduledAt.getTime()) < 90 * 60000)) {
        if (timing.scheduledAt >= day) return timing.scheduledAt;
      }
      timing = await recommendPublicationTiming(accountId, subjectId,
        new Date(timing.scheduledAt.getTime() + 90 * 60000));
    }
    continue;
  }
  throw Error("REVIEW_NO_SAFE_SLOT");
}
