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
import { failGrowthJob } from "@/lib/growth/jobs";

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
    { status: 200, headers: { "x-ratelimit-remaining": remaining } },
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
