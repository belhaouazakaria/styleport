import { GrowthActivityActorKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toSafeGrowthSummary } from "@/lib/growth/safe-data";

type PrismaExecutor = Pick<typeof prisma, "growthActivity">;

export async function recordGrowthActivity(
  input: {
    actorKind: GrowthActivityActorKind;
    actorUserId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    fromState?: string | null;
    toState?: string | null;
    summary?: unknown;
    correlationKey?: string | null;
  },
  db: PrismaExecutor = prisma,
) {
  return db.growthActivity.create({
    data: {
      actorKind: input.actorKind,
      actorUserId: input.actorUserId || null,
      entityType: input.entityType.slice(0, 80),
      entityId: input.entityId.slice(0, 191),
      action: input.action.slice(0, 100),
      fromState: input.fromState?.slice(0, 80) || null,
      toState: input.toState?.slice(0, 80) || null,
      summary: toSafeGrowthSummary(input.summary) as Prisma.InputJsonValue | undefined,
      correlationKey: input.correlationKey?.slice(0, 191) || null,
    },
  });
}
