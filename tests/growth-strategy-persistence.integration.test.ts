import {
  GrowthPinterestAnalyticsStatus,
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enqueueAccountStrategyReview,
  evaluateAccountStrategy,
  persistAccountStrategyReview,
} from "@/lib/growth/strategy/review";
import { runGrowthWorker } from "@/lib/growth/worker";
import { prisma } from "@/lib/prisma";

const enabled = process.env.RUN_GROWTH_STRATEGY_DB_TESTS === "1";
const databaseDescribe = enabled ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase6_strategy_test";
const now = new Date("2026-10-06T12:00:00.000Z");

if (enabled) {
  const explicitUrl = process.env.GROWTH_STRATEGY_TEST_DATABASE_URL;
  if (!explicitUrl || process.env.DATABASE_URL !== explicitUrl)
    throw new Error(
      "Growth strategy DB tests require matching explicit test database URLs.",
    );
  const parsed = new URL(explicitUrl);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) ||
    decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName
  ) {
    throw new Error(
      `Growth strategy DB tests refuse every target except local database ${requiredDatabaseName}.`,
    );
  }
}

async function clean() {
  await prisma.growthActivity.deleteMany();
  await prisma.growthJob.deleteMany();
  await prisma.growthWorkerHeartbeat.deleteMany();
  await prisma.growthAccountStrategyReview.deleteMany();
  await prisma.growthAttributionEvent.deleteMany();
  await prisma.growthAttributionSession.deleteMany();
  await prisma.growthAttributionDailyAggregate.deleteMany();
  await prisma.growthAttributionRef.deleteMany();
  await prisma.growthPinterestPinMetricDaily.deleteMany();
  await prisma.growthPinterestAccountMetricDaily.deleteMany();
  await prisma.growthPinterestPin.deleteMany();
  await prisma.growthPinterestAnalyticsState.deleteMany();
  await prisma.growthPinterestBoard.deleteMany();
  await prisma.growthPinterestAccount.deleteMany();
  await prisma.growthSettings.deleteMany();
}

async function createRole(
  role: GrowthPinterestPublicationRole,
  options?: { evidence?: boolean; dominant?: boolean },
) {
  const account = await prisma.growthPinterestAccount.create({
    data: {
      pinterestAccountId: `pinterest-${role}`,
      publicationRole: role,
      activeRole: role,
      username: role.toLowerCase(),
      apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
      connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
      grantedScopes: [
        "boards:read",
        "pins:read",
        "pins:write",
        "user_accounts:read",
      ],
      encryptedCredentials: "integration-fixture-envelope-not-a-real-token",
      accessTokenExpiresAt: new Date("2026-12-01T00:00:00Z"),
      refreshTokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
      lastSuccessfulApiCallAt: now,
      lastAccountSyncAt: now,
      lastBoardSyncAt: now,
    },
  });
  const board = await prisma.growthPinterestBoard.create({
    data: {
      accountId: account.id,
      pinterestBoardId: `board-${role}`,
      name: `${role} board`,
      privacy: "PUBLIC",
      isActive: true,
      lastSeenAt: now,
      lastSyncedAt: now,
    },
  });
  if (options?.evidence) {
    await prisma.growthPinterestAnalyticsState.create({
      data: {
        accountId: account.id,
        status: GrowthPinterestAnalyticsStatus.FRESH,
        inventoryPinCount: 5,
        backfillPinsTotal: 5,
        backfillPinsProcessed: 5,
        lastSuccessfulSyncAt: now,
        lastInventorySyncAt: now,
        lastAccountAnalyticsSyncAt: now,
        lastPinAnalyticsSyncAt: now,
      },
    });
    for (let index = 0; index < 28; index += 1) {
      const metricDate = new Date("2026-09-08T00:00:00Z");
      metricDate.setUTCDate(metricDate.getUTCDate() + index);
      await prisma.growthPinterestAccountMetricDaily.create({
        data: {
          accountId: account.id,
          metricDate,
          impressions: BigInt(100),
          saves: BigInt(5),
          pinClicks: BigInt(4),
          outboundClicks: BigInt(3),
          engagements: BigInt(9),
          dataStatus: "READY",
          fetchedAt: now,
        },
      });
    }
    for (let index = 0; index < 5; index += 1) {
      const destination =
        role === GrowthPinterestPublicationRole.SAYTWIST_IDEAS
          ? `/ideas/example-${index}`
          : `/translators/example-${index}`;
      const pin = await prisma.growthPinterestPin.create({
        data: {
          accountId: account.id,
          boardId: board.id,
          pinterestBoardId: board.pinterestBoardId,
          pinterestPinId: `pin-${role}-${index}`,
          title:
            role === GrowthPinterestPublicationRole.SAYTWIST_PLAYGROUND
              ? "Funny personality quiz"
              : "Useful language",
          description: "Local strategy fixture",
          destinationUrl: `https://saytwist.com${destination}`,
          isActive: true,
          analyticsEligible: true,
          lastSeenAt: now,
          lastSyncedAt: now,
          lastAnalyticsSyncAt: now,
        },
      });
      await prisma.growthPinterestPinMetricDaily.create({
        data: {
          pinId: pin.id,
          metricDate: new Date("2026-10-05T00:00:00Z"),
          impressions:
            options.dominant && index === 0 ? BigInt(9_000) : BigInt(100),
          saves: BigInt(2),
          pinClicks: BigInt(2),
          outboundClicks:
            options.dominant && index === 0 ? BigInt(900) : BigInt(10),
          dataStatus: "READY",
          fetchedAt: now,
        },
      });
    }
  }
  return account;
}

beforeEach(async () => {
  vi.stubEnv("GROWTH_ATTRIBUTION_COLLECTION_ENABLED", "false");
  await clean();
  await prisma.growthSettings.create({
    data: { id: "global", enabled: true, attributionEnabled: false },
  });
});

afterAll(async () => {
  if (enabled) await clean();
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});

databaseDescribe("Growth Phase 6 account strategy persistence", () => {
  it("represents one connected role plus two unconnected roles and completes the baseline first", async () => {
    await createRole(GrowthPinterestPublicationRole.SAYTWIST, {
      evidence: true,
    });
    const evidence = await evaluateAccountStrategy({ now });
    expect(evidence.roles).toHaveLength(3);
    expect(evidence.portfolio).toMatchObject({
      plannedRoles: 3,
      connectedRoles: 1,
      recommendation: "COMPLETE_BASELINE_PORTFOLIO",
      recommendedAccountCount: 3,
    });
    expect(
      evidence.roles.filter((role) => role.health === "NOT_CONNECTED"),
    ).toHaveLength(2);
    expect(
      evidence.roles.find(
        (role) => role.role === GrowthPinterestPublicationRole.SAYTWIST_IDEAS,
      )?.metrics,
    ).toMatchObject({ state: "NOT_APPLICABLE", impressions: null });
    expect(evidence.roles[0].qualifiedConversions).toBeNull();
    expect(evidence.portfolio.reasonCodes).toContain(
      "ATTRIBUTION_NOT_COLLECTING",
    );
  });

  it("keeps all three roles with incomplete evidence and never invents a fourth account", async () => {
    await createRole(GrowthPinterestPublicationRole.SAYTWIST);
    await createRole(GrowthPinterestPublicationRole.SAYTWIST_IDEAS);
    await createRole(GrowthPinterestPublicationRole.SAYTWIST_PLAYGROUND);
    const evidence = await evaluateAccountStrategy({ now });
    expect(evidence.portfolio.connectedRoles).toBe(3);
    expect(["KEEP_CURRENT_PORTFOLIO", "WAIT_FOR_MORE_DATA"]).toContain(
      evidence.portfolio.recommendation,
    );
    expect(evidence.portfolio.recommendation).not.toBe("RECOMMEND_NEW_ACCOUNT");
    expect(evidence.portfolio.recommendedAccountCount).toBe(3);
  });

  it("uses fresh Pinterest evidence, marks attribution unavailable, and warns on one-Pin dominance", async () => {
    await createRole(GrowthPinterestPublicationRole.SAYTWIST, {
      evidence: true,
      dominant: true,
    });
    const evidence = await evaluateAccountStrategy({ now });
    const main = evidence.roles.find(
      (role) => role.role === GrowthPinterestPublicationRole.SAYTWIST,
    )!;
    expect(main.metrics).toMatchObject({
      state: "KNOWN",
      observationDays: 28,
      impressions: "2800",
      outboundClicks: "84",
    });
    expect(main.qualifiedConversionEvidence).toBe("NOT_APPLICABLE");
    expect(
      evidence.concentration[0].topPinOutboundSharePercent,
    ).toBeGreaterThan(90);
    expect(evidence.portfolio.reasonCodes).toContain(
      "HIGH_TOP_PIN_CONCENTRATION",
    );
    expect(evidence.portfolio.recommendation).not.toBe("RECOMMEND_NEW_ACCOUNT");
  });

  it("persists one canonical review, reuses its job key, audits completion, and respects the kill switch", async () => {
    await createRole(GrowthPinterestPublicationRole.SAYTWIST, {
      evidence: true,
    });
    const first = await persistAccountStrategyReview({ now });
    const second = await persistAccountStrategyReview({
      now: new Date("2026-10-06T13:00:00Z"),
    });
    expect(second.review.id).toBe(first.review.id);
    expect(await prisma.growthAccountStrategyReview.count()).toBe(1);
    expect(
      await prisma.growthActivity.count({
        where: {
          entityType: "GrowthAccountStrategyReview",
          action: "ACCOUNT_STRATEGY_REVIEW_COMPLETED",
        },
      }),
    ).toBe(2);

    const firstJob = await enqueueAccountStrategyReview(now);
    const secondJob = await enqueueAccountStrategyReview(now);
    expect(secondJob.job.id).toBe(firstJob.job.id);
    expect([firstJob.created, secondJob.created].filter(Boolean)).toHaveLength(
      1,
    );

    await prisma.growthSettings.update({
      where: { id: "global" },
      data: { enabled: false },
    });
    await prisma.growthAccountStrategyReview.deleteMany();
    await expect(
      runGrowthWorker({ workerId: "strategy-disabled" }),
    ).resolves.toMatchObject({ status: "DISABLED", claimed: 0 });
    expect(await prisma.growthAccountStrategyReview.count()).toBe(0);
    expect(
      (
        await prisma.growthJob.findUniqueOrThrow({
          where: { id: firstJob.job.id },
        })
      ).status,
    ).toBe("PENDING");
  });
});
