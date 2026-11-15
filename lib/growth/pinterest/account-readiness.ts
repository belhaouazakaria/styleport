import { hasPinterestMaintenanceCapacity } from "./global-budget";
import { prisma } from "@/lib/prisma";
import { syncPinterestBoards } from "./sync";
import { hasPinterestScopes, PINTEREST_CREATE_PIN_SCOPES } from "./config";

function healthOf(
  account: {
    connectionStatus: string;
    grantedScopes: string[];
    refreshTokenExpiresAt: Date | null;
    boards: { id: string }[];
  },
  now: Date,
) {
  return account.connectionStatus === "DEGRADED"
    ? "READ_RECOVERY_NEEDED"
    : account.connectionStatus !== "CONNECTED"
      ? "AUTHORIZATION_REQUIRED"
      : !hasPinterestScopes(account.grantedScopes, PINTEREST_CREATE_PIN_SCOPES)
        ? "MISSING_SCOPES"
        : account.refreshTokenExpiresAt && account.refreshTokenExpiresAt <= now
          ? "TOKEN_EXPIRED"
          : !account.boards.length
            ? "NO_SYNCHRONIZED_BOARDS"
            : "READY";
}

export async function auditPinterestReadiness(
  now = new Date(),
  synchronize = false,
) {
  const accounts = await prisma.growthPinterestAccount.findMany({
    where: { apiEnvironment: "PRODUCTION" },
    include: { boards: { where: { isActive: true }, select: { id: true } } },
    orderBy: [{ lastBoardSyncAt: "asc" }, { id: "asc" }],
    take: 3,
  });
  let synchronized = false;
  let quotaDeferred = false;
  const evidence = [];
  for (const account of accounts) {
    let health = healthOf(account, now);
    if (
      synchronize &&
      !synchronized &&
      ["CONNECTED", "DEGRADED"].includes(account.connectionStatus) &&
      account.grantedScopes.includes("boards:read") &&
      (account.connectionStatus === "DEGRADED" ||
        !account.lastBoardSyncAt ||
        account.lastBoardSyncAt.getTime() < now.getTime() - 24 * 3600000)
    ) {
      // Official complete-only inventory synchronization. No board creation.
      if (await hasPinterestMaintenanceCapacity(prisma, now)) {
        await syncPinterestBoards(account.id);
        synchronized = true;
        const refreshed = await prisma.growthPinterestAccount.findUniqueOrThrow(
          {
            where: { id: account.id },
            include: {
              boards: { where: { isActive: true }, select: { id: true } },
            },
          },
        );
        Object.assign(account, refreshed);
        health = healthOf(account, now);
      } else quotaDeferred = true;
    }
    evidence.push({
      accountId: account.id,
      role: account.publicationRole,
      health,
      activeBoards: account.boards.length,
      lastBoardSyncAt: account.lastBoardSyncAt?.toISOString() ?? null,
      newBoardsCreated: 0,
    });
  }
  return { accounts: evidence, synchronized, quotaDeferred };
}
