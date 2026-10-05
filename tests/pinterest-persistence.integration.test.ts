import { randomBytes, randomUUID } from "node:crypto";
import {
  GrowthJobType,
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
} from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disconnectPinterestAccount } from "@/lib/growth/pinterest/accounts";
import { decryptPinterestCredentials, encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";
import { enqueuePinterestSyncJobs } from "@/lib/growth/pinterest/jobs";
import { syncPinterestBoards } from "@/lib/growth/pinterest/sync";
import { getValidPinterestAccessToken } from "@/lib/growth/pinterest/tokens";
import { prisma } from "@/lib/prisma";

const runDatabaseTests = process.env.RUN_GROWTH_PINTEREST_DB_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase3_test";
const encryptionKey = randomBytes(32).toString("base64");

if (runDatabaseTests) {
  const explicitUrl = process.env.GROWTH_PINTEREST_TEST_DATABASE_URL;
  if (!explicitUrl || process.env.DATABASE_URL !== explicitUrl) throw new Error("Pinterest DB tests require matching explicit test database URLs.");
  const parsed = new URL(explicitUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName) {
    throw new Error(`Pinterest DB tests refuse every target except local database ${requiredDatabaseName}.`);
  }
}

async function clean() {
  await prisma.growthActivity.deleteMany();
  await prisma.growthJob.deleteMany();
  await prisma.growthPinterestBoard.deleteMany();
  await prisma.growthPinterestAccount.deleteMany();
  await prisma.growthPinterestOAuthState.deleteMany();
  await prisma.user.deleteMany({ where: { email: { endsWith: "@pinterest-phase3.test" } } });
}

async function createAccount(overrides: Partial<Parameters<typeof prisma.growthPinterestAccount.create>[0]["data"]> = {}) {
  return prisma.growthPinterestAccount.create({ data: {
    pinterestAccountId: `pin-${randomUUID()}`,
    publicationRole: GrowthPinterestPublicationRole.SAYTWIST,
    activeRole: GrowthPinterestPublicationRole.SAYTWIST,
    username: `user-${randomUUID()}`,
    apiEnvironment: GrowthPinterestApiEnvironment.SANDBOX,
    connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
    grantedScopes: ["boards:read", "pins:read", "pins:write", "user_accounts:read"],
    encryptedCredentials: encryptPinterestCredentials({ accessToken: "test-access-original", refreshToken: "test-refresh-original" }, encryptionKey),
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    refreshTokenExpiresAt: new Date(Date.now() + 7_200_000),
    ...overrides,
  } });
}

beforeAll(() => {
  vi.stubEnv("PINTEREST_APP_ID", "integration-app");
  vi.stubEnv("PINTEREST_APP_SECRET", "integration-secret");
  vi.stubEnv("PINTEREST_REDIRECT_URI", "http://localhost:3000/api/admin/growth/pinterest/oauth/callback");
  vi.stubEnv("PINTEREST_API_ENVIRONMENT", "sandbox");
  vi.stubEnv("GROWTH_CREDENTIAL_ENCRYPTION_KEY", encryptionKey);
});
beforeEach(clean);
afterAll(async () => { if (runDatabaseTests) await clean(); vi.unstubAllEnvs(); await prisma.$disconnect(); });

databaseDescribe("Pinterest Phase 3 PostgreSQL persistence", () => {
  it("enforces Pinterest identity and one-active-account-per-role uniqueness", async () => {
    const first = await createAccount();
    await expect(createAccount({ pinterestAccountId: first.pinterestAccountId, activeRole: GrowthPinterestPublicationRole.SAYTWIST_IDEAS, publicationRole: GrowthPinterestPublicationRole.SAYTWIST_IDEAS })).rejects.toMatchObject({ code: "P2002" });
    await expect(createAccount({ activeRole: GrowthPinterestPublicationRole.SAYTWIST })).rejects.toMatchObject({ code: "P2002" });
  });

  it("stores only an authenticated encrypted token envelope and decrypts it", async () => {
    const account = await createAccount();
    expect(account.encryptedCredentials).not.toContain("test-access-original");
    expect(account.encryptedCredentials).not.toContain("test-refresh-original");
    expect(decryptPinterestCredentials(account.encryptedCredentials, encryptionKey)).toEqual({ accessToken: "test-access-original", refreshToken: "test-refresh-original" });
  });

  it("serializes concurrent refresh, rotates both tokens, and increments one version", async () => {
    const account = await createAccount({ accessTokenExpiresAt: new Date(Date.now() - 1) });
    const response = { access_token: "test-access-rotated", refresh_token: "test-refresh-rotated", token_type: "bearer", expires_in: 3600, refresh_token_expires_in: 7200, scope: "boards:read pins:read pins:write user_accounts:read" };
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(response), { status: 200 }));
    const tokens = await Promise.all([
      getValidPinterestAccessToken(account.id, fetchMock),
      getValidPinterestAccessToken(account.id, fetchMock),
    ]);
    expect(tokens).toEqual(["test-access-rotated", "test-access-rotated"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const persisted = await prisma.growthPinterestAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(persisted.credentialVersion).toBe(2);
    expect(decryptPinterestCredentials(persisted.encryptedCredentials!, encryptionKey)).toEqual({ accessToken: "test-access-rotated", refreshToken: "test-refresh-rotated" });
  });

  it("upserts boards and deactivates unseen boards only after a complete sync", async () => {
    const account = await createAccount();
    await prisma.growthPinterestBoard.create({ data: { accountId: account.id, pinterestBoardId: "stale", name: "Old", isActive: true, lastSeenAt: new Date(0), lastSyncedAt: new Date(0) } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "board-1", name: "One", privacy: "PUBLIC" }], bookmark: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "board-2", name: "Two", owner: { username: "owner" } }], bookmark: null }), { status: 200 }));
    await expect(syncPinterestBoards(account.id, fetchMock)).resolves.toEqual({ accountId: account.id, boardCount: 2 });
    expect(await prisma.growthPinterestBoard.count({ where: { accountId: account.id, isActive: true } })).toBe(2);
    expect((await prisma.growthPinterestBoard.findUniqueOrThrow({ where: { accountId_pinterestBoardId: { accountId: account.id, pinterestBoardId: "stale" } } })).isActive).toBe(false);
  });

  it("does not deactivate unseen boards after a partial failed sync", async () => {
    const account = await createAccount();
    const existing = await prisma.growthPinterestBoard.create({ data: { accountId: account.id, pinterestBoardId: "keep", name: "Keep", isActive: true, lastSeenAt: new Date(), lastSyncedAt: new Date() } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "new", name: "New" }], bookmark: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), { status: 500 }));
    await expect(syncPinterestBoards(account.id, fetchMock)).rejects.toThrow("HTTP 500");
    expect((await prisma.growthPinterestBoard.findUniqueOrThrow({ where: { id: existing.id } })).isActive).toBe(true);
    expect(await prisma.growthPinterestBoard.count({ where: { accountId: account.id, pinterestBoardId: "new" } })).toBe(0);
  });

  it("stops repeated bookmarks without committing a partial board set", async () => {
    const account = await createAccount();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "first", name: "First" }], bookmark: "loop" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "second", name: "Second" }], bookmark: "loop" }), { status: 200 }));
    await expect(syncPinterestBoards(account.id, fetchMock)).rejects.toThrow("repeated a bookmark");
    expect(await prisma.growthPinterestBoard.count({ where: { accountId: account.id } })).toBe(0);
  });

  it("disconnect erases credentials, blocks token use, and cancels pending sync jobs", async () => {
    const admin = await prisma.user.create({ data: { email: `${randomUUID()}@pinterest-phase3.test`, passwordHash: "unused", role: "ADMIN" } });
    const account = await createAccount();
    await enqueuePinterestSyncJobs(account.id, new Date(0));
    await disconnectPinterestAccount(account.id, admin.id);
    const persisted = await prisma.growthPinterestAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(persisted).toMatchObject({ connectionStatus: GrowthPinterestConnectionStatus.DISCONNECTED, encryptedCredentials: null, activeRole: null, credentialVersion: 2 });
    await expect(getValidPinterestAccessToken(account.id)).rejects.toThrow("disconnected");
    expect(await prisma.growthJob.count({ where: { type: { in: [GrowthJobType.PINTEREST_ACCOUNT_SYNC, GrowthJobType.PINTEREST_BOARD_SYNC] }, status: "CANCELLED" } })).toBe(2);
  });

  it("deduplicates repeated Phase 3 sync enqueue requests within a minute", async () => {
    const account = await createAccount();
    const at = new Date("2026-10-05T12:34:00Z");
    const [first, second] = await Promise.all([enqueuePinterestSyncJobs(account.id, at), enqueuePinterestSyncJobs(account.id, at)]);
    expect(first.account.job.id).toBe(second.account.job.id);
    expect(first.boards.job.id).toBe(second.boards.job.id);
    expect(await prisma.growthJob.count()).toBe(2);
  });
});
