import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  planDailyRotation, type DailyRotationPlan, type RotationRole,
} from "@/lib/growth/portfolio/daily-rotation";

type AccountReader = Pick<Prisma.TransactionClient, "growthPinterestAccount">;

/**
 * The three named portfolio roles are stable. Never rotate to sandbox,
 * disconnected, no-credentials, no-write-scope or no-active-board accounts.
 */
export async function readDailyRotation(
  date: Date,
  tx: AccountReader = prisma,
): Promise<DailyRotationPlan> {
  if (!Number.isFinite(date.getTime())) throw Error("ROTATION_DAY_INVALID");
  const rows = await tx.growthPinterestAccount.findMany({
    where: {
      apiEnvironment: "PRODUCTION",
      connectionStatus: "CONNECTED",
      encryptedCredentials: { not: null },
      grantedScopes: { hasEvery: [
        "pins:read", "pins:write", "boards:read", "boards:write",
      ] },
      boards: { some: { isActive: true } },
    },
    select: { id: true, activeRole: true, publicationRole: true },
    take: 4, // More than three active slots is a fail-closed configuration error.
  });
  return planDailyRotation(date.toISOString().slice(0, 10), rows.map(row => ({
    id: row.id,
    role: (row.activeRole ?? row.publicationRole) as RotationRole,
    connected: true,
    hasWritableBoard: true,
  })));
}
