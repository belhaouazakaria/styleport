-- Phase 3 Pinterest connection and read-only board synchronization.
ALTER TYPE "GrowthJobType" ADD VALUE 'PINTEREST_ACCOUNT_SYNC';
ALTER TYPE "GrowthJobType" ADD VALUE 'PINTEREST_BOARD_SYNC';

CREATE TYPE "GrowthPinterestPublicationRole" AS ENUM ('SAYTWIST', 'SAYTWIST_IDEAS', 'SAYTWIST_PLAYGROUND');
CREATE TYPE "GrowthPinterestConnectionStatus" AS ENUM ('CONNECTED', 'DEGRADED', 'REAUTH_REQUIRED', 'DISCONNECTED');
CREATE TYPE "GrowthPinterestApiEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

CREATE TABLE "GrowthPinterestAccount" (
    "id" TEXT NOT NULL,
    "pinterestAccountId" TEXT NOT NULL,
    "publicationRole" "GrowthPinterestPublicationRole" NOT NULL,
    "activeRole" "GrowthPinterestPublicationRole",
    "username" TEXT NOT NULL,
    "businessName" TEXT,
    "profileImageUrl" TEXT,
    "websiteUrl" TEXT,
    "pinterestAccountType" TEXT,
    "apiEnvironment" "GrowthPinterestApiEnvironment" NOT NULL,
    "connectionStatus" "GrowthPinterestConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "grantedScopes" TEXT[] NOT NULL,
    "encryptedCredentials" TEXT,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "lastAccountSyncAt" TIMESTAMP(3),
    "lastBoardSyncAt" TIMESTAMP(3),
    "lastSuccessfulApiCallAt" TIMESTAMP(3),
    "lastConnectionError" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthPinterestAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GrowthPinterestAccount_credentialVersion_check" CHECK ("credentialVersion" >= 1),
    CONSTRAINT "GrowthPinterestAccount_credentials_state_check" CHECK (
      ("connectionStatus" = 'DISCONNECTED' AND "encryptedCredentials" IS NULL AND "activeRole" IS NULL)
      OR
      ("connectionStatus" <> 'DISCONNECTED' AND "encryptedCredentials" IS NOT NULL AND "activeRole" IS NOT NULL)
    )
);

CREATE TABLE "GrowthPinterestBoard" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "pinterestBoardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "privacy" TEXT,
    "ownerUsername" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrowthPinterestBoard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthPinterestOAuthState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "publicationRole" "GrowthPinterestPublicationRole" NOT NULL,
    "apiEnvironment" "GrowthPinterestApiEnvironment" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrowthPinterestOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrowthPinterestAccount_pinterestAccountId_key" ON "GrowthPinterestAccount"("pinterestAccountId");
CREATE UNIQUE INDEX "GrowthPinterestAccount_activeRole_key" ON "GrowthPinterestAccount"("activeRole");
CREATE INDEX "GrowthPinterestAccount_connectionStatus_publicationRole_idx" ON "GrowthPinterestAccount"("connectionStatus", "publicationRole");
CREATE INDEX "GrowthPinterestAccount_apiEnvironment_connectionStatus_idx" ON "GrowthPinterestAccount"("apiEnvironment", "connectionStatus");
CREATE UNIQUE INDEX "GrowthPinterestBoard_accountId_pinterestBoardId_key" ON "GrowthPinterestBoard"("accountId", "pinterestBoardId");
CREATE INDEX "GrowthPinterestBoard_accountId_isActive_idx" ON "GrowthPinterestBoard"("accountId", "isActive");
CREATE INDEX "GrowthPinterestBoard_pinterestBoardId_idx" ON "GrowthPinterestBoard"("pinterestBoardId");
CREATE UNIQUE INDEX "GrowthPinterestOAuthState_stateHash_key" ON "GrowthPinterestOAuthState"("stateHash");
CREATE INDEX "GrowthPinterestOAuthState_expiresAt_consumedAt_idx" ON "GrowthPinterestOAuthState"("expiresAt", "consumedAt");
CREATE INDEX "GrowthPinterestOAuthState_adminUserId_createdAt_idx" ON "GrowthPinterestOAuthState"("adminUserId", "createdAt");

ALTER TABLE "GrowthPinterestBoard" ADD CONSTRAINT "GrowthPinterestBoard_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GrowthPinterestAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthPinterestOAuthState" ADD CONSTRAINT "GrowthPinterestOAuthState_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
