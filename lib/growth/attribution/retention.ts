import { GrowthJobType } from "@prisma/client";

import { enqueueGrowthJob } from "@/lib/growth/jobs";
import { prisma } from "@/lib/prisma";

export async function cleanupAttributionDetail(input?: { now?: Date; limit?: number }) {
  const now = input?.now || new Date();
  const limit = Math.min(500, Math.max(1, input?.limit || 100));
  const eventRows = await prisma.growthAttributionEvent.findMany({
    where: { retentionAt: { lte: now } },
    select: { id: true },
    orderBy: { retentionAt: "asc" },
    take: limit,
  });
  const deletedEvents = eventRows.length
    ? (await prisma.growthAttributionEvent.deleteMany({ where: { id: { in: eventRows.map(({ id }) => id) } } })).count
    : 0;

  const remaining = Math.max(0, limit - deletedEvents);
  const sessionRows = remaining ? await prisma.growthAttributionSession.findMany({
    where: { deleteAfter: { lte: now } },
    select: { id: true },
    orderBy: { deleteAfter: "asc" },
    take: remaining,
  }) : [];
  const deletedSessions = sessionRows.length
    ? (await prisma.growthAttributionSession.deleteMany({ where: { id: { in: sessionRows.map(({ id }) => id) } } })).count
    : 0;

  return { deletedEvents, deletedSessions, limit };
}

export function enqueueAttributionRetentionCleanup(now = new Date(), limit = 100) {
  const bucket = now.toISOString().slice(0, 13);
  return enqueueGrowthJob({
    type: GrowthJobType.ATTRIBUTION_RETENTION_CLEANUP,
    idempotencyKey: `attribution-retention:${bucket}`,
    payload: { limit },
  });
}
