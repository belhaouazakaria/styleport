
import { GrowthActivityActorKind, GrowthPinterestConnectionStatus } from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { getPinterestBoardsPage, getPinterestUserAccount } from "@/lib/growth/pinterest/api";
import { toSafeGrowthError } from "@/lib/growth/safe-data";
import { prisma } from "@/lib/prisma";

const MAX_BOARD_PAGES = 10;
const MAX_BOARD_COUNT = 1_000;

export async function syncPinterestAccount(accountId: string, fetchImpl?: typeof fetch) {
  try {
    const { data } = await getPinterestUserAccount(accountId, fetchImpl);
    const now = new Date();
    const account = await prisma.$transaction(async (tx) => {
      const updated = await tx.growthPinterestAccount.update({ where: { id: accountId }, data: {
        pinterestAccountId: data.id,
        username: data.username,
        businessName: data.business_name || null,
        profileImageUrl: data.profile_image || null,
        websiteUrl: data.website_url || null,
        pinterestAccountType: data.account_type || null,
        connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
        lastAccountSyncAt: now,
        lastSuccessfulApiCallAt: now,
        lastConnectionError: null,
      } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER,
        entityType: "GrowthPinterestAccount", entityId: accountId, action: "PINTEREST_ACCOUNT_SYNC_COMPLETED",
        summary: { username: data.username, accountType: data.account_type || null },
      }, tx);
      return updated;
    });
    return { accountId: account.id, username: account.username };
  } catch (error) {
    await recordSyncFailure(accountId, "PINTEREST_ACCOUNT_SYNC_FAILED", error);
    throw error;
  }
}

export async function syncPinterestBoards(accountId: string, fetchImpl?: typeof fetch) {
  const boards: Array<{ id: string; name: string; description?: string | null; privacy?: string | null; owner?: { username?: string } | null }> = [];
  const seenBookmarks = new Set<string>();
  let bookmark: string | undefined;
  try {
    for (let page = 0; page < MAX_BOARD_PAGES; page += 1) {
      const response = await getPinterestBoardsPage(accountId, bookmark, fetchImpl);
      boards.push(...response.data.items);
      if (boards.length > MAX_BOARD_COUNT) throw new Error("Pinterest board synchronization exceeded the 1000-board safety limit.");
      const next = response.data.bookmark || undefined;
      if (!next) break;
      if (seenBookmarks.has(next)) throw new Error("Pinterest board pagination repeated a bookmark.");
      seenBookmarks.add(next);
      bookmark = next;
      if (page === MAX_BOARD_PAGES - 1) throw new Error("Pinterest board synchronization exceeded the page safety limit.");
    }
    const syncedAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const board of boards) {
        await tx.growthPinterestBoard.upsert({
          where: { accountId_pinterestBoardId: { accountId, pinterestBoardId: board.id } },
          create: {
            accountId, pinterestBoardId: board.id, name: board.name,
            description: board.description || null, privacy: board.privacy || null,
            ownerUsername: board.owner?.username || null, isActive: true,
            lastSeenAt: syncedAt, lastSyncedAt: syncedAt,
          },
          update: {
            name: board.name, description: board.description || null, privacy: board.privacy || null,
            ownerUsername: board.owner?.username || null, isActive: true,
            lastSeenAt: syncedAt, lastSyncedAt: syncedAt,
          },
        });
      }
      await tx.growthPinterestBoard.updateMany({
        where: { accountId, lastSeenAt: { lt: syncedAt }, isActive: true },
        data: { isActive: false, lastSyncedAt: syncedAt },
      });
      await tx.growthPinterestAccount.update({ where: { id: accountId }, data: {
        lastBoardSyncAt: syncedAt, lastSuccessfulApiCallAt: syncedAt,
        connectionStatus: GrowthPinterestConnectionStatus.CONNECTED, lastConnectionError: null,
      } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER,
        entityType: "GrowthPinterestAccount", entityId: accountId, action: "PINTEREST_BOARD_SYNC_COMPLETED",
        summary: { boardCount: boards.length, pageCount: seenBookmarks.size + 1 },
      }, tx);
    });
    return { accountId, boardCount: boards.length };
  } catch (error) {
    await recordSyncFailure(accountId, "PINTEREST_BOARD_SYNC_FAILED", error);
    throw error;
  }
}

async function recordSyncFailure(accountId: string, action: string, error: unknown) {
  const safeError = toSafeGrowthError(error);
  await prisma.$transaction(async (tx) => {
    await tx.growthPinterestAccount.updateMany({ where: {
      id: accountId,
      connectionStatus: { notIn: [GrowthPinterestConnectionStatus.DISCONNECTED, GrowthPinterestConnectionStatus.REAUTH_REQUIRED] },
    }, data: {
      connectionStatus: GrowthPinterestConnectionStatus.DEGRADED, lastConnectionError: safeError,
    } });
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER,
      entityType: "GrowthPinterestAccount", entityId: accountId, action,
      summary: { error: safeError },
    }, tx);
  });
}
