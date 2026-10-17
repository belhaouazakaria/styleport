import { randomBytes, randomUUID } from "node:crypto";

import {
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
  GrowthJobStatus,
} from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  enqueuePinterestAnalyticsRecovery,
  previewPinterestAnalyticsRecovery,
  recoverPinterestAnalyticsGaps,
} from "@/lib/growth/pinterest/analytics-recovery";
import { encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";
import { prisma } from "@/lib/prisma";
import { runGrowthWorker } from "@/lib/growth/worker";
import {
  cancelGrowthJob,
  failGrowthJob,
  recoverStaleGrowthJobs,
} from "@/lib/growth/jobs";

const enabled = process.env.RUN_GROWTH_ANALYTICS_RECOVERY_DB_TESTS === "1";
const databaseDescribe = enabled ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase12_2_recovery_test";
const encryptionKey = randomBytes(32).toString("base64");

if (enabled) {
  const explicitUrl = process.env.GROWTH_ANALYTICS_RECOVERY_TEST_DATABASE_URL;
  if (!explicitUrl || process.env.DATABASE_URL !== explicitUrl)
    throw new Error(
      "Phase 12.2 DB tests require matching explicit test database URLs.",
    );
  const parsed = new URL(explicitUrl);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) ||
    decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName
  ) {
    throw new Error(
      `Phase 12.2 DB tests refuse every target except local database ${requiredDatabaseName}.`,
    );
  }
}

async function clean() {
  await prisma.growthActivity.deleteMany();
  await prisma.growthLearningRun.deleteMany();
  await prisma.growthJob.deleteMany();
  await prisma.growthPinterestAnalyticsRecoveryTask.deleteMany();
  await prisma.growthPinterestAnalyticsRecovery.deleteMany();
  await prisma.growthPinterestPinMetricDaily.deleteMany();
  await prisma.growthPinterestPin.deleteMany();
  await prisma.growthPinterestAnalyticsState.deleteMany();
  await prisma.growthPinterestBoard.deleteMany();
  await prisma.growthPinterestAccount.deleteMany();
  await prisma.user.deleteMany({ where: { email: { endsWith: "@recovery.test" } } });
  await prisma.growthSettings.upsert({
    where: { id: "global" },
    create: { id: "global", enabled: false },
    update: { enabled: false },
  });
}

async function fixture(pinCount = 1) {
  const admin = await prisma.user.create({
    data: {
      email: `${randomUUID()}@recovery.test`,
      passwordHash: "test-only",
      role: "ADMIN",
    },
  });
  const account = await prisma.growthPinterestAccount.create({
    data: {
      pinterestAccountId: `account-${randomUUID()}`,
      publicationRole: GrowthPinterestPublicationRole.SAYTWIST,
      activeRole: GrowthPinterestPublicationRole.SAYTWIST,
      username: `user-${randomUUID()}`,
      apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
      connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
      grantedScopes: [
        "boards:read",
        "boards:write",
        "pins:read",
        "pins:write",
        "user_accounts:read",
      ],
      encryptedCredentials: encryptPinterestCredentials(
        { accessToken: "access", refreshToken: "refresh" },
        encryptionKey,
      ),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  await prisma.growthPinterestAnalyticsState.create({
    data: {
      accountId: account.id,
      status: "FRESH",
      lastSuccessfulSyncAt: new Date("2026-10-16T01:00:00Z"),
      lastError: "preserve-health-state",
      lastRateLimitLimit: "60",
      lastRateLimitRemaining: "58",
      lastRateLimitReset: "3600",
      rateLimitObservedAt: new Date(),
    },
  });
  const pins = await Promise.all(
    Array.from({ length: pinCount }, (_, index) =>
      prisma.growthPinterestPin.create({
        data: {
          accountId: account.id,
          pinterestPinId: String(10_000 + index),
          destinationUrl: `https://saytwist.com/translators/recovery-${index}`,
          publishedAt: new Date("2026-10-01T12:00:00Z"),
          isActive: true,
          analyticsEligible: true,
          lastSeenAt: new Date(),
          lastSyncedAt: new Date(),
        },
      }),
    ),
  );
  return { admin, account, pins };
}

function response(
  rows: Array<{
    date: string;
    data_status: string;
    metrics?: Record<string, number>;
  }>,
  remaining = "900",
) {
  return new Response(
    JSON.stringify({
      all: {
        daily_metrics: rows.map((row) => ({
          ...row,
          metrics: row.metrics || {
            IMPRESSION: 10,
            SAVE: 1,
            PIN_CLICK: 2,
            OUTBOUND_CLICK: 1,
          },
        })),
      },
    }),
    {
      status: 200,
      headers: {
        "x-ratelimit-limit": "60",
        "x-ratelimit-remaining": remaining,
        "x-ratelimit-reset": "3600",
      },
    },
  );
}

beforeAll(() => {
  vi.stubEnv("PINTEREST_APP_ID", "recovery-app");
  vi.stubEnv("PINTEREST_APP_SECRET", "recovery-secret");
  vi.stubEnv(
    "PINTEREST_REDIRECT_URI",
    "http://localhost:3000/api/admin/growth/pinterest/oauth/callback",
  );
  vi.stubEnv("PINTEREST_API_ENVIRONMENT", "production");
  vi.stubEnv("GROWTH_CREDENTIAL_ENCRYPTION_KEY", encryptionKey);
});
beforeEach(clean);
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  if (enabled) await clean();
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});

databaseDescribe("Pinterest Phase 12.2 recovery persistence", () => {
  it("deduplicates concurrent confirmed recovery requests", async () => {
    const { admin, account } = await fixture(2);
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const input = {
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    };
    const [left, right] = await Promise.all([
      enqueuePinterestAnalyticsRecovery(input),
      enqueuePinterestAnalyticsRecovery(input),
    ]);
    expect(left.recovery.id).toBe(right.recovery.id);
    expect(await prisma.growthPinterestAnalyticsRecovery.count()).toBe(1);
    expect(await prisma.growthPinterestAnalyticsRecoveryTask.count()).toBe(2);
    expect(await prisma.growthJob.count()).toBe(1);
  });

  it("honors the kill switch and permits only one concurrent worker claim", async () => {
    const { admin, account } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await expect(
      runGrowthWorker({ workerId: "recovery-disabled" }),
    ).resolves.toMatchObject({ status: "DISABLED", claimed: 0 });
    await prisma.growthSettings.update({
      where: { id: "global" },
      data: { enabled: true, workerBatchSize: 1 },
    });
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        response([{ date: "2026-10-04", data_status: "READY" }]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const results = await Promise.all([
      runGrowthWorker({ workerId: "recovery-left", batchSize: 1 }),
      runGrowthWorker({ workerId: "recovery-right", batchSize: 1 }),
    ]);
    expect(results.reduce((sum, result) => sum + result.claimed, 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + result.succeeded, 0)).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves provider statuses and account health for incomplete responses", async () => {
    const { admin, account, pins } = await fixture();
    const learningRun = await prisma.growthLearningRun.create({
      data: {
        analysisDate: new Date("2026-10-15T00:00:00Z"),
        evidenceWindowStart: new Date("2026-07-17T00:00:00Z"),
        evidenceWindowEnd: new Date("2026-10-15T00:00:00Z"),
        learningModelVersion: "growth_learning_v2",
        evergreenModelVersion: "evergreen_learning_v2",
        schedulerModelVersion: "learned_scheduler_v2",
        experimentModelVersion: "experiment_evaluation_v1",
        opportunityFeedbackVersion: "opportunity_feedback_v1",
        evidenceQuality: "PARTIAL",
        attributionAvailability: "UNAVAILABLE",
        targetsConsidered: 355,
        recommendationsProduced: 355,
        reasonCodes: ["LEGACY_EVIDENCE_PARTIAL"],
        performanceFindings: { immutable: true },
        opportunityAdjustments: [],
        summary: "Immutable Phase 12.1 production evidence fixture.",
      },
    });
    await prisma.growthPinterestPinMetricDaily.create({
      data: {
        pinId: pins[0].id,
        metricDate: new Date("2026-10-04T00:00:00Z"),
        dataStatus: "PROCESSING",
        fetchedAt: new Date("2026-10-05T00:00:00Z"),
      },
    });
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-05",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      response([
        { date: "2026-10-04", data_status: "READY" },
        { date: "2026-10-05", data_status: "PROCESSING", metrics: {} },
      ]),
    );
    const before = await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({
      where: { accountId: account.id },
    });
    await recoverPinterestAnalyticsGaps({
      recoveryId: queued.recovery.id,
      batch: 0,
      fetchImpl: fetchMock,
    });
    const rows = await prisma.growthPinterestPinMetricDaily.findMany({
      where: { pinId: pins[0].id },
      orderBy: { metricDate: "asc" },
    });
    expect(rows.map((row) => row.dataStatus)).toEqual([
      "READY",
      "PROCESSING",
    ]);
    expect(rows[1].impressions).toBeNull();
    expect(rows[1].outboundClicks).toBeNull();
    expect(
      await prisma.growthPinterestAnalyticsRecovery.findUniqueOrThrow({
        where: { id: queued.recovery.id },
      }),
    ).toMatchObject({ status: "COMPLETED_WITH_GAPS", requestsCompleted: 1 });
    const after = await prisma.growthPinterestAnalyticsState.findUniqueOrThrow({
      where: { accountId: account.id },
    });
    expect(after.status).toBe(before.status);
    expect(after.lastSuccessfulSyncAt).toEqual(before.lastSuccessfulSyncAt);
    expect(after.lastError).toBe(before.lastError);
    expect(
      await prisma.growthLearningRun.findUniqueOrThrow({
        where: { id: learningRun.id },
      }),
    ).toEqual(learningRun);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/pins/10000/analytics");
  });

  it("stops at the observed rate-limit reserve and resumes via a continuation", async () => {
    const { admin, account } = await fixture(9);
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const firstFetch = vi
      .fn()
      .mockResolvedValue(
        response([{ date: "2026-10-04", data_status: "READY" }], "5"),
      );
    await expect(
      recoverPinterestAnalyticsGaps({
        recoveryId: queued.recovery.id,
        batch: 0,
        fetchImpl: firstFetch,
      }),
    ).resolves.toMatchObject({ complete: false, requests: 1, pendingTasks: 8 });
    const continuation = await prisma.growthJob.findFirstOrThrow({
      where: {
        type: "PINTEREST_ANALYTICS_GAP_RECOVERY",
        id: { not: queued.job.id },
      },
    });
    expect(continuation.runAfter.getTime()).toBeGreaterThan(Date.now());

    await prisma.growthPinterestAnalyticsState.update({
      where: { accountId: account.id },
      data: {
        lastRateLimitRemaining: "60",
        lastRateLimitReset: "3600",
        rateLimitObservedAt: new Date(),
      },
    });
    const secondFetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          response([{ date: "2026-10-04", data_status: "READY" }]),
        ),
      );
    await expect(
      recoverPinterestAnalyticsGaps({
        recoveryId: queued.recovery.id,
        batch: 1,
        fetchImpl: secondFetch,
      }),
    ).resolves.toMatchObject({ complete: true, status: "COMPLETED" });
    expect(secondFetch).toHaveBeenCalledTimes(8);
    expect(
      await prisma.growthPinterestAnalyticsRecovery.findUniqueOrThrow({
        where: { id: queued.recovery.id },
      }),
    ).toMatchObject({ requestsCompleted: 9, status: "COMPLETED" });
  });

  it("does not make the first GET when the latest quota is at the reserve", async () => {
    const { admin, account } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const observedAt = new Date();
    const resetAt = new Date(observedAt.getTime() + 35_000);
    await prisma.growthPinterestAnalyticsState.update({
      where: { accountId: account.id },
      data: {
        lastRateLimitRemaining: "5",
        lastRateLimitReset: "35",
        rateLimitObservedAt: observedAt,
      },
    });
    const fetchMock = vi.fn();
    await expect(
      recoverPinterestAnalyticsGaps({
        recoveryId: queued.recovery.id,
        batch: 0,
        fetchImpl: fetchMock,
      }),
    ).resolves.toMatchObject({ complete: false, requests: 0, pendingTasks: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    const continuation = await prisma.growthJob.findFirstOrThrow({
      where: { id: { not: queued.job.id } },
    });
    expect(continuation.runAfter.getTime()).toBeGreaterThanOrEqual(
      resetAt.getTime(),
    );
  });

  it("refreshes an expired quota with one read-only account GET before any Pin GET", async () => {
    const { admin, account } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await prisma.growthPinterestAnalyticsState.update({
      where: { accountId: account.id },
      data: {
        lastRateLimitRemaining: "99",
        lastRateLimitReset: "4",
        rateLimitObservedAt: new Date(Date.now() - 10_000),
      },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/user_account")) {
        return new Response(
          JSON.stringify({ id: account.pinterestAccountId, username: account.username }),
          {
            status: 200,
            headers: {
              "x-ratelimit-limit": "100",
              "x-ratelimit-remaining": "98",
              "x-ratelimit-reset": "60",
            },
          },
        );
      }
      if (String(url).includes("/pins/10000/analytics")) {
        return response([{ date: "2026-10-04", data_status: "READY" }], "97");
      }
      throw new Error("Unexpected Pinterest API endpoint.");
    });
    await expect(
      recoverPinterestAnalyticsGaps({
        recoveryId: queued.recovery.id,
        batch: 0,
        fetchImpl: fetchMock,
      }),
    ).resolves.toMatchObject({ complete: true, requests: 1, status: "COMPLETED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/user_account");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/pins/10000/analytics");
    expect(await prisma.growthPinterestAnalyticsRecovery.findUniqueOrThrow({
      where: { id: queued.recovery.id },
    })).toMatchObject({ requestsCompleted: 1, status: "COMPLETED" });
  });

  it("defers a recovery without spending Pin requests when fresh quota is at the five-request reserve", async () => {
    const { admin, account } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await prisma.growthPinterestAnalyticsState.update({
      where: { accountId: account.id },
      data: {
        lastRateLimitRemaining: "99",
        lastRateLimitReset: "4",
        rateLimitObservedAt: new Date(Date.now() - 10_000),
      },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (!String(url).endsWith("/user_account")) throw new Error("Pin GET is not allowed");
      return new Response(
        JSON.stringify({ id: account.pinterestAccountId, username: account.username }),
        {
          status: 200,
          headers: {
            "x-ratelimit-limit": "100",
            "x-ratelimit-remaining": "5",
            "x-ratelimit-reset": "1",
          },
        },
      );
    });
    await expect(
      recoverPinterestAnalyticsGaps({
        recoveryId: queued.recovery.id,
        batch: 0,
        fetchImpl: fetchMock,
      }),
    ).resolves.toMatchObject({ complete: false, requests: 0, pendingTasks: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const continuation = await prisma.growthJob.findFirstOrThrow({
      where: { id: { not: queued.job.id } },
    });
    expect(continuation.runAfter.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.growthPinterestAnalyticsRecovery.findUniqueOrThrow({
      where: { id: queued.recovery.id },
    })).toMatchObject({ requestsCompleted: 0, status: "RUNNING" });
  });

  it("allows Pin recovery when Pinterest reports its standard one-second quota reset", async () => {
    const { admin, account } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await prisma.growthPinterestAnalyticsState.update({
      where: { accountId: account.id },
      data: {
        lastRateLimitRemaining: "99",
        lastRateLimitReset: "1",
        rateLimitObservedAt: new Date(Date.now() - 10_000),
      },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/user_account")) {
        return new Response(
          JSON.stringify({ id: account.pinterestAccountId, username: account.username }),
          {
            status: 200,
            headers: {
              "x-ratelimit-limit": "100, 100;w=1, 1000;w=60",
              "x-ratelimit-remaining": "99",
              "x-ratelimit-reset": "1",
            },
          },
        );
      }
      if (String(url).includes("/pins/10000/analytics")) {
        return new Response(
          JSON.stringify({
            all: { daily_metrics: [{
              date: "2026-10-04", data_status: "READY",
              metrics: { IMPRESSION: 10, SAVE: 1, PIN_CLICK: 2, OUTBOUND_CLICK: 1 },
            }] },
          }),
          {
            status: 200,
            headers: {
              "x-ratelimit-limit": "100, 100;w=1, 1000;w=60",
              "x-ratelimit-remaining": "98",
              "x-ratelimit-reset": "1",
            },
          },
        );
      }
      throw new Error("Unexpected provider request");
    });
    await expect(
      recoverPinterestAnalyticsGaps({
        recoveryId: queued.recovery.id,
        batch: 0,
        fetchImpl: fetchMock,
      }),
    ).resolves.toMatchObject({ requests: 1, complete: true, status: "COMPLETED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/user_account");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/pins/10000/analytics");
    expect(await prisma.growthPinterestAnalyticsRecovery.findUniqueOrThrow({
      where: { id: queued.recovery.id },
    })).toMatchObject({ status: "COMPLETED", requestsCompleted: 1 });
  });

  it("fails closed when a quota refresh has malformed reset metadata", async () => {
    const { admin, account } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await prisma.growthPinterestAnalyticsState.update({
      where: { accountId: account.id },
      data: {
        lastRateLimitRemaining: "99",
        lastRateLimitReset: "4",
        rateLimitObservedAt: new Date(Date.now() - 10_000),
      },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (!String(url).endsWith("/user_account")) throw new Error("Pin GET is not allowed");
      return new Response(
        JSON.stringify({ id: account.pinterestAccountId, username: account.username }),
        {
          status: 200,
          headers: {
            "x-ratelimit-limit": "100",
            "x-ratelimit-remaining": "98",
            "x-ratelimit-reset": "invalid",
          },
        },
      );
    });
    await expect(
      recoverPinterestAnalyticsGaps({
        recoveryId: queued.recovery.id,
        batch: 0,
        fetchImpl: fetchMock,
      }),
    ).rejects.toThrow("unreliable metadata");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await prisma.growthPinterestAnalyticsRecoveryTask.count({
      where: { recoveryId: queued.recovery.id, status: "PENDING" },
    })).toBe(1);
    expect(await prisma.growthPinterestAnalyticsRecovery.findUniqueOrThrow({
      where: { id: queued.recovery.id },
    })).toMatchObject({ requestsCompleted: 0 });
  });

  it("revalidates preview evidence after acquiring the account lock", async () => {
    const { admin, account, pins } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    let releaseLock!: () => void;
    let lockAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => {
      lockAcquired = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lock = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${account.id})) IS NULL AS "locked"`;
      lockAcquired();
      await release;
    });
    await acquired;
    const enqueue = enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await prisma.growthPinterestPinMetricDaily.create({
      data: {
        pinId: pins[0].id,
        metricDate: new Date("2026-10-04T00:00:00Z"),
        impressions: 1,
        saves: 0,
        pinClicks: 0,
        outboundClicks: 0,
        dataStatus: "READY",
        fetchedAt: new Date(),
      },
    });
    releaseLock();
    await lock;
    await expect(enqueue).rejects.toThrow("changed after preview");
    expect(await prisma.growthPinterestAnalyticsRecovery.count()).toBe(0);
  });

  it("cancels a continuation, preserves tasks, and permits a new approval", async () => {
    const { admin, account } = await fixture(2);
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await recoverPinterestAnalyticsGaps({
      recoveryId: queued.recovery.id,
      batch: 0,
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          response([{ date: "2026-10-04", data_status: "READY" }], "5"),
        ),
    });
    const continuation = await prisma.growthJob.findFirstOrThrow({
      where: { id: { not: queued.job.id } },
    });
    await cancelGrowthJob(continuation.id, admin.id);
    expect(
      await prisma.growthPinterestAnalyticsRecovery.findUniqueOrThrow({
        where: { id: queued.recovery.id },
      }),
    ).toMatchObject({ status: "CANCELLED" });
    expect(
      await prisma.growthPinterestAnalyticsRecoveryTask.count({
        where: { recoveryId: queued.recovery.id },
      }),
    ).toBe(2);
    expect(
      await prisma.growthJob.count({
        where: {
          type: "PINTEREST_ANALYTICS_GAP_RECOVERY",
          status: { not: "CANCELLED" },
        },
      }),
    ).toBe(0);
    expect(
      await prisma.growthActivity.count({
        where: {
          entityId: queued.recovery.id,
          action: "PINTEREST_ANALYTICS_RECOVERY_CANCELLED",
        },
      }),
    ).toBe(1);

    const nextPreview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const next = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: nextPreview.startDate,
      endDate: nextPreview.endDate,
      previewToken: nextPreview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    expect(next.recovery.id).not.toBe(queued.recovery.id);
  });

  it("leaves a task pending after a retryable provider failure", async () => {
    const { admin, account } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await expect(
      recoverPinterestAnalyticsGaps({
        recoveryId: queued.recovery.id,
        batch: 0,
        fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
      }),
    ).rejects.toThrow("HTTP 503");
    expect(
      await prisma.growthPinterestAnalyticsRecoveryTask.count({
        where: { recoveryId: queued.recovery.id, status: "PENDING" },
      }),
    ).toBe(1);
  });

  it("resumes an interrupted recovery and keeps the retry idempotent", async () => {
    const { admin, account, pins } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    await prisma.growthPinterestAnalyticsRecovery.update({
      where: { id: queued.recovery.id },
      data: { status: "RUNNING", startedAt: new Date(Date.now() - 120_000) },
    });
    await prisma.growthJob.update({
      where: { id: queued.job.id },
      data: {
        status: GrowthJobStatus.RUNNING,
        workerId: "interrupted-worker",
        attemptCount: 1,
        claimedAt: new Date(Date.now() - 120_000),
        leaseUntil: new Date(Date.now() - 60_000),
        heartbeatAt: new Date(Date.now() - 120_000),
      },
    });
    await expect(recoverStaleGrowthJobs(new Date())).resolves.toBe(1);
    expect(
      await prisma.growthJob.findUniqueOrThrow({ where: { id: queued.job.id } }),
    ).toMatchObject({ status: GrowthJobStatus.PENDING, attemptCount: 1 });

    await prisma.growthSettings.update({
      where: { id: "global" },
      data: { enabled: true, workerBatchSize: 1 },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response([{ date: "2026-10-04", data_status: "READY" }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      runGrowthWorker({ workerId: "replacement-worker", batchSize: 1 }),
    ).resolves.toMatchObject({ claimed: 1, succeeded: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      await prisma.growthPinterestPinMetricDaily.count({
        where: { pinId: pins[0].id, metricDate: new Date("2026-10-04T00:00:00Z") },
      }),
    ).toBe(1);

    const redundantFetch = vi.fn();
    await expect(
      recoverPinterestAnalyticsGaps({
        recoveryId: queued.recovery.id,
        batch: 0,
        fetchImpl: redundantFetch,
      }),
    ).resolves.toMatchObject({ complete: true, reused: true });
    expect(redundantFetch).not.toHaveBeenCalled();
  });

  it("releases the active recovery gate when the job exhausts retries", async () => {
    const { admin, account } = await fixture();
    const preview = await previewPinterestAnalyticsRecovery({
      accountId: account.id,
      startDate: "2026-10-04",
      endDate: "2026-10-04",
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const queued = await enqueuePinterestAnalyticsRecovery({
      accountId: account.id,
      adminUserId: admin.id,
      startDate: preview.startDate,
      endDate: preview.endDate,
      previewToken: preview.previewToken,
      now: new Date("2026-10-16T12:00:00Z"),
    });
    const running = await prisma.growthJob.update({
      where: { id: queued.job.id },
      data: {
        status: GrowthJobStatus.RUNNING,
        workerId: "recovery-terminal",
        attemptCount: 5,
        maxAttempts: 5,
      },
    });
    await expect(
      failGrowthJob(running, "recovery-terminal", new Error("provider unavailable")),
    ).resolves.toBe(GrowthJobStatus.FAILED_TERMINAL);
    expect(
      await prisma.growthPinterestAnalyticsRecovery.findUniqueOrThrow({
        where: { id: queued.recovery.id },
      }),
    ).toMatchObject({ status: "FAILED" });
  });
});
