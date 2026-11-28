import { GrowthActivityActorKind, Prisma } from "@prisma/client";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";

/** Resource access is evidence, not a zero metric or an account OAuth failure.
 * Reconnecting advances credentialVersion and permits a fresh access attempt. */
export async function unavailablePinterestAnalyticsPins(
  accountId: string, db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT p."id" FROM "GrowthPinterestPin" p
    JOIN "GrowthPinterestAccount" account ON account."id" = p."accountId"
    JOIN "GrowthActivity" a ON a."entityType" = 'GrowthPinterestPin'
      AND a."entityId" = p."id" AND a."action" = 'PINTEREST_PIN_ANALYTICS_UNAVAILABLE'
    WHERE p."accountId" = ${accountId}
      AND a."summary"->>'credentialVersion' = account."credentialVersion"::text
  `;
  return new Set(rows.map(row => row.id));
}

export async function recordUnavailablePinterestAnalytics(
  accountId: string, pinId: string, options: { gone?: boolean } = {},
) {
  if (options.gone) {
    // Deleted on Pinterest: retire it from the inventory so analytics and
    // recovery stop requesting it. Nothing is zero-filled.
    await prisma.$transaction(async tx => {
      const pin = await tx.growthPinterestPin.updateMany({
        where: { id: pinId, accountId }, data: { isActive: false, analyticsEligible: false },
      });
      if (pin.count !== 1) throw Error("PIN_ANALYTICS_ACCOUNT_MISMATCH");
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthPinterestPin", entityId: pinId,
        action: "PINTEREST_PIN_REMOVED",
        summary: { accountId, providerStatus: 404, providerCode: "50", reason: "PIN_NOT_FOUND" },
      }, tx);
    });
    return;
  }
  await prisma.$transaction(async tx => {
    const account = await tx.growthPinterestAccount.findUniqueOrThrow({
      where: { id: accountId }, select: { credentialVersion: true },
    });
    const pin = await tx.growthPinterestPin.updateMany({
      where: { id: pinId, accountId }, data: { analyticsEligible: false },
    });
    if (pin.count !== 1) throw Error("PIN_ANALYTICS_ACCOUNT_MISMATCH");
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthPinterestPin", entityId: pinId,
      action: "PINTEREST_PIN_ANALYTICS_UNAVAILABLE",
      summary: { accountId, credentialVersion: account.credentialVersion,
        providerStatus: 403, providerCode: "29", reason: "PIN_RESOURCE_ACCESS_DENIED" },
    }, tx);
    await tx.growthPinterestAnalyticsState.updateMany({
      where: { accountId, AND: [{ lastError: { contains: "HTTP 403" } }, { lastError: { contains: "Provider code: 29" } }] },
      data: { status: "PARTIAL", lastError: null },
    });
  });
}
