
import {
  GrowthActivityActorKind,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
  type Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";
import { requirePinterestConfiguration } from "@/lib/growth/pinterest/config";
import { tokenExpiries } from "@/lib/growth/pinterest/oauth";
import type { PinterestTokenResponse, PinterestUserAccount } from "@/lib/growth/pinterest/schemas";
import { normalizePinterestScopes } from "@/lib/growth/pinterest/tokens";
import { prisma } from "@/lib/prisma";

export async function connectPinterestAccount(params: {
  profile: PinterestUserAccount;
  token: PinterestTokenResponse;
  publicationRole: GrowthPinterestPublicationRole;
  adminUserId: string;
}) {
  const config = requirePinterestConfiguration();
  const encryptedCredentials = encryptPinterestCredentials({
    accessToken: params.token.access_token,
    refreshToken: params.token.refresh_token,
  });
  const expiries = tokenExpiries(params.token);
  return prisma.$transaction(async (tx) => {
    const previous = await tx.growthPinterestAccount.findUnique({ where: { pinterestAccountId: params.profile.id } });
    const account = await tx.growthPinterestAccount.upsert({
      where: { pinterestAccountId: params.profile.id },
      create: {
        pinterestAccountId: params.profile.id,
        publicationRole: params.publicationRole,
        activeRole: params.publicationRole,
        username: params.profile.username,
        businessName: params.profile.business_name || null,
        profileImageUrl: params.profile.profile_image || null,
        websiteUrl: params.profile.website_url || null,
        pinterestAccountType: params.profile.account_type || null,
        apiEnvironment: config.apiEnvironment,
        connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
        grantedScopes: normalizePinterestScopes(params.token.scope),
        encryptedCredentials,
        ...expiries,
        lastAccountSyncAt: new Date(),
        lastSuccessfulApiCallAt: new Date(),
      },
      update: {
        publicationRole: params.publicationRole,
        activeRole: params.publicationRole,
        username: params.profile.username,
        businessName: params.profile.business_name || null,
        profileImageUrl: params.profile.profile_image || null,
        websiteUrl: params.profile.website_url || null,
        pinterestAccountType: params.profile.account_type || null,
        apiEnvironment: config.apiEnvironment,
        connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
        grantedScopes: normalizePinterestScopes(params.token.scope),
        encryptedCredentials,
        credentialVersion: { increment: 1 },
        ...expiries,
        lastAccountSyncAt: new Date(),
        lastSuccessfulApiCallAt: new Date(),
        lastConnectionError: null,
        disconnectedAt: null,
      },
    });
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.USER, actorUserId: params.adminUserId,
      entityType: "GrowthPinterestAccount", entityId: account.id,
      action: previous ? "PINTEREST_ACCOUNT_RECONNECTED" : "PINTEREST_ACCOUNT_CONNECTED",
      fromState: previous?.connectionStatus || null, toState: account.connectionStatus,
      summary: { publicationRole: account.publicationRole, username: account.username, apiEnvironment: account.apiEnvironment, grantedScopes: account.grantedScopes },
      correlationKey: `pinterest-account:${account.pinterestAccountId}`,
    }, tx);
    return account;
  });
}

export async function changePinterestAccountRole(accountId: string, role: GrowthPinterestPublicationRole, adminUserId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.growthPinterestAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (current.connectionStatus === GrowthPinterestConnectionStatus.DISCONNECTED) throw new Error("Reconnect the Pinterest account before changing its active role.");
    const account = await tx.growthPinterestAccount.update({ where: { id: accountId }, data: { publicationRole: role, activeRole: role } });
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.USER, actorUserId: adminUserId,
      entityType: "GrowthPinterestAccount", entityId: account.id, action: "PINTEREST_ACCOUNT_ROLE_CHANGED",
      fromState: current.publicationRole, toState: role, summary: { username: account.username },
    }, tx);
    return account;
  });
}

export async function disconnectPinterestAccount(accountId: string, adminUserId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.growthPinterestAccount.findUniqueOrThrow({ where: { id: accountId } });
    const account = await tx.growthPinterestAccount.update({ where: { id: accountId }, data: {
      connectionStatus: GrowthPinterestConnectionStatus.DISCONNECTED,
      activeRole: null,
      encryptedCredentials: null,
      credentialVersion: { increment: 1 },
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      disconnectedAt: new Date(),
      lastConnectionError: null,
    } });
    await tx.$executeRaw`
      UPDATE "GrowthJob"
      SET "status" = 'CANCELLED'::"GrowthJobStatus", "completedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "type" IN ('PINTEREST_ACCOUNT_SYNC'::"GrowthJobType", 'PINTEREST_BOARD_SYNC'::"GrowthJobType")
        AND "status" IN ('PENDING'::"GrowthJobStatus", 'FAILED_RETRYABLE'::"GrowthJobStatus")
        AND "payload"->>'accountId' = ${accountId}
    `;
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.USER, actorUserId: adminUserId,
      entityType: "GrowthPinterestAccount", entityId: account.id, action: "PINTEREST_ACCOUNT_DISCONNECTED",
      fromState: current.connectionStatus, toState: GrowthPinterestConnectionStatus.DISCONNECTED,
      summary: { publicationRole: current.publicationRole, username: current.username },
    }, tx);
    return account;
  });
}

export async function getPinterestAccountsOverview() {
  return prisma.growthPinterestAccount.findMany({
    select: {
      id: true,
      publicationRole: true,
      activeRole: true,
      username: true,
      businessName: true,
      profileImageUrl: true,
      websiteUrl: true,
      pinterestAccountType: true,
      apiEnvironment: true,
      connectionStatus: true,
      grantedScopes: true,
      accessTokenExpiresAt: true,
      refreshTokenExpiresAt: true,
      lastAccountSyncAt: true,
      lastBoardSyncAt: true,
      lastConnectionError: true,
      boards: { orderBy: [{ isActive: "desc" }, { name: "asc" }] },
    },
    orderBy: { publicationRole: "asc" },
  });
}

export function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
