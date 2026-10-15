import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { persistLearningAnalysis } from "@/lib/growth/learning/service";
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
    data: Array.from({ length: 30 }, (_, index) => ({
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
  return { translator };
}

beforeEach(clean);
afterAll(async () => {
  if (enabled) await clean();
  await prisma.$disconnect();
});

suite("Phase 12 PostgreSQL learning invariants", () => {
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
});
