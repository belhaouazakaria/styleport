import { prisma } from "@/lib/prisma";
import { syncPinterestBoards } from "./sync";
import { hasPinterestScopes, PINTEREST_CREATE_PIN_SCOPES } from "./config";

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
  const evidence = [];
  for (const account of accounts) {
    const health =
      account.connectionStatus !== "CONNECTED"
        ? "AUTHORIZATION_REQUIRED"
        : !hasPinterestScopes(
              account.grantedScopes,
              PINTEREST_CREATE_PIN_SCOPES,
            )
          ? "MISSING_SCOPES"
          : account.refreshTokenExpiresAt &&
              account.refreshTokenExpiresAt <= now
            ? "TOKEN_EXPIRED"
            : !account.boards.length
              ? "NO_SYNCHRONIZED_BOARDS"
              : "READY";
    if (
      synchronize &&
      !synchronized &&
      account.connectionStatus === "CONNECTED" &&
      account.grantedScopes.includes("boards:read") &&
      (!account.lastBoardSyncAt ||
        account.lastBoardSyncAt.getTime() < now.getTime() - 24 * 3600000)
    ) {
      // Official complete-only inventory synchronization. No board creation.
      await syncPinterestBoards(account.id);
      synchronized = true;
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
  return { accounts: evidence, synchronized };
}
