import { Prisma } from "@prisma/client";

/** Must run under the shared portfolio approval lock, across both channels. */
export async function assertPublicationSpacing(tx: Prisma.TransactionClient, scheduledAt: Date) {
  const window = { gt: new Date(scheduledAt.getTime() - 90 * 60000),
    lt: new Date(scheduledAt.getTime() + 90 * 60000) };
  const [native, source] = await Promise.all([
    tx.growthPinPublication.count({ where: { scheduledAt: window,
      status: { notIn: ["CANCELLED", "FAILED_TERMINAL"] } } }),
    tx.growthViralPinTest.count({ where: { scheduledAt: window,
      status: { in: ["APPROVED", "PUBLISHING", "OUTCOME_UNKNOWN", "PUBLISHED"] } } }),
  ]);
  if (native || source) throw Error("REVIEW_SCHEDULE_COLLISION");
}
