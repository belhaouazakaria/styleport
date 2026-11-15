import { readReviewChoices, replaceReviewPlan } from "@/lib/growth/approvals/choices";
import { discordReviewCard } from "@/lib/growth/discord/outbox";
import { reservePinterestGlobalAttempt } from "@/lib/growth/pinterest/global-budget";
import { executeDailyObservation } from "@/workers/growth-daily-observe";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { readV2FollowupEvidence } from "@/scripts/growth-v2-followup-evidence";
import {
  readFreshCreativeTargets,
  bindNativeCampaignJob,
} from "@/lib/growth/viral/native-creative-targets";
import { consumeQueuedPinterestInventory } from "@/lib/growth/pinterest/queued-inventory";
import { encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";
import { promoteDueGrowthRetries } from "@/lib/growth/jobs";
// @vitest-environment node
import { synchronizeGoogleAnalytics } from "@/lib/growth/google/sync";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { evidenceChecksum } from "@/lib/growth/approvals/contracts";
import {
  createBudgetChangeReview,
  decideGrowthReview,
} from "@/lib/growth/approvals/service";
import {
  processDiscordDecisions,
  runDiscordOutbox,
} from "@/lib/growth/discord/outbox";
import {
  prepareViralWinnerConversions,
  qualifiedViralEvidence,
} from "@/lib/growth/viral/conversion";
import { receiveDiscordDecision } from "@/lib/growth/discord/interactions";

const enabled = process.env.RUN_GROWTH_V2_DB_TESTS === "1";
if (enabled) {
  const u = new URL(process.env.DATABASE_URL || "");
  if (
    u.hostname !== "127.0.0.1" ||
    u.port !== "55439" ||
    u.pathname !== "/saytwist_growth_v2_test"
  )
    throw Error("Unsafe V2 test database");
}
const suite = enabled ? describe.sequential : describe.skip;
const config = {
  applicationId: "12345678901234567",
  ownerDiscordId: "22345678901234567",
  ownerUserId: "owner-v2",
  publicKey: "a".repeat(64),
  token: "a".repeat(40),
};
const now = new Date();
async function fixture() {
  const id = randomUUID();
  const t = await prisma.translator.create({
    data: {
      name: "Original Warm " + id,
      slug: "warm-" + id,
      title: "Warm",
      subtitle: "Warm",
      shortDescription: "Original warm rewrite",
      sourceLabel: "Before",
      targetLabel: "After",
      promptSystem: "Rewrite",
      promptInstructions: "Keep meaning",
      isActive: true,
    },
  });
  const account = await prisma.growthPinterestAccount.findFirstOrThrow({
    where: { apiEnvironment: "SANDBOX" },
  });
  const board = await prisma.growthPinterestBoard.findFirstOrThrow();
  const asset = await prisma.growthAsset.create({
    data: {
      publicPath:
        "/generated/growth-creatives/creative-" +
        createHash("sha256").update(id).digest("hex") +
        ".png",
      checksum: "a".repeat(64),
      mimeType: "image/png",
      width: 1000,
      height: 1500,
      byteSize: 1000,
      rendererKey: "test",
      rendererVersion: "v1",
      templateId: "test",
      generationKind: "DETERMINISTIC",
      state: "READY",
    },
  });
  const candidate = await prisma.growthPinCandidate.create({
    data: {
      candidateKey: id,
      revision: 1,
      translatorId: t.id,
      accountId: account.id,
      destinationKind: "TRANSLATOR",
      title: "Warm Translator",
      description: "Try an original warm rewrite.",
      destinationPath: "/translators/" + t.slug,
      assetId: asset.id,
      rendererKey: "test",
      rendererVersion: "v1",
      templateId: "test",
      archetype: "MINIMAL_STATEMENT",
      headlinePattern: "warm",
      ctaPattern: "try",
      visualTreatment: "warm",
      topic: "warm",
      contentHash: "b".repeat(64),
      similarityModelVersion: "v1",
      similarityResult: "DISTINCT",
      similarityFlags: {},
      status: "READY",
    },
  });
  const snapshot = {
    title: candidate.title,
    description: candidate.description,
    assetUrl: "https://saytwist.com" + asset.publicPath,
    assetChecksum: asset.checksum,
    contentHash: candidate.contentHash,
    revision: 1,
    destinationUrl: "https://saytwist.com" + candidate.destinationPath,
    destinationDomain: "saytwist.com",
    accountId: account.id,
    accountName: "saytwist",
    boardId: board.id,
    boardName: "Warm",
    scheduledAt: new Date(now.getTime() + 86400000).toISOString(),
    reason: "Promote an original tool",
    risks: "Public Pin",
    estimatedCostCents: 0,
  };
  const review = await prisma.growthApprovalRequest.create({
    data: {
      kind: "NATIVE_PIN",
      subjectId: candidate.id,
      dedupeKey: id,
      ownerUserId: config.ownerUserId,
      snapshot,
      snapshotChecksum: evidenceChecksum(snapshot),
      expiresAt: new Date(now.getTime() + 3600000),
    },
  });
  const notification = await prisma.growthNotification.create({
    data: {
      dedupeKey: id,
      requestId: review.id,
      payload: { kind: "APPROVAL" },
    },
  });
  return { review, notification, candidate };
}
beforeAll(async () => {
  if (!enabled) return;
  process.env.APP_BASE_URL = "https://saytwist.com";
  process.env.PINTEREST_APP_ID = "test";
  process.env.PINTEREST_APP_SECRET = "test";
  process.env.PINTEREST_REDIRECT_URI =
    "https://saytwist.com/api/admin/growth/pinterest/oauth/callback";
  process.env.PINTEREST_API_ENVIRONMENT = "sandbox";
  process.env.GROWTH_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64",
  );
  // Only this exact disposable database can be reset.
  await prisma.$executeRawUnsafe(
    'TRUNCATE "GrowthExternalAnalyticsDaily", "GrowthViralProgramSettings", "GrowthViralConcept", "GrowthViralConversion", "GrowthAnalyticsCoverage", "GrowthApprovalRequest", "GrowthNotification", "GrowthDiscordInteraction", "GrowthPinCandidate", "GrowthPinApproval", "GrowthPinPublication", "GrowthPinterestAccount", "GrowthSettings", "User", "Translator" CASCADE',
  );
  await prisma.user.create({
    data: {
      id: config.ownerUserId,
      email: "v2-owner@test.local",
      passwordHash: "test",
      role: "ADMIN",
    },
  });
  await prisma.user.create({
    data: {
      id: "other-v2",
      email: "v2-other@test.local",
      passwordHash: "test",
      role: "ADMIN",
    },
  });
  await prisma.growthSettings.create({
    data: { id: "global", enabled: false },
  });
  const account = await prisma.growthPinterestAccount.create({
    data: {
      pinterestAccountId: "v2",
      publicationRole: "SAYTWIST",
      activeRole: "SAYTWIST",
      username: "saytwist",
      apiEnvironment: "SANDBOX",
      connectionStatus: "CONNECTED",
      grantedScopes: [
        "user_accounts:read",
        "boards:read",
        "boards:write",
        "pins:read",
        "pins:write",
      ],
      encryptedCredentials: "not-used-by-approval",
      refreshTokenExpiresAt: new Date(now.getTime() + 864000000),
    },
  });
  await prisma.growthPinterestBoard.create({
    data: {
      accountId: account.id,
      pinterestBoardId: "v2-board",
      name: "Warm",
      isActive: true,
      lastSeenAt: now,
      lastSyncedAt: now,
    },
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});
suite("Unified owner consent with PostgreSQL 18", () => {
  it("observes exactly the rotated account in a three-account production portfolio and reuses its real completion", async () => {
    const accounts = [];
    const main = await prisma.growthPinterestAccount.findFirstOrThrow({ where: { apiEnvironment: "SANDBOX" } });
    const environment = process.env.PINTEREST_API_ENVIRONMENT;
    process.env.PINTEREST_API_ENVIRONMENT = "production";
    try {
      accounts.push(await prisma.growthPinterestAccount.update({ where: { id: main.id }, data: { apiEnvironment: "PRODUCTION", encryptedCredentials: encryptPinterestCredentials({ accessToken: "mock-access", refreshToken: "mock-refresh" }), accessTokenExpiresAt: new Date(Date.now() + 3600000) } }));
      for (const role of ["SAYTWIST_IDEAS", "SAYTWIST_PLAYGROUND"] as const) {
        const account = await prisma.growthPinterestAccount.create({ data: {
          pinterestAccountId: "observe-" + role, username: "observe-" + role,
          publicationRole: role, activeRole: role, apiEnvironment: "PRODUCTION", connectionStatus: "CONNECTED",
          grantedScopes: ["user_accounts:read", "boards:read", "boards:write", "pins:read", "pins:write"],
          encryptedCredentials: encryptPinterestCredentials({ accessToken: "mock-access", refreshToken: "mock-refresh" }),
          accessTokenExpiresAt: new Date(Date.now() + 3600000),
        } });
        accounts.push(account);
        await prisma.growthPinterestBoard.create({ data: { accountId: account.id, pinterestBoardId: "observe-board-" + role, name: "Translators", isActive: true, lastSeenAt: new Date(), lastSyncedAt: new Date() } });
      }
      const day = new Date().toISOString().slice(0, 10);
      const rotation = await readDailyRotation(new Date(day + "T00:00:00Z"));
      const selected = accounts.find(a => a.id === rotation.accountId)!;
      const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe("https://api.pinterest.com/v5/user_account");
        expect(init?.method).toBe("GET");
        return Response.json({ id: selected.pinterestAccountId, username: selected.username, account_type: "BUSINESS" }, { headers: { "x-ratelimit-limit": "100", "x-ratelimit-remaining": "99", "x-ratelimit-reset": "3600" } });
      });
      vi.stubGlobal("fetch", fetcher);
      expect((await executeDailyObservation("a".repeat(40), day, "SCHEDULED", true)).status).toBe("PASSED");
      expect((await executeDailyObservation("a".repeat(40), day, "SCHEDULED", true)).status).toBe("ALREADY_FRESH");
      expect(fetcher).toHaveBeenCalledTimes(1);
      const observed = await prisma.growthPinterestAccount.findMany({ where: { id: { in: accounts.map(a => a.id) }, lastAccountSyncAt: { not: null } } });
      expect(observed.map(a => a.id)).toEqual([selected.id]);
      expect(await prisma.growthJob.findFirstOrThrow({ where: { idempotencyKey: "growth-daily-observe:" + day } })).toMatchObject({ status: "SUCCEEDED", attemptCount: 1, payload: { accountId: selected.id } });
      expect(await prisma.growthSettings.findUniqueOrThrow({ where: { id: "global" } })).toMatchObject({ enabled: false, attributionEnabled: false, workerActivationExpiresAt: null });
      expect(await prisma.growthPinPublication.count()).toBe(0);
    } finally {
      vi.unstubAllGlobals(); process.env.PINTEREST_API_ENVIRONMENT = environment;
      await prisma.growthPinterestAccount.deleteMany({ where: { id: { in: accounts.filter(a => a.id !== main.id).map(a => a.id) } } });
      await prisma.growthPinterestAccount.update({ where: { id: main.id }, data: { apiEnvironment: main.apiEnvironment, connectionStatus: main.connectionStatus, lastConnectionError: main.lastConnectionError, encryptedCredentials: main.encryptedCredentials, accessTokenExpiresAt: main.accessTokenExpiresAt, lastAccountSyncAt: main.lastAccountSyncAt, lastSuccessfulApiCallAt: main.lastSuccessfulApiCallAt } });
    }
  });
  it("freezes real release evidence read-only and refuses an unrelated pending job", async () => {
    const before = await prisma.growthJob.count();
    const first = await readV2FollowupEvidence();
    expect(first).toEqual(await readV2FollowupEvidence());
    expect(first).toMatchObject({ safe: true, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(await prisma.growthJob.count()).toBe(before);
    const job = await prisma.growthJob.create({ data: { type: "PINTEREST_ACCOUNT_SYNC", idempotencyKey: "blocked-evidence-" + randomUUID(), payload: { accountId: "unbound" } } });
    try { await expect(readV2FollowupEvidence()).rejects.toThrow("FOLLOWUP_QUEUE_BUSY"); }
    finally { await prisma.growthJob.update({ where: { id: job.id }, data: { status: "CANCELLED" } }); }
  });
  it("consumes an existing inventory pair through real leases and workers using GET-only provider mocks", async () => {
    const account = await prisma.growthPinterestAccount.create({
      data: {
        pinterestAccountId: "inventory-v2",
        publicationRole: "SAYTWIST_PLAYGROUND",
        activeRole: "SAYTWIST_PLAYGROUND",
        username: "inventory-v2",
        apiEnvironment: "PRODUCTION",
        connectionStatus: "CONNECTED",
        grantedScopes: [
          "boards:read",
          "user_accounts:read",
          "boards:write",
          "pins:read",
          "pins:write",
        ],
        encryptedCredentials: encryptPinterestCredentials({
          accessToken: "mock-access",
          refreshToken: "mock-refresh",
        }),
        accessTokenExpiresAt: new Date(+now + 3600000),
      },
    });
    const jobs = [];
    for (const kind of ["board", "account"] as const)
      jobs.push(
        await prisma.growthJob.create({
          data: {
            type:
              kind === "board"
                ? "PINTEREST_BOARD_SYNC"
                : "PINTEREST_ACCOUNT_SYNC",
            payload: { accountId: account.id },
            idempotencyKey: `pinterest:${kind}-sync:${account.id}:${Math.floor(Date.now() / 60000)}`,
            runAfter: new Date(+now - 1000),
          },
        }),
      );
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method ?? "GET").toBe("GET");
        const url = String(input);
        if (url === "https://api.pinterest.com/v5/boards?page_size=100")
          return Response.json({
            items: [
              {
                id: "11111111",
                name: "Text Style",
                owner: { username: "inventory-v2" },
                privacy: "PUBLIC",
              },
            ],
          });
        if (url === "https://api.pinterest.com/v5/user_account")
          return Response.json({
            id: "inventory-v2",
            username: "inventory-v2",
            account_type: "BUSINESS",
          });
        throw Error("Unexpected provider request: " + url);
      },
    );
    const environment = process.env.PINTEREST_API_ENVIRONMENT;
    process.env.PINTEREST_API_ENVIRONMENT = "production";
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(await consumeQueuedPinterestInventory()).toMatchObject({
        status: "COMPLETED",
        succeeded: 1,
        failed: 0,
      });
      expect(await consumeQueuedPinterestInventory()).toMatchObject({
        status: "COMPLETED",
        succeeded: 1,
        failed: 0,
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(
        await prisma.growthJob.findMany({
          where: { id: { in: jobs.map((j) => j.id) }, status: "SUCCEEDED" },
        }),
      ).toHaveLength(2);
      expect(
        await prisma.growthPinterestBoard.count({
          where: { accountId: account.id, isActive: true },
        }),
      ).toBe(1);
      expect(
        await prisma.growthSettings.findUniqueOrThrow({
          where: { id: "global" },
        }),
      ).toMatchObject({
        enabled: false,
        attributionEnabled: false,
        workerActivationExpiresAt: null,
      });
      expect(await prisma.growthPinPublication.count()).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      process.env.PINTEREST_API_ENVIRONMENT = environment;
    }
  });
  it("protects five daily Pin attempts from background maintenance while keeping the four/hour cap", async () => {
    const where = {
      entityType: "GrowthPinterestProviderBudget",
      entityId: "production-global",
      action: "PINTEREST_GLOBAL_API_REQUEST_RESERVED",
    };
    expect(await prisma.growthActivity.count({ where })).toBe(0);
    await prisma.growthActivity.createMany({
      data: Array.from({ length: 11 }, () => ({
        ...where,
        actorKind: "SYSTEM" as const,
        createdAt: new Date(Date.now() - 2 * 3600000),
        summary: {},
      })),
    });
    await expect(
      reservePinterestGlobalAttempt(prisma, "OTHER"),
    ).rejects.toMatchObject({ code: "GLOBAL_QUOTA_EXHAUSTED" });
    for (let i = 0; i < 4; i++)
      await reservePinterestGlobalAttempt(prisma, "PIN_WRITE");
    await expect(
      reservePinterestGlobalAttempt(prisma, "PIN_WRITE"),
    ).rejects.toMatchObject({ code: "GLOBAL_QUOTA_EXHAUSTED" });
    expect(await prisma.growthActivity.count({ where })).toBe(15);
    expect(
      await prisma.growthActivity.count({
        where: {
          ...where,
          summary: { path: ["requestKind"], equals: "PIN_WRITE" },
        },
      }),
    ).toBe(4);
  });
  it("promotes only the exact due read retry without resetting attempts or touching Pin retries", async () => {
    const data = {
      status: "FAILED_RETRYABLE" as const,
      attemptCount: 1,
      maxAttempts: 3,
      runAfter: new Date(+now - 1000),
      lastError: "transient",
    };
    const read = await prisma.growthJob.create({
      data: {
        ...data,
        type: "PINTEREST_BOARD_SYNC",
        idempotencyKey: "exact-read-" + randomUUID(),
      },
    });
    const other = await prisma.growthJob.create({
      data: {
        ...data,
        type: "PINTEREST_BOARD_SYNC",
        idempotencyKey: "other-read-" + randomUUID(),
      },
    });
    const pin = await prisma.growthJob.create({
      data: {
        ...data,
        type: "PINTEREST_PIN_PUBLISH",
        idempotencyKey: "pin-retry-" + randomUUID(),
      },
    });
    expect(
      await promoteDueGrowthRetries(now, 1, ["PINTEREST_BOARD_SYNC"], read.id),
    ).toBe(1);
    expect(
      await prisma.growthJob.findUniqueOrThrow({ where: { id: read.id } }),
    ).toMatchObject({
      status: "PENDING",
      attemptCount: 1,
      lastError: "transient",
    });
    expect(
      (await prisma.growthJob.findUniqueOrThrow({ where: { id: other.id } }))
        .status,
    ).toBe("FAILED_RETRYABLE");
    expect(
      (await prisma.growthJob.findUniqueOrThrow({ where: { id: pin.id } }))
        .status,
    ).toBe("FAILED_RETRYABLE");
  });
  it("persists the legacy expiry state without changing its original candidate", async () => {
    const { candidate, review } = await fixture();
    const snapshot = review.snapshot as {
      boardId: string;
      scheduledAt: string;
    };
    const legacy = await prisma.growthTelegramPinReview.create({
      data: {
        candidateId: candidate.id,
        candidateRevision: candidate.revision,
        contentHash: candidate.contentHash,
        assetChecksum: "a".repeat(64),
        accountId: candidate.accountId!,
        boardId: snapshot.boardId,
        scheduledAt: new Date(snapshot.scheduledAt),
        ownerUserId: config.ownerUserId,
        expiresAt: now,
        status: "SENT",
      },
    });
    await prisma.growthTelegramPinReview.update({
      where: { id: legacy.id },
      data: { status: "EXPIRED", actedAt: now },
    });
    expect(
      (
        await prisma.growthTelegramPinReview.findUniqueOrThrow({
          where: { id: legacy.id },
        })
      ).status,
    ).toBe("EXPIRED");
    expect(
      await prisma.growthPinCandidate.findUniqueOrThrow({
        where: { id: candidate.id },
      }),
    ).toEqual(candidate);
  });
  it("atomically converges simultaneous Admin/Discord approval to one publication", async () => {
    const { review } = await fixture();
    const input = {
      requestId: review.id,
      action: "APPROVE" as const,
      snapshotChecksum: review.snapshotChecksum,
    };
    const before = await prisma.growthPinPublication.count();
    const result = await Promise.all([
      decideGrowthReview(input, config.ownerUserId, "ADMIN"),
      decideGrowthReview(input, config.ownerUserId, "DISCORD"),
    ]);
    expect(result.map((x) => x.status)).toEqual(["APPROVED", "APPROVED"]);
    expect(result.filter((x) => !x.reused)).toHaveLength(1);
    expect(await prisma.growthPinPublication.count()).toBe(before + 1);
  });
  it("rolls back the entire decision when board eligibility fails", async () => {
    const { review } = await fixture();
    await prisma.growthPinterestBoard.updateMany({ data: { isActive: false } });
    await expect(
      decideGrowthReview(
        {
          requestId: review.id,
          action: "APPROVE",
          snapshotChecksum: review.snapshotChecksum,
        },
        config.ownerUserId,
        "ADMIN",
      ),
    ).rejects.toThrow();
    expect(
      (
        await prisma.growthApprovalRequest.findUniqueOrThrow({
          where: { id: review.id },
        })
      ).status,
    ).toBe("PENDING");
    expect(
      await prisma.growthPinApproval.count({
        where: { candidateId: review.subjectId },
      }),
    ).toBe(0);
    await prisma.growthPinterestBoard.updateMany({ data: { isActive: true } });
  });
  it("rejects unauthorized Admin and changed snapshot checksum", async () => {
    const { review } = await fixture();
    const input = {
      requestId: review.id,
      action: "REJECT" as const,
      snapshotChecksum: review.snapshotChecksum,
    };
    await expect(
      decideGrowthReview(input, "other-v2", "ADMIN"),
    ).rejects.toThrow("UNAUTHORIZED");
    await expect(
      decideGrowthReview(
        { ...input, snapshotChecksum: "f".repeat(64) },
        config.ownerUserId,
        "ADMIN",
      ),
    ).rejects.toThrow("MISMATCH");
    expect(
      (await decideGrowthReview(input, config.ownerUserId, "ADMIN")).status,
    ).toBe("REJECTED");
    expect(
      (
        await decideGrowthReview(
          { ...input, action: "APPROVE" },
          config.ownerUserId,
          "DISCORD",
        )
      ).status,
    ).toBe("REJECTED");
  });
  it("closes expired and stale creatives without scheduling", async () => {
    const stale = await fixture();
    await prisma.growthPinCandidate.update({
      where: { id: stale.candidate.id },
      data: { contentHash: "c".repeat(64) },
    });
    expect(
      (
        await decideGrowthReview(
          {
            requestId: stale.review.id,
            action: "APPROVE",
            snapshotChecksum: stale.review.snapshotChecksum,
          },
          config.ownerUserId,
          "ADMIN",
        )
      ).status,
    ).toBe("STALE");
    const expired = await fixture();
    expect(
      (
        await decideGrowthReview(
          {
            requestId: expired.review.id,
            action: "APPROVE",
            snapshotChecksum: expired.review.snapshotChecksum,
          },
          config.ownerUserId,
          "ADMIN",
          new Date(now.getTime() + 7200000),
        )
      ).status,
    ).toBe("EXPIRED");
  });
  it("protects request evidence and terminal decisions at the database layer", async () => {
    const { review } = await fixture();
    await expect(
      prisma.growthApprovalRequest.update({
        where: { id: review.id },
        data: { snapshot: {} },
      }),
    ).rejects.toThrow("immutable");
    await decideGrowthReview(
      {
        requestId: review.id,
        action: "REJECT",
        snapshotChecksum: review.snapshotChecksum,
      },
      config.ownerUserId,
      "ADMIN",
    );
    await expect(
      prisma.growthApprovalRequest.update({
        where: { id: review.id },
        data: { status: "PENDING", decidedAt: null },
      }),
    ).rejects.toThrow("terminal");
  });
  it("keeps Admin usable during Discord outage, with no repeated uncertain POST", async () => {
    await prisma.growthNotification.updateMany({
      where: { status: "QUEUED" },
      data: { status: "DEAD" },
    });
    const { review, notification } = await fixture();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: "32345678901234567",
          type: 1,
          recipients: [{ id: config.ownerDiscordId }],
        }),
      )
      .mockRejectedValueOnce(Error("offline"));
    await runDiscordOutbox(config, fetcher);
    expect(
      (
        await prisma.growthNotification.findUniqueOrThrow({
          where: { id: notification.id },
        })
      ).status,
    ).toBe("UNKNOWN");
    await runDiscordOutbox(config, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      (
        await decideGrowthReview(
          {
            requestId: review.id,
            action: "REJECT",
            snapshotChecksum: review.snapshotChecksum,
          },
          config.ownerUserId,
          "ADMIN",
        )
      ).status,
    ).toBe("REJECTED");
  });
  it("binds signed receipts to owner, DM, exact message and single interaction ID", async () => {
    const { review, notification } = await fixture();
    const channel = "32345678901234567",
      message = "42345678901234567";
    await prisma.growthNotification.update({
      where: { id: notification.id },
      data: {
        status: "SENT",
        providerChannelId: channel,
        providerMessageId: message,
      },
    });
    const interaction = {
      id: "52345678901234567",
      application_id: config.applicationId,
      type: 3,
      user: { id: config.ownerDiscordId },
      channel_id: channel,
      channel: { type: 1 },
      message: { id: message },
      data: { component_type: 2, custom_id: "growth:" + review.id + ":REJECT" },
    };
    expect(
      await receiveDiscordDecision(
        { ...interaction, user: { id: "62345678901234567" } },
        config,
      ),
    ).toBe(false);
    expect(
      await receiveDiscordDecision(
        { ...interaction, guild_id: "72345678901234567" },
        config,
      ),
    ).toBe(false);
    expect(
      await receiveDiscordDecision(
        { ...interaction, message: { id: "82345678901234567" } },
        config,
      ),
    ).toBe(false);
    expect(await receiveDiscordDecision(interaction, config)).toBe(true);
    expect(await receiveDiscordDecision(interaction, config)).toBe(true);
    expect(
      await prisma.growthDiscordInteraction.count({
        where: { id: interaction.id },
      }),
    ).toBe(1);
    await processDiscordDecisions(config);
    await processDiscordDecisions(config);
    expect(
      (
        await prisma.growthApprovalRequest.findUniqueOrThrow({
          where: { id: review.id },
        })
      ).status,
    ).toBe("REJECTED");
  });
  it("admits a conversion-specific campaign for an old promoted Translator and binds one paid attempt", async () => {
    await prisma.growthViralProgramSettings.upsert({
      where: { id: "global" },
      update: { mode: "ACTIVE" },
      create: { id: "global", mode: "ACTIVE" },
    });
    const { candidate } = await fixture();
    await prisma.translatorEditorialExample.create({
      data: {
        translatorId: candidate.translatorId!,
        originalText: "Could you send it today?",
        transformedText: "Would you kindly send that today?",
      },
    });
    const conversion = await prisma.growthViralConversion.create({
      data: {
        conceptId: randomUUID(),
        winningPinTestId: randomUUID(),
        translatorId: candidate.translatorId!,
        status: "EXISTING_TRANSLATOR",
        evidence: {},
        createdAt: new Date(Date.now() + 1),
      },
    });
    expect(
      (await readFreshCreativeTargets(false)).some(
        (t) => t.id === candidate.translatorId,
      ),
    ).toBe(false);
    expect(await readFreshCreativeTargets(true)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: candidate.translatorId,
          conversionId: conversion.id,
        }),
      ]),
    );
    const job = await prisma.growthJob.create({
      data: {
        type: "CREATIVE_LAB_GENERATE",
        idempotencyKey: "native-first-" + randomUUID(),
        payload: { targetKind: "TRANSLATOR", targetId: candidate.translatorId },
        maxAttempts: 1,
      },
    });
    expect(
      await bindNativeCampaignJob(
        conversion.id,
        candidate.translatorId!,
        job.id,
      ),
    ).toBe(true);
    expect(
      (await readFreshCreativeTargets(true)).some(
        (t) => t.id === candidate.translatorId,
      ),
    ).toBe(false);
    const duplicate = await prisma.growthJob.create({
      data: {
        type: "CREATIVE_LAB_GENERATE",
        idempotencyKey: "native-duplicate-" + randomUUID(),
        payload: { targetKind: "TRANSLATOR", targetId: candidate.translatorId },
        maxAttempts: 1,
      },
    });
    expect(
      await bindNativeCampaignJob(
        conversion.id,
        candidate.translatorId!,
        duplicate.id,
      ),
    ).toBe(false);
    expect(
      (
        await prisma.growthJob.findUniqueOrThrow({
          where: { id: duplicate.id },
        })
      ).status,
    ).toBe("CANCELLED");
    expect(
      (
        await prisma.growthViralConversion.findUniqueOrThrow({
          where: { id: conversion.id },
        })
      ).campaignJobId,
    ).toBe(job.id);
  });
  it("promotes a persistent source winner to one original decision with immutable lineage", async () => {
    await prisma.growthViralProgramSettings.upsert({
      where: { id: "global" },
      update: { mode: "ACTIVE" },
      create: {
        id: "global",
        mode: "ACTIVE",
        sourceSharePercent: 50,
        maxPinsPerDay: 5,
      },
    });
    const account = await prisma.growthPinterestAccount.create({
      data: {
        pinterestAccountId: "viral-prod-test",
        encryptedCredentials: "unused-test-credential",
        grantedScopes: [],
        username: "source-test",
        publicationRole: "SAYTWIST_IDEAS",
        activeRole: "SAYTWIST_IDEAS",
        apiEnvironment: "PRODUCTION",
        connectionStatus: "CONNECTED",
      },
    });
    const concept = await prisma.growthViralConcept.create({
      data: {
        title: "Royal English Translator",
        normalizedKey: "royal-english-v2",
        sourceUrl: "https://anythingtranslate.com/translators/royal-english/",
        status: "TESTING",
      },
    });
    const publishedAt = new Date(now.getTime() - 14 * 86400000);
    const source = await prisma.growthViralPinTest.create({
      data: {
        conceptId: concept.id,
        channel: "SOURCE",
        destinationUrl: concept.sourceUrl,
        status: "TRACKED",
        pinterestPinId: "92345678901234567",
        publishedAt,
        accountId: account.id,
      },
    });
    await prisma.growthPinterestPin.create({
      data: {
        pinterestPinId: source.pinterestPinId!,
        accountId: account.id,
        destinationUrl: source.destinationUrl,
        isActive: true,
        lastSeenAt: now,
        lastSyncedAt: now,
        publishedAt,
      },
    });
    for (const previous of [true, false])
      await prisma.growthViralMetricObservation.create({
        data: {
          pinTestId: source.id,
          observedAt: new Date(now.getTime() - (previous ? 86400000 : 0)),
          pinterestDataStatus: "READY",
          impressions: previous ? 2000 : 3000,
          saves: previous ? 120 : 180,
          outboundClicks: previous ? 60 : 90,
          baselineSaveRate: 0.01,
          baselineOutboundRate: 0.005,
          baselineImpressions: 100000,
          baselineSaves: 1000,
          baselineOutboundClicks: 500,
          windowStart: publishedAt,
          windowEnd: new Date(now.getTime() - (previous ? 2 : 1) * 86400000),
        },
      });
    expect(await qualifiedViralEvidence(source.id, now)).not.toBeNull();
    expect((await prepareViralWinnerConversions(now)).prepared).toBe(1);
    expect((await prepareViralWinnerConversions(now)).prepared).toBe(0);
    const conversion = await prisma.growthViralConversion.findUniqueOrThrow({
      where: { conceptId: concept.id },
    });
    expect(conversion.winningPinTestId).toBe(source.id);
    expect(
      (
        await prisma.growthDecision.findUniqueOrThrow({
          where: { id: conversion.decisionId! },
        })
      ).type,
    ).toBe("CREATE_TRANSLATOR");
    expect(
      (
        await prisma.growthViralPinTest.findUniqueOrThrow({
          where: { id: source.id },
        })
      ).destinationUrl,
    ).toBe(concept.sourceUrl);
    await prisma.growthPinterestPin.update({
      where: { pinterestPinId: source.pinterestPinId! },
      data: {
        destinationUrl: "https://saytwist.com/translators/royal-english",
      },
    });
    expect(await qualifiedViralEvidence(source.id, now)).toBeNull();
  });
  it("retries only confirmed Discord rate limits and finalizes closed cards by PATCH", async () => {
    await prisma.growthNotification.updateMany({
      where: { status: { in: ["QUEUED", "RETRY"] } },
      data: { status: "DEAD" },
    });
    const { notification, review } = await fixture();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: "32345678901234567",
          type: 1,
          recipients: [{ id: config.ownerDiscordId }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ retry_after: 1 }, { status: 429 }),
      );
    await runDiscordOutbox(config, fetcher, new Date(now.getTime() + 60000));
    expect(
      (
        await prisma.growthNotification.findUniqueOrThrow({
          where: { id: notification.id },
        })
      ).status,
    ).toBe("RETRY");
    const sent = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        if (url.endsWith("/users/@me/channels"))
          return Response.json({
            id: "32345678901234567",
            type: 1,
            recipients: [{ id: config.ownerDiscordId }],
          });
        if (init.method === "PATCH")
          return Response.json({ id: "42345678901234567" });
        return Response.json({
          id: "42345678901234567",
          channel_id: "32345678901234567",
        });
      });
    await runDiscordOutbox(config, sent, new Date(now.getTime() + 65000));
    expect(
      (
        await prisma.growthNotification.findUniqueOrThrow({
          where: { id: notification.id },
        })
      ).status,
    ).toBe("SENT");
    await decideGrowthReview(
      {
        requestId: review.id,
        action: "REJECT",
        snapshotChecksum: review.snapshotChecksum,
      },
      config.ownerUserId,
      "ADMIN",
    );
    sent.mockClear();
    await runDiscordOutbox(config, sent, new Date(now.getTime() + 70000));
    expect(sent.mock.calls.every(([, init]) => init.method === "PATCH")).toBe(
      true,
    );
    const payload = JSON.parse(sent.mock.calls[0][1].body);
    expect(
      payload.components[0].components
        .filter((c: { style: number }) => c.style !== 5)
        .every((c: { disabled: boolean }) => c.disabled),
    ).toBe(true);
    expect(
      (
        await prisma.growthNotification.findUniqueOrThrow({
          where: { id: notification.id },
        })
      ).finalizedAt,
    ).not.toBeNull();
  });

  it("applies only specifically approved budget values and rejects stale policy", async () => {
    const settings = await prisma.growthSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    const snapshot = {
      action: "CHANGE_AI_BUDGET",
      configVersion: settings.configVersion,
      before: {
        dailyCents: settings.aiDailyBudgetCents,
        monthlyCents: settings.aiMonthlyBudgetCents,
        imagesPerDay: settings.aiImagesPerDayCap,
      },
      after: { dailyCents: 210, monthlyCents: 3100, imagesPerDay: 3 },
      reason: "Owner budget review",
      benefits: "Explicit controlled capacity",
      risks: "Maximum additional exposure of 10 cents/day and 100 cents/month",
    };
    const review = await createBudgetChangeReview(snapshot, config.ownerUserId);
    expect(
      (
        await prisma.growthSettings.findUniqueOrThrow({
          where: { id: "global" },
        })
      ).aiDailyBudgetCents,
    ).toBe(settings.aiDailyBudgetCents);
    await decideGrowthReview(
      {
        requestId: review.id,
        action: "APPROVE",
        snapshotChecksum: review.snapshotChecksum,
      },
      config.ownerUserId,
      "DISCORD",
    );
    expect(
      (
        await prisma.growthSettings.findUniqueOrThrow({
          where: { id: "global" },
        })
      ).aiDailyBudgetCents,
    ).toBe(210);
    const stale = await createBudgetChangeReview(
      { ...snapshot, after: { ...snapshot.after, dailyCents: 220 } },
      config.ownerUserId,
    );
    expect(
      (
        await decideGrowthReview(
          {
            requestId: stale.id,
            action: "APPROVE",
            snapshotChecksum: stale.snapshotChecksum,
          },
          config.ownerUserId,
          "ADMIN",
        )
      ).status,
    ).toBe("STALE");
    expect(
      (
        await prisma.growthSettings.findUniqueOrThrow({
          where: { id: "global" },
        })
      ).aiDailyBudgetCents,
    ).toBe(210);
  });
  it("persists Google property date labels once without fabricating omitted dates", async () => {
    const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const config = {
      GROWTH_GOOGLE_ANALYTICS_ENABLED: "true",
      GROWTH_GA4_PROPERTY_ID: "123",
      GROWTH_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: "service_account",
        client_email: "growth@test.iam.gserviceaccount.com",
        private_key: key.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
        token_uri: "https://oauth2.googleapis.com/token",
      }),
    };
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        3 * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "fake",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          dimensionHeaders: [{ name: "date" }],
          metricHeaders: ["sessions", "activeUsers", "keyEvents"].map(
            (name) => ({ name, type: "TYPE_INTEGER" }),
          ),
          rows: [
            {
              dimensionValues: [{ value: date.replaceAll("-", "") }],
              metricValues: [{ value: "8" }, { value: "7" }, { value: "1" }],
            },
          ],
          rowCount: 1,
          metadata: { timeZone: "America/New_York" },
        }),
      );
    expect(
      (await synchronizeGoogleAnalytics(now, config, fetcher)).synchronized,
    ).toBe(1);
    expect(
      (await synchronizeGoogleAnalytics(now, config, fetcher)).synchronized,
    ).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const rows = await prisma.growthExternalAnalyticsDaily.findMany({
      where: { source: "GA4", accountId: "123" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].providerTimeZone).toBe("America/New_York");
    expect(rows[0].metrics).toEqual({
      sessions: "8",
      activeUsers: "7",
      keyEvents: "1",
    });
    const ledger = await prisma.growthAnalyticsCoverage.findUniqueOrThrow({
      where: {
        source_accountId_metricType: {
          source: "GA4",
          accountId: "123",
          metricType: "PROVIDER_DAILY",
        },
      },
    });
    expect(ledger.status).toBe("COVERED_WITH_OMISSIONS");
    expect((ledger.missingPeriods as unknown[]).length).toBe(89);
    fetcher
      .mockResolvedValueOnce(
        Response.json({
          access_token: "fake",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          dimensionHeaders: [{ name: "date" }],
          metricHeaders: ["sessions", "activeUsers", "keyEvents"].map(
            (name) => ({ name, type: "TYPE_INTEGER" }),
          ),
          rows: [],
          rowCount: 0,
          metadata: { timeZone: "America/New_York" },
        }),
      );
    await synchronizeGoogleAnalytics(
      new Date(now.getTime() + 86400000),
      config,
      fetcher,
    );
    const refreshed =
      await prisma.growthExternalAnalyticsDaily.findFirstOrThrow({
        where: { accountId: "123" },
      });
    expect(refreshed.qualityFlags).toContain("PROVIDER_OMITTED_ON_REFRESH");
    expect(refreshed.metrics).toEqual({
      sessions: "8",
      activeUsers: "7",
      keyEvents: "1",
    });
    const after = await prisma.growthAnalyticsCoverage.findUniqueOrThrow({
      where: {
        source_accountId_metricType: {
          source: "GA4",
          accountId: "123",
          metricType: "PROVIDER_DAILY",
        },
      },
    });
    expect((after.missingPeriods as unknown[]).length).toBe(90);
  });
  it("records revoked Google authorization and retries neither credentials nor metrics immediately", async () => {
    const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const config = {
      GROWTH_GOOGLE_ANALYTICS_ENABLED: "true",
      GROWTH_GA4_PROPERTY_ID: "456",
      GROWTH_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: "service_account",
        client_email: "growth@test.iam.gserviceaccount.com",
        private_key: key.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
        token_uri: "https://oauth2.googleapis.com/token",
      }),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("private failure body", { status: 403 }));
    await synchronizeGoogleAnalytics(now, config, fetcher);
    await synchronizeGoogleAnalytics(now, config, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const ledger = await prisma.growthAnalyticsCoverage.findUniqueOrThrow({
      where: {
        source_accountId_metricType: {
          source: "GA4",
          accountId: "456",
          metricType: "PROVIDER_DAILY",
        },
      },
    });
    expect(ledger.status).toBe("AUTHORIZATION_REQUIRED");
    expect(ledger.lastErrorCode).toBe("AUTHORIZATION");
    expect(
      await prisma.growthExternalAnalyticsDaily.count({
        where: { accountId: "456" },
      }),
    ).toBe(0);
  });
  it("durably accepts single-value private selects and rejects forged component types", async () => {
    const { review, notification } = await fixture();
    await prisma.growthNotification.update({ where: { id: notification.id }, data: {
      status: "SENT", providerChannelId: "32345678901234567", providerMessageId: "42345678901234567",
    } });
    const body = { id: "82345678901234567", application_id: config.applicationId, type: 3,
      user: { id: config.ownerDiscordId }, channel_id: "32345678901234567", channel: { type: 1 },
      message: { id: "42345678901234567" }, data: { component_type: 3, custom_id: "growth:" + review.id + ":PLAN_SITE", values: ["saytwist.com"] } };
    expect(await receiveDiscordDecision(body, config)).toBe(true);
    expect(await receiveDiscordDecision(body, config)).toBe(true);
    expect(await prisma.growthDiscordInteraction.count({ where: { id: body.id } })).toBe(1);
    expect((await prisma.growthDiscordInteraction.findUniqueOrThrow({ where: { id: body.id } })).selectionValue).toBe("saytwist.com");
    expect(await receiveDiscordDecision({ ...body, data: { ...body.data, component_type: 2 } }, config)).toBe(false);
    expect(await receiveDiscordDecision({ ...body, data: { ...body.data, values: ["saytwist.com", "evil.test"] } }, config)).toBe(false);
    expect(await receiveDiscordDecision({ ...body, user: { id: "92345678901234567" } }, config)).toBe(false);
    await prisma.growthDiscordInteraction.update({ where: { id: body.id }, data: { processedAt: new Date() } });
  });
  it("replaces a native website plan atomically without approval or extending expiry", async () => {
    const { review, candidate } = await fixture();
    const replacement = await replaceReviewPlan({ requestId: review.id, action: "PLAN_SITE", value: "translator.whattypeof.com" }, config.ownerUserId);
    expect(replacement.id).not.toBe(review.id);
    expect(replacement.status).toBe("PENDING");
    expect(replacement.expiresAt.getTime()).toBeLessThanOrEqual(review.expiresAt.getTime());
    expect(replacement.snapshot).toMatchObject({ destinationDomain: "translator.whattypeof.com" });
    expect((await prisma.growthApprovalRequest.findUniqueOrThrow({ where: { id: review.id } })).snapshot).toEqual(review.snapshot);
    expect((await prisma.growthApprovalRequest.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("STALE");
    expect(await prisma.growthPinApproval.count({ where: { candidateId: candidate.id } })).toBe(0);
    expect(await decideGrowthReview({ requestId: review.id, action: "APPROVE", snapshotChecksum: review.snapshotChecksum }, config.ownerUserId, "DISCORD")).toMatchObject({ status: "STALE" });
    expect((await replaceReviewPlan({ requestId: review.id, action: "PLAN_SITE", value: "saytwist.com" }, config.ownerUserId)).id).toBe(review.id);
    await expect(replaceReviewPlan({ requestId: replacement.id, action: "PLAN_SITE", value: "evil.test" }, config.ownerUserId)).rejects.toThrow("CHOICE_UNAVAILABLE");
    const choices = await readReviewChoices(replacement);
    const card = discordReviewCard(replacement, undefined, choices);
    expect(JSON.stringify(card)).toContain("PLAN_SITE");
    expect(JSON.stringify(card)).toContain("translator.whattypeof.com");
  });

  it("offers only active boards on the chosen production account and binds the candidate revision", async () => {
    const { review, candidate } = await fixture();
    const targetAccount = await prisma.growthPinterestAccount.findFirstOrThrow({ where: { apiEnvironment: "PRODUCTION", activeRole: "SAYTWIST_IDEAS" } });
    await prisma.growthPinterestAccount.update({ where: { id: targetAccount.id }, data: { grantedScopes: ["pins:read", "pins:write", "boards:read", "boards:write"] } });
    await prisma.growthPinterestBoard.create({ data: { accountId: targetAccount.id, pinterestBoardId: "choice-board", name: "Choice Board", isActive: true, lastSeenAt: now, lastSyncedAt: now } });
    const choices = await readReviewChoices(review);
    expect(choices.accounts.length).toBeGreaterThan(0);
    const account = choices.accounts[0];
    const replacement = await replaceReviewPlan({ requestId: review.id, action: "PLAN_ACCOUNT", value: account.value }, config.ownerUserId);
    const snapshot = replacement.snapshot as { accountId: string; boardId: string; revision: number };
    const changed = await prisma.growthPinCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(changed.accountId).toBe(account.value);
    expect(changed.boardId).toBe(snapshot.boardId);
    expect(changed.revision).toBe(candidate.revision + 1);
    expect(snapshot.revision).toBe(changed.revision);
    const available = await readReviewChoices(replacement);
    expect(available.boards.some(b => b.value === snapshot.boardId)).toBe(true);
    await expect(replaceReviewPlan({ requestId: replacement.id, action: "PLAN_BOARD", value: "unknown-board" }, config.ownerUserId)).rejects.toThrow("CHOICE_UNAVAILABLE");
    expect(await prisma.growthPinPublication.count({ where: { candidateId: candidate.id } })).toBe(0);
  });

});
