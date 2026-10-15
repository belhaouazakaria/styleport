import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  executeEvergreenPreparation,
  persistLearningAnalysis,
  prepareEvergreenRecommendation,
} from "@/lib/growth/learning/service";
import { encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";

const enabled = process.env.RUN_GROWTH_LEARNING_DB_TESTS === "1";
const suite = enabled ? describe.sequential : describe.skip;
if (enabled) {
  const value = process.env.GROWTH_LEARNING_TEST_DATABASE_URL;
  if (!value || value !== process.env.DATABASE_URL)
    throw new Error("Phase 12 DB tests require matching explicit URLs.");
  const url = new URL(value);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    decodeURIComponent(url.pathname.slice(1)) !==
      "saytwist_growth_phase12_learning_test"
  )
    throw new Error("Unsafe Phase 12 test database.");
}
process.env.GROWTH_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString(
  "base64",
);
process.env.PINTEREST_APP_ID = "test-app";
process.env.PINTEREST_APP_SECRET = "test-secret";
process.env.PINTEREST_REDIRECT_URI =
  "https://saytwist.test/api/admin/growth/pinterest/oauth/callback";
process.env.PINTEREST_API_ENVIRONMENT = "sandbox";

async function clean() {
  await prisma.growthExperimentLearningEvaluation.deleteMany();
  await prisma.growthLearnedScheduleWindow.deleteMany();
  await prisma.growthEvergreenRecommendationRecord.deleteMany();
  await prisma.growthLearningRun.deleteMany();
  await prisma.growthPinPublication.deleteMany();
  await prisma.growthPinApproval.deleteMany();
  await prisma.growthAttributionDailyAggregate.deleteMany();
  await prisma.growthAttributionRef.deleteMany();
  await prisma.growthPinCandidate.deleteMany();
  await prisma.growthAsset.deleteMany();
  await prisma.growthPinterestPinMetricDaily.deleteMany();
  await prisma.growthPinterestPin.deleteMany();
  await prisma.growthPinterestAnalyticsState.deleteMany();
  await prisma.growthPinterestBoard.deleteMany();
  await prisma.growthPinterestAccount.deleteMany();
  await prisma.growthOpportunity.deleteMany();
  await prisma.growthContentClusterSnapshot.deleteMany();
  await prisma.growthOpportunityAnalysisRun.deleteMany();
  await prisma.growthContentCluster.deleteMany();
  await prisma.growthJob.deleteMany();
  await prisma.growthActivity.deleteMany();
  await prisma.growthSettings.deleteMany();
  await prisma.translator.deleteMany();
  await prisma.user.deleteMany();
}

async function fixture(now: Date) {
  await prisma.growthSettings.create({
    data: { id: "global", enabled: true, attributionEnabled: false },
  });
  const admin = await prisma.user.create({
    data: { email: "phase12@test.local", passwordHash: "test", role: "ADMIN" },
  });
  const translator = await prisma.translator.create({
    data: {
      name: "Warm Translator",
      slug: "warm-phase12",
      title: "Warm Translator",
      subtitle: "Warm",
      shortDescription: "Warm rewrite",
      sourceLabel: "Before",
      targetLabel: "After",
      promptSystem: "Rewrite",
      promptInstructions: "Preserve meaning",
      isActive: true,
    },
  });
  const account = await prisma.growthPinterestAccount.create({
    data: {
      pinterestAccountId: "phase12-account",
      publicationRole: "SAYTWIST",
      activeRole: "SAYTWIST",
      username: "saytwist",
      apiEnvironment: "SANDBOX",
      connectionStatus: "CONNECTED",
      grantedScopes: ["boards:read", "boards:write", "pins:read", "pins:write"],
      encryptedCredentials: encryptPinterestCredentials({
        accessToken: "test-access",
        refreshToken: "test-refresh",
      }),
      accessTokenExpiresAt: new Date("2030-01-01T00:00:00Z"),
      refreshTokenExpiresAt: new Date("2030-02-01T00:00:00Z"),
    },
  });
  const board = await prisma.growthPinterestBoard.create({
    data: {
      accountId: account.id,
      pinterestBoardId: "phase12-board",
      name: "SayTwist",
      isActive: true,
      lastSeenAt: now,
      lastSyncedAt: now,
    },
  });
  await prisma.growthPinterestAnalyticsState.create({
    data: { accountId: account.id, status: "FRESH", lastSuccessfulSyncAt: now },
  });
  const pin = await prisma.growthPinterestPin.create({
    data: {
      pinterestPinId: "phase12-pin",
      accountId: account.id,
      boardId: board.id,
      pinterestBoardId: board.pinterestBoardId,
      destinationUrl: "https://saytwist.com/translators/warm-phase12",
      publishedAt: new Date("2026-07-20T13:00:00Z"),
      lastSeenAt: now,
      lastSyncedAt: now,
      analyticsEligible: true,
    },
  });
  await prisma.growthPinterestPinMetricDaily.createMany({
    data: Array.from({ length: 86 }, (_, index) => ({
      pinId: pin.id,
      metricDate: new Date(Date.UTC(2026, 6, 21 + index)),
      impressions: BigInt(200),
      outboundClicks: BigInt(5),
      saves: BigInt(3),
      dataStatus: "READY",
      fetchedAt: now,
    })),
  });
  const ref = await prisma.growthAttributionRef.create({
    data: {
      publicRef: "pa_phase12_test_ref_1234567890",
      pinId: pin.id,
      destinationPath: "/translators/warm-phase12",
      campaignKey: "saytwist",
      contentKey: "phase12",
      modelVersion: "pinterest_organic_v1",
    },
  });
  const asset = await prisma.growthAsset.create({
    data: {
      publicPath: `/generated/growth-creatives/creative-${"a".repeat(64)}.png`,
      checksum: "a".repeat(64),
      mimeType: "image/png",
      width: 1000,
      height: 1500,
      byteSize: 1000,
      rendererKey: "creative-static",
      rendererVersion: "creative_static_v4",
      templateId: "minimal-poster-v2-layout-0",
      generationKind: "DETERMINISTIC",
      state: "READY",
    },
  });
  const candidate = await prisma.growthPinCandidate.create({
    data: {
      candidateKey: "phase12-candidate",
      revision: 1,
      destinationKind: "TRANSLATOR",
      translatorId: translator.id,
      title: "Warm Translator",
      description: "Try a warm rewrite.",
      destinationPath: "/translators/warm-phase12",
      assetId: asset.id,
      rendererKey: "creative-static",
      rendererVersion: "creative_static_v4",
      templateId: "minimal-poster-v2-layout-0",
      archetype: "MINIMAL_STATEMENT",
      headlinePattern: "statement",
      ctaPattern: "try",
      visualTreatment: "minimal",
      topic: "warm",
      contentHash: "b".repeat(64),
      similarityModelVersion: "creative_similarity_v2",
      similarityResult: "DISTINCT",
      similarityFlags: {},
      status: "READY",
    },
  });
  const snapshot = { candidateId: candidate.id };
  const approval = await prisma.growthPinApproval.create({
    data: {
      candidateId: candidate.id,
      candidateRevision: 1,
      status: "APPROVED",
      approvedById: admin.id,
      reviewedAt: now,
      accountId: account.id,
      boardId: board.id,
      scheduledAt: new Date("2026-07-20T13:00:00Z"),
      snapshotChecksum: "c".repeat(64),
      snapshot,
      approvalPolicyVersion: "pin_approval_v1",
    },
  });
  await prisma.growthPinPublication.create({
    data: {
      candidateId: candidate.id,
      approvalId: approval.id,
      accountId: account.id,
      boardId: board.id,
      attributionRefId: ref.id,
      pinterestPinId: pin.pinterestPinId,
      idempotencyKey: "phase12-publication",
      scheduledAt: new Date("2026-07-20T13:00:00Z"),
      publishedAt: new Date("2026-07-20T13:00:00Z"),
      status: "RECONCILED",
      timingModelVersion: "publication_timing_v1",
      timingMode: "COLD_START",
      timingEvidence: {},
      reconciledAt: new Date("2026-07-20T13:01:00Z"),
    },
  });
  return { translator, admin };
}

beforeEach(clean);
afterAll(async () => {
  if (enabled) await clean();
  await prisma.$disconnect();
});

suite("Phase 12 PostgreSQL learning invariants", () => {
  it("keeps an immutable same-day v1 run beside the idempotent v2 run", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    await fixture(now);
    await prisma.growthLearningRun.create({
      data: {
        analysisDate: new Date("2026-10-15T00:00:00Z"),
        evidenceWindowStart: new Date("2026-07-17T00:00:00Z"),
        evidenceWindowEnd: new Date("2026-10-15T00:00:00Z"),
        learningModelVersion: "growth_learning_v1",
        evergreenModelVersion: "evergreen_learning_v1",
        schedulerModelVersion: "learned_scheduler_v1",
        experimentModelVersion: "experiment_learning_v1",
        opportunityFeedbackVersion: "opportunity_feedback_v1",
        evidenceQuality: "INSUFFICIENT_DATA",
        attributionAvailability: "NOT_COLLECTING",
        targetsConsidered: 355,
        recommendationsProduced: 355,
        reasonCodes: ["NO_HISTORICAL_PUBLICATIONS"],
        performanceFindings: [],
        opportunityAdjustments: [],
        summary: "Immutable October 15 v1 production result.",
      },
    });
    const first = await persistLearningAnalysis({ analysisDate: now, now });
    const second = await persistLearningAnalysis({ analysisDate: now, now });
    expect(first.run.learningModelVersion).toBe("growth_learning_v2");
    expect(second.reused).toBe(true);
    expect(
      await prisma.growthLearningRun.findMany({
        where: { analysisDate: new Date("2026-10-15T00:00:00Z") },
        orderBy: { learningModelVersion: "asc" },
        select: { learningModelVersion: true },
      }),
    ).toEqual([
      { learningModelVersion: "growth_learning_v1" },
      { learningModelVersion: "growth_learning_v2" },
    ]);
  });

  it("preserves managed-only v1 preparation compatibility", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const { admin } = await fixture(now);
    const analysis = await persistLearningAnalysis({ analysisDate: now, now });
    const recommendation = analysis.run.recommendations.find(
      (row) => row.recommendation === "REVIVE",
    )!;
    await prisma.growthLearningRun.update({
      where: { id: analysis.run.id },
      data: {
        learningModelVersion: "growth_learning_v1",
        evergreenModelVersion: "evergreen_learning_v1",
        schedulerModelVersion: "learned_scheduler_v1",
      },
    });
    await expect(
      prepareEvergreenRecommendation(
        {
          recommendationId: recommendation.id,
          confirmation: true,
          paidAiConfirmation: "QUEUE PAID AI CREATIVE",
        },
        admin.id,
      ),
    ).resolves.toMatchObject({ created: true });
  });

  it("aggregates mixed legacy and managed Pins once with retained provenance", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const { translator } = await fixture(now);
    const account = await prisma.growthPinterestAccount.findFirstOrThrow();
    const legacy = await prisma.growthPinterestPin.create({
      data: {
        pinterestPinId: "legacy-phase12-pin",
        accountId: account.id,
        destinationUrl:
          "https://translator.whattypeof.com/translators/warm-phase12",
        publishedAt: new Date("2026-06-01T13:00:00Z"),
        isActive: true,
        analyticsEligible: true,
        lastSeenAt: now,
        lastSyncedAt: now,
      },
    });
    await prisma.growthPinterestPinMetricDaily.createMany({
      data: Array.from({ length: 90 }, (_, index) => ({
        pinId: legacy.id,
        metricDate: new Date(Date.UTC(2026, 6, 17 + index)),
        impressions: 100n,
        outboundClicks: 2n,
        saves: 1n,
        dataStatus: "READY",
        fetchedAt: now,
      })),
    });
    const result = await persistLearningAnalysis({ analysisDate: now, now });
    const recommendation = result.run.recommendations.find(
      (row) => row.translatorId === translator.id,
    )!;
    expect(recommendation).toMatchObject({ recommendation: "REVIVE" });
    const evidence = recommendation.evidence as {
      impressions: number;
      evidenceSources: { managed: unknown[]; legacy: unknown[] };
    };
    expect(evidence.impressions).toBe(26_200);
    expect(evidence.evidenceSources.managed).toHaveLength(1);
    expect(evidence.evidenceSources.legacy).toEqual([
      expect.objectContaining({
        source: "LEGACY_PIN",
        pinterestPinId: "legacy-phase12-pin",
      }),
    ]);
    expect(await prisma.growthPinPublication.count()).toBe(1);
    expect(await prisma.growthPinApproval.count()).toBe(1);
  });

  it("prepares a legitimate mixed-history REVIVE and blocks a newly published legacy Pin", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const { translator, admin } = await fixture(now);
    const account = await prisma.growthPinterestAccount.findFirstOrThrow();
    const legacy = await prisma.growthPinterestPin.create({
      data: {
        pinterestPinId: "legacy-preparation-pin",
        accountId: account.id,
        destinationUrl:
          "https://translator.whattypeof.com/translators/warm-phase12",
        publishedAt: new Date("2026-06-01T13:00:00Z"),
        isActive: true,
        analyticsEligible: true,
        lastSeenAt: now,
        lastSyncedAt: now,
      },
    });
    await prisma.growthPinterestPinMetricDaily.createMany({
      data: Array.from({ length: 90 }, (_, index) => ({
        pinId: legacy.id,
        metricDate: new Date(Date.UTC(2026, 6, 17 + index)),
        impressions: 100n,
        outboundClicks: 2n,
        saves: 1n,
        dataStatus: "READY",
        fetchedAt: now,
      })),
    });
    const first = await persistLearningAnalysis({ analysisDate: now, now });
    const validRecommendation = first.run.recommendations.find(
      (row) => row.translatorId === translator.id,
    )!;
    expect(validRecommendation.recommendation).toBe("REVIVE");
    await expect(
      prepareEvergreenRecommendation(
        {
          recommendationId: validRecommendation.id,
          confirmation: true,
          paidAiConfirmation: "QUEUE PAID AI CREATIVE",
        },
        admin.id,
      ),
    ).resolves.toMatchObject({ created: true });

    await clean();
    const secondFixture = await fixture(now);
    const second = await persistLearningAnalysis({ analysisDate: now, now });
    const staleRecommendation = second.run.recommendations.find(
      (row) => row.translatorId === secondFixture.translator.id,
    )!;
    await prisma.growthPinterestPin.create({
      data: {
        pinterestPinId: "new-legacy-after-analysis",
        accountId: (await prisma.growthPinterestAccount.findFirstOrThrow()).id,
        destinationUrl:
          "https://translator.whattypeof.com/translators/warm-phase12",
        publishedAt: new Date("2026-10-15T06:00:00Z"),
        isActive: true,
        analyticsEligible: true,
        lastSeenAt: now,
        lastSyncedAt: now,
      },
    });
    await expect(
      prepareEvergreenRecommendation(
        {
          recommendationId: staleRecommendation.id,
          confirmation: true,
          paidAiConfirmation: "QUEUE PAID AI CREATIVE",
        },
        secondFixture.admin.id,
      ),
    ).rejects.toThrow("Combined Pin provenance changed after analysis");
    expect(
      await prisma.growthJob.count({
        where: { type: "EVERGREEN_CREATIVE_PREPARE" },
      }),
    ).toBe(0);
  });

  it("fails preparation closed when a new eligible Pin ambiguously resembles the target", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const { translator, admin } = await fixture(now);
    const analysis = await persistLearningAnalysis({ analysisDate: now, now });
    const recommendation = analysis.run.recommendations.find(
      (row) => row.translatorId === translator.id,
    )!;
    await prisma.growthPinterestPin.create({
      data: {
        pinterestPinId: "ambiguous-legacy-after-analysis",
        accountId: (await prisma.growthPinterestAccount.findFirstOrThrow()).id,
        destinationUrl: "https://unapproved.example/translators/warm-phase12",
        publishedAt: new Date("2026-06-01T13:00:00Z"),
        isActive: true,
        analyticsEligible: true,
        lastSeenAt: now,
        lastSyncedAt: now,
      },
    });
    await expect(
      prepareEvergreenRecommendation(
        {
          recommendationId: recommendation.id,
          confirmation: true,
          paidAiConfirmation: "QUEUE PAID AI CREATIVE",
        },
        admin.id,
      ),
    ).rejects.toThrow("Legacy Pin destination is ambiguous");
  });

  it("marks the whole run and comparisons partial for managed PROCESSING metrics", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    await fixture(now);
    await prisma.growthPinterestPinMetricDaily.updateMany({
      where: { metricDate: new Date("2026-10-14T00:00:00Z") },
      data: { dataStatus: "PROCESSING" },
    });
    const result = await persistLearningAnalysis({ analysisDate: now, now });
    expect(result.run.evidenceQuality).toBe("PARTIAL");
    expect(result.run.reasonCodes).toContain("MANAGED_PIN_METRICS_INCOMPLETE");
    expect(
      (
        result.run.performanceFindings as Array<{ evidenceQuality: string }>
      ).every((finding) => finding.evidenceQuality === "PARTIAL"),
    ).toBe(true);
  });

  it("marks the whole run and comparisons partial for a missing managed day", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    await fixture(now);
    await prisma.growthPinterestPinMetricDaily.deleteMany({
      where: { metricDate: new Date("2026-10-14T00:00:00Z") },
    });
    const result = await persistLearningAnalysis({ analysisDate: now, now });
    expect(result.run.evidenceQuality).toBe("PARTIAL");
    expect(result.run.reasonCodes).toContain("MANAGED_PIN_METRICS_INCOMPLETE");
    expect(
      (
        result.run.performanceFindings as Array<{ evidenceQuality: string }>
      ).every((finding) => finding.evidenceQuality === "PARTIAL"),
    ).toBe(true);
  });

  it("does not count PROCESSING metrics and respects a recent legacy cooldown", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const { translator } = await fixture(now);
    const account = await prisma.growthPinterestAccount.findFirstOrThrow();
    const legacy = await prisma.growthPinterestPin.create({
      data: {
        pinterestPinId: "legacy-processing-pin",
        accountId: account.id,
        destinationUrl: "https://saytwist.com/translators/warm-phase12",
        publishedAt: new Date("2026-06-01T13:00:00Z"),
        isActive: true,
        analyticsEligible: true,
        lastSeenAt: now,
        lastSyncedAt: now,
      },
    });
    await prisma.growthPinterestPinMetricDaily.create({
      data: {
        pinId: legacy.id,
        metricDate: new Date("2026-10-01T00:00:00Z"),
        impressions: 1_000_000n,
        outboundClicks: 1_000_000n,
        saves: 1_000_000n,
        dataStatus: "PROCESSING",
        fetchedAt: now,
      },
    });
    const result = await persistLearningAnalysis({ analysisDate: now, now });
    const recommendation = result.run.recommendations.find(
      (row) => row.translatorId === translator.id,
    )!;
    expect(recommendation).toMatchObject({
      recommendation: "INSUFFICIENT_DATA",
      evidenceQuality: "PARTIAL",
    });
    expect(recommendation.reasonCodes).toContain("PIN_METRICS_INCOMPLETE");
    expect(
      (recommendation.evidence as { impressions: number }).impressions,
    ).toBe(17_200);
  });

  it("uses a legacy Pin newer than the evidence window for cooldown only", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const { translator } = await fixture(now);
    const account = await prisma.growthPinterestAccount.findFirstOrThrow();
    await prisma.growthPinterestPin.create({
      data: {
        pinterestPinId: "legacy-recent-pin",
        accountId: account.id,
        destinationUrl: "https://saytwist.com/translators/warm-phase12",
        publishedAt: new Date("2026-10-15T06:00:00Z"),
        isActive: true,
        analyticsEligible: true,
        lastSeenAt: now,
        lastSyncedAt: now,
      },
    });
    const result = await persistLearningAnalysis({ analysisDate: now, now });
    const recommendation = result.run.recommendations.find(
      (row) => row.translatorId === translator.id,
    )!;
    expect(recommendation.recommendation).toBe("WAIT");
    expect(recommendation.reasonCodes).toContain("COOLDOWN_ACTIVE");
  });

  it("persists one immutable recommendation run and converges concurrent repeats", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const { translator } = await fixture(now);
    const results = await Promise.all([
      persistLearningAnalysis({ analysisDate: now, now }),
      persistLearningAnalysis({ analysisDate: now, now }),
    ]);
    expect(await prisma.growthLearningRun.count()).toBe(1);
    expect(results.some((result) => result.reused)).toBe(true);
    expect(
      await prisma.growthEvergreenRecommendationRecord.findFirst({
        where: { translatorId: translator.id, recommendation: "REVIVE" },
      }),
    ).toMatchObject({ confidence: 75, proposedArchetype: "BEFORE_AFTER" });
    expect(await prisma.growthPinApproval.count()).toBe(1);
    expect(await prisma.growthPinPublication.count()).toBe(1);
  });

  it("honors the kill switch without persisting evidence", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    await fixture(now);
    await prisma.growthSettings.update({
      where: { id: "global" },
      data: { enabled: false },
    });
    await expect(
      persistLearningAnalysis({ analysisDate: now, now }),
    ).rejects.toThrow("Growth is disabled");
    expect(await prisma.growthLearningRun.count()).toBe(0);
  });

  it("treats missing account analytics and the disabled server attribution gate as unavailable", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    await fixture(now);
    await prisma.growthPinterestAnalyticsState.deleteMany();
    await prisma.growthSettings.update({
      where: { id: "global" },
      data: { attributionEnabled: true },
    });
    const result = await persistLearningAnalysis({ analysisDate: now, now });
    expect(result.run).toMatchObject({
      evidenceQuality: "STALE",
      attributionAvailability: "NOT_COLLECTING",
    });
    expect(result.run.reasonCodes).toContain("ANALYTICS_STALE");
    expect(result.run.performanceFindings).toEqual([]);
    expect(result.run.scheduleWindows).toEqual([]);
    expect(result.run.recommendations[0]).toMatchObject({
      recommendation: "INSUFFICIENT_DATA",
      evidenceQuality: "STALE",
    });
  });

  it("atomically converges concurrent preparation requests without publishing", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const { admin } = await fixture(now);
    const analysis = await persistLearningAnalysis({ analysisDate: now, now });
    const recommendation = analysis.run.recommendations.find(
      (row) => row.recommendation === "REVIVE",
    );
    expect(recommendation).toBeTruthy();
    const request = {
      recommendationId: recommendation!.id,
      confirmation: true as const,
      paidAiConfirmation: "QUEUE PAID AI CREATIVE" as const,
    };
    const results = await Promise.all([
      prepareEvergreenRecommendation(request, admin.id),
      prepareEvergreenRecommendation(request, admin.id),
    ]);
    expect(new Set(results.map((result) => result.job.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(
      await prisma.growthEvergreenRecommendationRecord.findUniqueOrThrow({
        where: { id: recommendation!.id },
      }),
    ).toMatchObject({ status: "PREPARING" });
    expect(
      await prisma.growthJob.count({
        where: { type: "EVERGREEN_CREATIVE_PREPARE" },
      }),
    ).toBe(1);
    expect(await prisma.growthPinPublication.count()).toBe(1);
    expect(await prisma.growthPinApproval.count()).toBe(1);
  });

  it("rechecks the kill switch before enqueueing creative generation", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const { admin } = await fixture(now);
    const analysis = await persistLearningAnalysis({ analysisDate: now, now });
    const recommendation = analysis.run.recommendations.find(
      (row) => row.recommendation === "REVIVE",
    )!;
    await prepareEvergreenRecommendation(
      {
        recommendationId: recommendation.id,
        confirmation: true,
        paidAiConfirmation: "QUEUE PAID AI CREATIVE",
      },
      admin.id,
    );
    await prisma.growthSettings.update({
      where: { id: "global" },
      data: { enabled: false },
    });
    await expect(
      executeEvergreenPreparation(recommendation.id),
    ).rejects.toThrow("Growth was disabled");
    expect(
      await prisma.growthJob.count({
        where: { type: "CREATIVE_LAB_GENERATE" },
      }),
    ).toBe(0);
  });
});
