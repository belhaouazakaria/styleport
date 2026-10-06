import {
  GrowthJobStatus,
  GrowthJobType,
  GrowthOpportunityEvidenceQuality,
  GrowthOpportunityType,
  GrowthPinSignalType,
  GrowthPinterestAnalyticsStatus,
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueOpportunityAnalysis,
  persistOpportunityAnalysis,
} from "@/lib/growth/opportunity/analysis";
import { runGrowthWorker } from "@/lib/growth/worker";
import { getOpportunityDashboard } from "@/lib/growth/opportunity/reporting";
import { prisma } from "@/lib/prisma";
const enabled = process.env.RUN_GROWTH_OPPORTUNITY_DB_TESTS === "1";
const suite = enabled ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase7_opportunity_test";
const now = new Date("2026-10-06T12:00:00Z");
if (enabled) {
  const url = process.env.GROWTH_OPPORTUNITY_TEST_DATABASE_URL;
  if (!url || url !== process.env.DATABASE_URL)
    throw new Error("Phase 7 DB tests require matching explicit URLs.");
  const parsed = new URL(url);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) ||
    decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName
  )
    throw new Error(
      `Phase 7 DB tests refuse every target except local database ${requiredDatabaseName}.`,
    );
}
async function clean() {
  await prisma.growthPinSignal.deleteMany();
  await prisma.growthContentClusterMembership.deleteMany();
  await prisma.growthOpportunity.deleteMany();
  await prisma.growthContentClusterSnapshot.deleteMany();
  await prisma.growthOpportunityAnalysisRun.deleteMany();
  await prisma.growthContentCluster.deleteMany();
  await prisma.growthActivity.deleteMany();
  await prisma.growthJob.deleteMany();
  await prisma.growthWorkerHeartbeat.deleteMany();
  await prisma.growthPinterestPinMetricDaily.deleteMany();
  await prisma.growthPinterestPin.deleteMany();
  await prisma.growthPinterestAnalyticsState.deleteMany();
  await prisma.growthPinterestBoard.deleteMany();
  await prisma.growthPinterestAccount.deleteMany();
  await prisma.growthSettings.deleteMany();
}
type Period = {
  olderI: number;
  olderO: number;
  previousI: number;
  previousO: number;
  recentI: number;
  recentO: number;
  olderS?: number;
  previousS?: number;
  recentS?: number;
  omitRecent?: boolean;
};
const steady: Period = {
  olderI: 100,
  olderO: 3,
  previousI: 100,
  previousO: 3,
  recentI: 100,
  recentO: 3,
};
async function seedScenario(periods: Period[], destinations?: string[]) {
  await prisma.growthSettings.create({
    data: { id: "global", enabled: true, attributionEnabled: false },
  });
  const account = await prisma.growthPinterestAccount.create({
    data: {
      pinterestAccountId: "phase7",
      publicationRole: GrowthPinterestPublicationRole.SAYTWIST,
      activeRole: GrowthPinterestPublicationRole.SAYTWIST,
      username: "saytwist",
      apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
      connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
      grantedScopes: ["pins:read"],
      encryptedCredentials: "integration-fixture-envelope-not-a-real-token",
      accessTokenExpiresAt: new Date("2026-12-01T00:00:00Z"),
      refreshTokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
    },
  });
  await prisma.growthPinterestAnalyticsState.create({
    data: {
      accountId: account.id,
      status: GrowthPinterestAnalyticsStatus.FRESH,
      lastSuccessfulSyncAt: now,
    },
  });
  for (let index = 0; index < periods.length; index++) {
    const pin = await prisma.growthPinterestPin.create({
      data: {
        accountId: account.id,
        pinterestPinId: `p${index}`,
        title: "Shared slang captions topic",
        description: "Deterministic cluster fixture",
        destinationUrl:
          destinations?.[index] || "https://saytwist.com/translators/gen-z",
        isActive: true,
        analyticsEligible: true,
        lastSeenAt: now,
        lastSyncedAt: now,
      },
    });
    const period = periods[index];
    for (let day = 0; day < 28; day++) {
      if (period.omitRecent && day >= 21) continue;
      const metricDate = new Date("2026-09-08T00:00:00Z");
      metricDate.setUTCDate(metricDate.getUTCDate() + day);
      const key = day >= 21 ? "recent" : day >= 14 ? "previous" : "older";
      await prisma.growthPinterestPinMetricDaily.create({
        data: {
          pinId: pin.id,
          metricDate,
          impressions: BigInt(period[`${key}I` as keyof Period] as number),
          saves: BigInt(
            (period[`${key}S` as keyof Period] as number | undefined) ?? 2,
          ),
          pinClicks: BigInt(period[`${key}O` as keyof Period] as number),
          outboundClicks: BigInt(period[`${key}O` as keyof Period] as number),
          dataStatus: "READY",
          fetchedAt: now,
        },
      });
    }
  }
}
beforeEach(async () => {
  vi.stubEnv("GROWTH_ATTRIBUTION_COLLECTION_ENABLED", "false");
  await clean();
});
afterAll(async () => {
  if (enabled) await clean();
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});
suite("Growth Phase 7 PostgreSQL A-H scenarios", () => {
  it("A: persists a strong topic opportunity from multiple meaningful sustained Pins", async () => {
    await seedScenario(
      [steady, steady, steady],
      [
        "https://saytwist.com/translators/gen-z",
        "https://saytwist.com/translators/casual",
        "https://saytwist.com/translators/slang",
      ],
    );
    await persistOpportunityAnalysis({ now });
    expect(
      await prisma.growthPinSignal.count({
        where: { type: GrowthPinSignalType.WINNER },
      }),
    ).toBe(3);
    expect(
      await prisma.growthOpportunity.count({
        where: { type: GrowthOpportunityType.AMPLIFY_WINNER },
      }),
    ).toBe(1);
    expect(
      await prisma.growthContentClusterMembership.count(),
    ).toBeGreaterThanOrEqual(2);
  });
  it("B: persists a viral Pin winner signal but rejects dominant-cluster expansion", async () => {
    await seedScenario([
      {
        olderI: 2000,
        olderO: 200,
        previousI: 2000,
        previousO: 200,
        recentI: 2000,
        recentO: 200,
      },
      {
        olderI: 5,
        olderO: 0,
        previousI: 5,
        previousO: 0,
        recentI: 5,
        recentO: 0,
      },
      {
        olderI: 5,
        olderO: 0,
        previousI: 5,
        previousO: 0,
        recentI: 5,
        recentO: 0,
      },
    ]);
    await persistOpportunityAnalysis({ now });
    expect(
      await prisma.growthPinSignal.count({
        where: { type: GrowthPinSignalType.WINNER },
      }),
    ).toBe(1);
    expect(
      await prisma.growthOpportunity.count({
        where: { type: GrowthOpportunityType.AMPLIFY_WINNER },
      }),
    ).toBe(0);
    const snapshot =
      await prisma.growthContentClusterSnapshot.findFirstOrThrow();
    expect(snapshot.topPinOutboundPercent).toBeGreaterThan(90);
  });
  it("C: persists rising signals and a topic opportunity from recent multi-signal growth", async () => {
    const rising: Period = {
      olderI: 40,
      olderO: 1,
      previousI: 50,
      previousO: 1,
      recentI: 100,
      recentO: 3,
    };
    await seedScenario([rising, rising]);
    await persistOpportunityAnalysis({ now });
    expect(
      await prisma.growthPinSignal.count({
        where: { type: GrowthPinSignalType.RISING },
      }),
    ).toBe(2);
    expect(
      await prisma.growthOpportunity.count({
        where: { type: GrowthOpportunityType.EXPLORE_RISING_TOPIC },
      }),
    ).toBe(1);
  });
  it("D: persists fatigue only for previously meaningful, materially declining evidence", async () => {
    const fatigue: Period = {
      olderI: 100,
      olderO: 4,
      previousI: 100,
      previousO: 4,
      recentI: 40,
      recentO: 1,
    };
    await seedScenario([fatigue, fatigue]);
    await persistOpportunityAnalysis({ now });
    expect(
      await prisma.growthPinSignal.count({
        where: { type: GrowthPinSignalType.FATIGUE },
      }),
    ).toBe(2);
    expect(
      await prisma.growthOpportunity.count({
        where: { type: GrowthOpportunityType.INVESTIGATE_FATIGUE },
      }),
    ).toBe(1);
  });
  it("E: persists an inventory gap only with strong demand and multi-Pin depth at one destination", async () => {
    await seedScenario([steady, steady, steady]);
    await persistOpportunityAnalysis({ now });
    expect(
      await prisma.growthOpportunity.count({
        where: { type: GrowthOpportunityType.FILL_INVENTORY_GAP },
      }),
    ).toBe(1);
  });
  it("F: records disabled attribution as unavailable and emits no conversion opportunity", async () => {
    await seedScenario([steady, steady]);
    await persistOpportunityAnalysis({ now });
    const rows = await prisma.growthOpportunity.findMany();
    expect(
      rows.every(
        (row) =>
          ![
            GrowthOpportunityType.HIGH_CONVERSION_LOW_REACH,
            GrowthOpportunityType.HIGH_CLICK_LOW_CONVERSION,
          ].includes(row.type),
      ),
    ).toBe(true);
    expect(rows[0]?.evidence).toMatchObject({
      attributionCollection: "NOT_COLLECTING",
      metrics: { qualifiedConversions: null },
    });
  });
  it("G: preserves v1 while v2 runs on the same date and remains idempotent", async () => {
    await seedScenario([steady, steady]);
    await prisma.growthOpportunityAnalysisRun.create({
      data: {
        analysisDate: new Date("2026-10-06T00:00:00Z"),
        evidenceWindowStart: new Date("2026-09-08T00:00:00Z"),
        evidenceWindowEnd: new Date("2026-10-05T00:00:00Z"),
        intelligenceModelVersion: "opportunity_intelligence_v1",
        scoringModelVersion: "opportunity_scoring_v1",
        clusteringModelVersion: "content_clustering_v1",
        evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN,
        pinsConsidered: 2,
        pinCap: 500,
        capReached: false,
        clustersProduced: 1,
        opportunitiesProduced: 1,
        attributionCollection: "NOT_COLLECTING",
        reasonCodes: [],
        summary: "Historical v1 analysis retained for audit.",
        completedAt: new Date("2026-10-06T00:00:00Z"),
      },
    });
    await prisma.growthJob.create({
      data: {
        type: GrowthJobType.OPPORTUNITY_INTELLIGENCE_ANALYSIS,
        status: GrowthJobStatus.SUCCEEDED,
        idempotencyKey:
          "opportunity-intelligence:opportunity_intelligence_v1:2026-10-06",
        payload: {
          analysisDate: "2026-10-06",
          modelVersion: "opportunity_intelligence_v1",
        },
        completedAt: new Date("2026-10-06T00:00:00Z"),
      },
    });
    expect((await enqueueOpportunityAnalysis(now)).created).toBe(true);
    expect((await enqueueOpportunityAnalysis(now)).created).toBe(false);
    const first = await persistOpportunityAnalysis({ now });
    const counts = [
      await prisma.growthPinSignal.count(),
      await prisma.growthOpportunity.count(),
    ];
    const second = await persistOpportunityAnalysis({ now });
    expect(second).toMatchObject({ created: false, run: { id: first.run.id } });
    expect([
      await prisma.growthPinSignal.count(),
      await prisma.growthOpportunity.count(),
    ]).toEqual(counts);
    expect(await prisma.growthOpportunityAnalysisRun.count()).toBe(2);
    expect(await prisma.growthJob.count()).toBe(2);
    expect((await getOpportunityDashboard()).latestRun).toMatchObject({
      id: first.run.id,
      intelligenceModelVersion: "opportunity_intelligence_v2",
      clusteringModelVersion: "content_clustering_v2",
    });
  });
  it("H: leaves the daily analysis job pending when the Growth kill switch is disabled", async () => {
    await prisma.growthSettings.create({
      data: { id: "global", enabled: false, attributionEnabled: false },
    });
    const queued = await enqueueOpportunityAnalysis(now);
    await expect(
      runGrowthWorker({ workerId: "phase7-disabled" }),
    ).resolves.toEqual({
      status: "DISABLED",
      claimed: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(
      (
        await prisma.growthJob.findUniqueOrThrow({
          where: { id: queued.job.id },
        })
      ).status,
    ).toBe(GrowthJobStatus.PENDING);
    expect(await prisma.growthOpportunityAnalysisRun.count()).toBe(0);
  });
});
