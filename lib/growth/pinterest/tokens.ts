
import { GrowthActivityActorKind, GrowthPinterestConnectionStatus, type GrowthPinterestAccount } from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { NonRetryableGrowthJobError, PinterestTokenRequestError, RetryableGrowthJobError } from "@/lib/growth/errors";
import { PINTEREST_ACCESS_TOKEN_REFRESH_WINDOW_MS, requirePinterestConfiguration } from "@/lib/growth/pinterest/config";
import { decryptPinterestCredentials, encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";
import { refreshPinterestToken, tokenExpiries } from "@/lib/growth/pinterest/oauth";
import { toSafeGrowthError } from "@/lib/growth/safe-data";
import { prisma } from "@/lib/prisma";

export async function getValidPinterestAccessToken(accountId: string, fetchImpl: typeof fetch = fetch) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<GrowthPinterestAccount[]>`
        SELECT * FROM "GrowthPinterestAccount" WHERE "id" = ${accountId} FOR UPDATE
      `;
      const account = rows[0];
      if (!account || account.connectionStatus === GrowthPinterestConnectionStatus.DISCONNECTED || !account.encryptedCredentials) {
        throw new NonRetryableGrowthJobError("Pinterest account is disconnected.");
      }
      const config = requirePinterestConfiguration();
      if (account.apiEnvironment !== config.apiEnvironment) {
        throw new NonRetryableGrowthJobError("Pinterest account environment does not match configured environment.");
      }
      const credentials = decryptPinterestCredentials(account.encryptedCredentials);
      if (account.accessTokenExpiresAt && account.accessTokenExpiresAt.getTime() > Date.now() + PINTEREST_ACCESS_TOKEN_REFRESH_WINDOW_MS) {
        return credentials.accessToken;
      }
      if (!account.refreshTokenExpiresAt || account.refreshTokenExpiresAt <= new Date()) {
        throw new NonRetryableGrowthJobError("Pinterest reconnect is required.");
      }
      const refreshed = await refreshPinterestToken(credentials.refreshToken, fetchImpl);
      const expiries = tokenExpiries(refreshed);
      await tx.growthPinterestAccount.update({ where: { id: account.id }, data: {
        encryptedCredentials: encryptPinterestCredentials({ accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token }),
        credentialVersion: { increment: 1 },
        grantedScopes: normalizePinterestScopes(refreshed.scope),
        ...expiries,
        connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
        lastConnectionError: null,
      } });
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthPinterestAccount", entityId: account.id, action: "PINTEREST_TOKEN_REFRESHED",
        summary: { credentialVersion: account.credentialVersion + 1, accessTokenExpiresAt: expiries.accessTokenExpiresAt },
      }, tx);
      return refreshed.access_token;
    }, { timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof NonRetryableGrowthJobError) {
      if (error.message.includes("reconnect")) {
        await prisma.growthPinterestAccount.updateMany({ where: { id: accountId, connectionStatus: { not: GrowthPinterestConnectionStatus.DISCONNECTED } }, data: {
          connectionStatus: GrowthPinterestConnectionStatus.REAUTH_REQUIRED,
          lastConnectionError: "Pinterest refresh credential expired or invalid; reconnect required.",
        } });
      }
      throw error;
    }
    if (error instanceof PinterestTokenRequestError && [400, 401, 403].includes(error.status)) {
      await prisma.growthPinterestAccount.updateMany({ where: { id: accountId }, data: {
        connectionStatus: GrowthPinterestConnectionStatus.REAUTH_REQUIRED,
        lastConnectionError: "Pinterest rejected token refresh; reconnect required.",
      } });
      throw new NonRetryableGrowthJobError("Pinterest reconnect is required.");
    }
    await prisma.growthPinterestAccount.updateMany({ where: { id: accountId }, data: {
      connectionStatus: GrowthPinterestConnectionStatus.DEGRADED,
      lastConnectionError: toSafeGrowthError(error),
    } });
    throw new RetryableGrowthJobError(toSafeGrowthError(error));
  }
}

export function normalizePinterestScopes(scope: string) {
  return [...new Set(scope.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean))].sort();
}
