import {
  GrowthContentVersionAction,
  GrowthDecisionStatus,
  GrowthDecisionType,
  GrowthJobStatus,
  GrowthOpportunityEvidenceQuality,
  GrowthOpportunityStatus,
  GrowthOpportunityType,
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/translator-cache-invalidation", () => ({ invalidatePublicTranslatorCaches: vi.fn() }));

import type { TranslatorGenerationProvider } from "@/lib/growth/translator/generation";
import { assertGrowthTranslatorActivationReady } from "@/lib/growth/translator/activation";
import {
  decideTranslatorOpportunity,
  enqueueTranslatorAutopilotDecision,
  executeTranslatorDecision,
  rollbackTranslatorVersion,
} from "@/lib/growth/translator/service";
import { readTranslatorSnapshot } from "@/lib/growth/translator/snapshot";
import { recoverStaleGrowthJobs } from "@/lib/growth/jobs";
import { runGrowthWorker } from "@/lib/growth/worker";
import { prisma } from "@/lib/prisma";
import type { TranslatorDraft } from "@/lib/types";

const enabled = process.env.RUN_GROWTH_TRANSLATOR_DB_TESTS === "1";
const suite = enabled ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase8_translator_test";

if (enabled) {
  const url = process.env.GROWTH_TRANSLATOR_TEST_DATABASE_URL;
  if (!url || url !== process.env.DATABASE_URL) throw new Error("Phase 8 DB tests require matching explicit URLs.");
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName) {
    throw new Error(`Phase 8 DB tests refuse every target except local database ${requiredDatabaseName}.`);
  }
}

let sequence = 0;

function draft(name = "Moonlit Compliment Translator", suffix = "") : TranslatorDraft {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}${suffix}`;
  return {
    name, slug, title: `${name}${suffix ? " Updated" : ""}`, subtitle: "Rewrite compliments with a specific moonlit poetic tone", shortDescription: "Rewrite everyday compliments into a specific moonlit poetic voice while preserving the original meaning and factual details.",
    sourceLabel: "Original text", targetLabel: "Moonlit rewrite",
    systemPrompt: "Transform text into a specific moonlit compliment style while preserving meaning and facts.",
    promptInstructions: `Rewrite with vivid but accurate language. Preserve meaning, factual claims, and intent. Never invent details.${suffix}`,
    seoTitle: `${name} | SayTwist`, seoDescription: "Rewrite compliments with a focused moonlit poetic style while preserving meaning.", categorySuggestion: "Funny",
    modes: [{ key: "classic", label: "Classic", description: "Focused", instruction: "Use a clear and playful moonlit compliment style.", sortOrder: 1 }],
    examples: [{ label: "Starter", value: "You did a great job today.", sortOrder: 1 }],
    editorial: {
      about: "A focused translator for memorable moonlit compliments that keeps the original intent clear.",
      whatItDoes: "It rewrites compliments with vivid, playful imagery while retaining meaning and facts.",
      differenceDescription: "It uses a specific moonlit compliment voice instead of generic poetic language.",
      bestUses: ["Warm messages to friends", "Playful dating messages"], howToUse: ["Paste a complete message", "Review the transformed result"], tips: ["Keep names accurate", "Choose the clearest mode"],
      examples: [
        { contextTitle: "Work", originalText: "Great presentation.", transformedText: "That presentation shone with calm confidence." },
        { contextTitle: "Friend", originalText: "You look wonderful.", transformedText: "You look bright enough to make the evening pause." },
        { contextTitle: "Date", originalText: "I enjoyed tonight.", transformedText: "Tonight felt bright, easy, and worth remembering." },
      ],
      faq: [
        { question: "Does it preserve meaning?", answer: "Yes. It changes style while retaining meaning and facts." },
        { question: "Can I use it for friends?", answer: "Yes. Choose language appropriate for the relationship." },
        { question: "Does it invent details?", answer: "No. The prompt explicitly prevents invented factual details." },
      ],
    },
  };
}

class FakeProvider implements TranslatorGenerationProvider {
  calls = 0;
  constructor(private readonly result: TranslatorDraft = draft(), private readonly fail = false) {}
  async generate() {
    this.calls += 1;
    if (this.fail) throw new Error("fake malformed output");
    return { draft: this.result, metadata: { provider: "FAKE", model: "fake-translator-v1", responseId: `fake-${this.calls}`, promptTokens: 100, completionTokens: 200, totalTokens: 300 } };
  }
}

class RepairProvider implements TranslatorGenerationProvider {
  calls = 0;
  async generate() {
    this.calls += 1;
    const result = this.calls === 1 ? { ...draft(), subtitle: "TODO placeholder" } : draft();
    return { draft: result, metadata: { provider: "FAKE", model: "fake-translator-v1", responseId: `repair-${this.calls}`, promptTokens: this.calls === 1 ? 100 : 10, completionTokens: this.calls === 1 ? 200 : 20, totalTokens: this.calls === 1 ? 300 : 30 } };
  }
}

const refreshShareImage = vi.fn(async (translatorId: string) => ({
  translatorId,
  shareImagePath: `/generated/pins/${translatorId}.png`,
  shareImageHash: "phase8-test-image",
  shareImageUpdatedAt: new Date("2026-10-07T00:00:00Z"),
}));

async function clean() {
  await prisma.growthContentVersion.deleteMany();
  await prisma.growthDecision.deleteMany();
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
  await prisma.translator.deleteMany();
  await prisma.category.deleteMany();
}

async function seedTranslator(name = "Existing Moonlit Translator") {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "funny" } });
  return prisma.translator.create({
    data: {
      name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), title: name, subtitle: "Existing focused translator", shortDescription: "An existing focused Translator used for safe Phase 8 improvement integration testing.", sourceLabel: "Original text", targetLabel: "Rewrite", promptSystem: "Transform text clearly while preserving meaning and facts.", promptInstructions: "Rewrite the text safely. Preserve meaning, facts, and intent. Never invent details.", isActive: false, isFeatured: false, showModeSelector: true, showSwap: true, showExamples: true, sortOrder: 50, primaryCategoryId: category.id,
      categories: { create: [{ categoryId: category.id, sortOrder: 1 }] },
      modes: { create: [{ key: "classic", label: "Classic", description: "Clear", instruction: "Rewrite in the configured style.", sortOrder: 1 }] },
      examples: { create: [{ label: "Starter", value: "Please rewrite this text.", sortOrder: 1 }] },
      editorialContent: { create: { about: "Existing complete editorial overview for this Translator.", whatItDoes: "It safely rewrites supplied text in a distinct configured voice.", differenceDescription: "It is intentionally specific rather than a generic AI translator." } },
      editorialLists: { create: [{ kind: "BEST_USE", content: "Focused messages", sortOrder: 1 }, { kind: "HOW_TO_USE", content: "Paste complete text", sortOrder: 2 }, { kind: "TIP", content: "Review factual details", sortOrder: 3 }] },
      editorialExamples: { create: [{ contextTitle: "Example", originalText: "Thank you.", transformedText: "I truly appreciate it.", sortOrder: 1 }] },
      editorialFaqs: { create: [{ question: "Does it retain meaning?", answer: "Yes, the configured prompt retains the source meaning.", sortOrder: 1 }] },
    },
  });
}

async function seedOpportunity(options: { type?: GrowthOpportunityType; mappedTranslatorId?: string; score?: number; confidence?: number; clusterName?: string } = {}) {
  sequence += 1;
  const analysis = await prisma.growthOpportunityAnalysisRun.create({
    data: { analysisDate: new Date(`2026-10-${String(sequence).padStart(2, "0")}T00:00:00Z`), evidenceWindowStart: new Date("2026-09-01T00:00:00Z"), evidenceWindowEnd: new Date("2026-09-28T00:00:00Z"), intelligenceModelVersion: `phase8-fixture-${sequence}`, scoringModelVersion: "opportunity_scoring_v1", clusteringModelVersion: "content_clustering_v2", evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN, pinsConsidered: 2, pinCap: 500, clustersProduced: 1, opportunitiesProduced: 1, attributionCollection: "NOT_COLLECTING", reasonCodes: [], summary: "Bounded Phase 8 integration fixture." },
  });
  const cluster = await prisma.growthContentCluster.create({ data: { clusterKey: `moonlit-${sequence}`, name: options.clusterName || "moonlit-compliments", clusteringVersion: "content_clustering_v2", summary: "Specific unmet translator concept." } });
  const snapshot = await prisma.growthContentClusterSnapshot.create({ data: { analysisRunId: analysis.id, clusterId: cluster.id, pinCount: 2, distinctDestinationCount: 2, activeWeekCount: 4, impressions: 2000, saves: 40, pinClicks: 100, outboundClicks: 80, evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN, reasonCodes: [] } });
  const account = await prisma.growthPinterestAccount.upsert({
    where: { pinterestAccountId: "phase8" },
    create: { pinterestAccountId: "phase8", publicationRole: GrowthPinterestPublicationRole.SAYTWIST, activeRole: GrowthPinterestPublicationRole.SAYTWIST, username: "saytwist", apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION, connectionStatus: GrowthPinterestConnectionStatus.CONNECTED, grantedScopes: ["pins:read"], encryptedCredentials: "integration-fixture-envelope-not-a-real-token", accessTokenExpiresAt: new Date("2026-12-01T00:00:00Z"), refreshTokenExpiresAt: new Date("2027-01-01T00:00:00Z") },
    update: {},
  });
  for (let index = 0; index < 2; index++) {
    const pinterestPinId = `phase8-${sequence}-${index}`;
    const pin = await prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId, title: `Moonlit compliment ${index}`, description: "Specific compliment language demand", destinationUrl: `https://saytwist.com/translators/source-${sequence}-${index}`, isActive: true, analyticsEligible: true, lastSeenAt: new Date(), lastSyncedAt: new Date() } });
    await prisma.growthContentClusterMembership.create({ data: { snapshotId: snapshot.id, pinId: pin.id, translatorId: options.mappedTranslatorId || null, pinterestPinId, destinationPath: `/translators/source-${sequence}-${index}`, matchTokens: ["moonlit", "compliment"] } });
  }
  return prisma.growthOpportunity.create({ data: { analysisRunId: analysis.id, clusterId: cluster.id, type: options.type || GrowthOpportunityType.FILL_INVENTORY_GAP, status: GrowthOpportunityStatus.OPEN, score: options.score ?? 90, confidence: options.confidence ?? 92, evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN, scoringModelVersion: "opportunity_scoring_v1", clusteringModelVersion: "content_clustering_v2", evidence: {}, reasonCodes: ["SPECIFIC_GAP"], dedupeKey: `phase8-opportunity-${sequence}` } });
}

beforeEach(async () => {
  refreshShareImage.mockClear();
  await clean();
  await prisma.growthSettings.create({ data: { id: "global", enabled: true, attributionEnabled: false } });
  await prisma.category.create({ data: { name: "Funny", slug: "funny", isActive: true } });
});

afterAll(async () => {
  if (enabled) await clean();
  await prisma.$disconnect();
});

suite("Growth Phase 8 PostgreSQL A-K scenarios", () => {
  it("A: creates one inactive Translator, version, completed decision, actioned opportunity, and activity", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const result = await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(), refreshShareImage });
    expect(result.decision.status).toBe(GrowthDecisionStatus.COMPLETED);
    expect(await prisma.translator.count()).toBe(1);
    expect((await prisma.translator.findFirstOrThrow()).isActive).toBe(false);
    expect(await prisma.growthContentVersion.count({ where: { action: GrowthContentVersionAction.CREATE } })).toBe(1);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.ACTIONED);
    expect(await prisma.growthActivity.count({ where: { action: "TRANSLATOR_CREATED" } })).toBe(1);
  });

  it("B: reuses the same CREATE action without duplicate mutation", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const provider = new FakeProvider();
    await Promise.all([executeTranslatorDecision(planned.decision.id, { provider, refreshShareImage }), executeTranslatorDecision(planned.decision.id, { provider, refreshShareImage })]);
    expect(await prisma.translator.count()).toBe(1);
    expect(await prisma.growthContentVersion.count()).toBe(1);
  });

  it("C: redirects a near duplicate CREATE toward the active existing Translator", async () => {
    const existing = await seedTranslator("Moonlit Compliment Translator");
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const result = await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(), refreshShareImage });
    expect("redirected" in result && result.redirected).toBe(true);
    expect((await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } }))).toMatchObject({ type: GrowthDecisionType.IMPROVE_TRANSLATOR, translatorId: existing.id, status: GrowthDecisionStatus.PROPOSED });
    expect(await prisma.translator.count()).toBe(1);
  });

  it("D: improves a mapped Translator once and stores before/after snapshots", async () => {
    const existing = await seedTranslator();
    const opportunity = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, mappedTranslatorId: existing.id });
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const before = await readTranslatorSnapshot(existing.id);
    const improvedDraft = { ...draft("Existing Moonlit Translator", " improved"), subtitle: "A refreshed moonlit voice for precise compliments" };
    const result = await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(improvedDraft), refreshShareImage });
    expect(result.decision.status).toBe(GrowthDecisionStatus.COMPLETED);
    const version = await prisma.growthContentVersion.findFirstOrThrow();
    expect(version.action).toBe(GrowthContentVersionAction.IMPROVE);
    expect(version.beforeSnapshot).toBeTruthy();
    expect(version.checksum).not.toBe(before?.checksum);
    expect(refreshShareImage).toHaveBeenCalledTimes(1);
  });

  it("E: refuses to overwrite a Translator changed after generation", async () => {
    const existing = await seedTranslator();
    const opportunity = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, mappedTranslatorId: existing.id });
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const result = await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(draft("Existing Moonlit Translator", " improved")), refreshShareImage, beforeApply: async () => { await prisma.translator.update({ where: { id: existing.id }, data: { subtitle: "Manual concurrent edit" } }); } });
    expect("blocked" in result && result.blocked).toBe(true);
    expect((await prisma.translator.findUniqueOrThrow({ where: { id: existing.id } })).subtitle).toBe("Manual concurrent edit");
    expect(await prisma.growthContentVersion.count()).toBe(0);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.DEFERRED);
  });

  it("F: failed output and repair leave Translator data untouched", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    await expect(executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(draft(), true), refreshShareImage })).rejects.toThrow("fake malformed output");
    expect(await prisma.translator.count()).toBe(0);
    expect(await prisma.growthContentVersion.count()).toBe(0);
    expect((await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } })).status).toBe(GrowthDecisionStatus.FAILED_RETRYABLE);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.FAILED_RETRYABLE);
  });

  it("G: unknown category cannot create a category or mutate a Translator", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const invalid = { ...draft(), categorySuggestion: "Invented Category" };
    await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(invalid), refreshShareImage });
    expect(await prisma.category.count()).toBe(1);
    expect(await prisma.translator.count()).toBe(0);
    expect((await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } })).status).toBe(GrowthDecisionStatus.WAITING_DATA);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.DEFERRED);
  });

  it("H: restores an exact trusted snapshot and appends rollback history", async () => {
    const createOpportunity = await seedOpportunity();
    const createdDecision = await decideTranslatorOpportunity(createOpportunity.id);
    const created = await executeTranslatorDecision(createdDecision.decision.id, { provider: new FakeProvider(), refreshShareImage });
    const translatorId = created.translatorId!;
    const createVersion = await prisma.growthContentVersion.findFirstOrThrow({ where: { translatorId, action: GrowthContentVersionAction.CREATE } });
    const improveOpportunity = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, mappedTranslatorId: translatorId });
    const improveDecision = await decideTranslatorOpportunity(improveOpportunity.id);
    const refinedDraft = { ...draft("Moonlit Compliment Translator", " refined"), subtitle: "A distinctly refined moonlit compliment voice" };
    await executeTranslatorDecision(improveDecision.decision.id, { provider: new FakeProvider(refinedDraft), refreshShareImage });
    const operationalDate = new Date("2026-10-06T00:00:00Z");
    await prisma.translator.update({ where: { id: translatorId }, data: { isActive: true, isFeatured: true, featuredRank: 7, featuredSource: "MANUAL", archivedAt: operationalDate, sortOrder: 321, modelOverride: "manual-model", shareImagePath: "/manual.png", shareImageHash: "manual-hash", shareImageUpdatedAt: operationalDate } });
    const other = await seedTranslator("Other Translator");
    const otherChecksum = (await readTranslatorSnapshot(other.id))!.checksum;
    await expect(rollbackTranslatorVersion({ translatorId: other.id, targetVersionId: createVersion.id, expectedCurrentChecksum: otherChecksum, refreshShareImage })).rejects.toThrow("does not belong");
    const currentChecksum = (await readTranslatorSnapshot(translatorId))!.checksum;
    const result = await rollbackTranslatorVersion({ translatorId, targetVersionId: createVersion.id, expectedCurrentChecksum: currentChecksum, refreshShareImage });
    expect(result.changed).toBe(true);
    expect(result.checksum).toBe(createVersion.checksum);
    expect(await prisma.growthContentVersion.count({ where: { translatorId } })).toBe(3);
    expect(await prisma.growthActivity.count({ where: { action: "TRANSLATOR_ROLLED_BACK" } })).toBe(1);
    const operational = await prisma.translator.findUniqueOrThrow({ where: { id: translatorId } });
    expect(operational).toMatchObject({ isActive: true, isFeatured: true, featuredRank: 7, featuredSource: "MANUAL", sortOrder: 321, modelOverride: "manual-model", shareImagePath: "/manual.png", shareImageHash: "manual-hash" });
    expect(operational.archivedAt?.toISOString()).toBe(operationalDate.toISOString());
    expect(operational.shareImageUpdatedAt?.toISOString()).toBe(operationalDate.toISOString());
  });

  it("I: returns a no-op when current content already equals rollback target", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const created = await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(), refreshShareImage });
    const version = await prisma.growthContentVersion.findFirstOrThrow();
    await expect(rollbackTranslatorVersion({ translatorId: created.translatorId!, targetVersionId: version.id, expectedCurrentChecksum: "0".repeat(64), refreshShareImage })).rejects.toThrow("changed before rollback");
    const currentChecksum = (await readTranslatorSnapshot(created.translatorId!))!.checksum;
    const result = await rollbackTranslatorVersion({ translatorId: created.translatorId!, targetVersionId: version.id, expectedCurrentChecksum: currentChecksum, refreshShareImage });
    expect(result.changed).toBe(false);
    expect(await prisma.growthContentVersion.count()).toBe(1);
  });

  it("J: leaves the decision job pending while Growth is disabled", async () => {
    await prisma.growthSettings.update({ where: { id: "global" }, data: { enabled: false } });
    const opportunity = await seedOpportunity();
    const queued = await enqueueTranslatorAutopilotDecision(opportunity.id);
    await expect(runGrowthWorker({ workerId: "phase8-disabled" })).resolves.toMatchObject({ status: "DISABLED", claimed: 0 });
    expect((await prisma.growthJob.findUniqueOrThrow({ where: { id: queued.job.id } })).status).toBe(GrowthJobStatus.PENDING);
    expect(await prisma.growthDecision.count()).toBe(0);
  });

  it("K: uses only the injected fake provider and persists its bounded metadata", async () => {
    const provider = new RepairProvider();
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    await executeTranslatorDecision(planned.decision.id, { provider, refreshShareImage });
    const decision = await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } });
    expect(provider.calls).toBe(2);
    expect(decision).toMatchObject({ aiProvider: "FAKE", aiModel: "fake-translator-v1", aiResponseId: "repair-1,repair-2", aiPromptTokens: 110, aiCompletionTokens: 220, aiTotalTokens: 330 });
    expect(decision.actualOutcome).toMatchObject({ generationAttempts: 2 });
  });

  it("L: stops after generation when Growth is disabled", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const provider: TranslatorGenerationProvider = {
      generate: async () => {
        await prisma.growthSettings.update({ where: { id: "global" }, data: { enabled: false } });
        return new FakeProvider().generate();
      },
    };
    await expect(executeTranslatorDecision(planned.decision.id, { provider, refreshShareImage })).rejects.toThrow("disabled after generation");
    expect(await prisma.translator.count()).toBe(0);
    expect(await prisma.growthContentVersion.count()).toBe(0);
    expect((await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } })).status).toBe(GrowthDecisionStatus.FAILED_RETRYABLE);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.FAILED_RETRYABLE);
  });

  it("M: detects a manual nested-content edit before improve apply", async () => {
    const existing = await seedTranslator();
    const opportunity = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, mappedTranslatorId: existing.id });
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const result = await executeTranslatorDecision(planned.decision.id, {
      provider: new FakeProvider(draft("Existing Moonlit Translator", " nested")),
      refreshShareImage,
      beforeApply: async () => { await prisma.translationMode.updateMany({ where: { translatorId: existing.id }, data: { instruction: "Manual nested edit must survive." } }); },
    });
    expect("blocked" in result && result.blocked).toBe(true);
    expect((await prisma.translationMode.findFirstOrThrow({ where: { translatorId: existing.id } })).instruction).toBe("Manual nested edit must survive.");
    expect(await prisma.growthContentVersion.count()).toBe(0);
  });

  it("detects pre-generation, editorial, and category concurrency without overwriting", async () => {
    const preGenerationTarget = await seedTranslator("Pre Generation Target");
    const preGenerationOpportunity = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, mappedTranslatorId: preGenerationTarget.id });
    const preGenerationDecision = await decideTranslatorOpportunity(preGenerationOpportunity.id);
    await prisma.translator.update({ where: { id: preGenerationTarget.id }, data: { subtitle: "Manual edit before generation" } });
    const unusedProvider = new FakeProvider(draft("Pre Generation Target", " improvement"));
    const preGenerationResult = await executeTranslatorDecision(preGenerationDecision.decision.id, { provider: unusedProvider, refreshShareImage });
    expect("blocked" in preGenerationResult && preGenerationResult.blocked).toBe(true);
    expect(unusedProvider.calls).toBe(0);

    const editorialTarget = await seedTranslator("Editorial Target");
    const editorialOpportunity = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, mappedTranslatorId: editorialTarget.id });
    const editorialDecision = await decideTranslatorOpportunity(editorialOpportunity.id);
    const editorialResult = await executeTranslatorDecision(editorialDecision.decision.id, { provider: new FakeProvider(draft("Editorial Target", " improvement")), refreshShareImage, beforeApply: async () => { await prisma.translatorEditorialContent.updateMany({ where: { translatorId: editorialTarget.id }, data: { about: "Manual editorial edit" } }); } });
    expect("blocked" in editorialResult && editorialResult.blocked).toBe(true);

    const otherCategory = await prisma.category.create({ data: { name: "Roleplay", slug: "roleplay", isActive: true } });
    const categoryTarget = await seedTranslator("Category Target");
    const categoryOpportunity = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, mappedTranslatorId: categoryTarget.id });
    const categoryDecision = await decideTranslatorOpportunity(categoryOpportunity.id);
    const categoryResult = await executeTranslatorDecision(categoryDecision.decision.id, { provider: new FakeProvider(draft("Category Target", " improvement")), refreshShareImage, beforeApply: async () => {
      await prisma.translatorCategory.deleteMany({ where: { translatorId: categoryTarget.id } });
      await prisma.translatorCategory.create({ data: { translatorId: categoryTarget.id, categoryId: otherCategory.id, sortOrder: 1 } });
      await prisma.translator.update({ where: { id: categoryTarget.id }, data: { primaryCategoryId: otherCategory.id } });
    } });
    expect("blocked" in categoryResult && categoryResult.blocked).toBe(true);
    expect(await prisma.growthContentVersion.count()).toBe(0);
  });

  it("N: blocks apply when the selected category becomes inactive", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const result = await executeTranslatorDecision(planned.decision.id, {
      provider: new FakeProvider(),
      refreshShareImage,
      beforeApply: async () => { await prisma.category.update({ where: { slug: "funny" }, data: { isActive: false } }); },
    });
    expect("blocked" in result && result.blocked).toBe(true);
    expect(await prisma.translator.count()).toBe(0);
    expect(await prisma.growthContentVersion.count()).toBe(0);
  });

  it("O: rejects unsafe historical categories without partial rollback", async () => {
    const createOpportunity = await seedOpportunity();
    const createDecision = await decideTranslatorOpportunity(createOpportunity.id);
    const created = await executeTranslatorDecision(createDecision.decision.id, { provider: new FakeProvider(), refreshShareImage });
    const translatorId = created.translatorId!;
    const createVersion = await prisma.growthContentVersion.findFirstOrThrow({ where: { translatorId } });
    const improveOpportunity = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, mappedTranslatorId: translatorId });
    const improveDecision = await decideTranslatorOpportunity(improveOpportunity.id);
    await executeTranslatorDecision(improveDecision.decision.id, { provider: new FakeProvider({ ...draft(), title: "Safely improved title", promptInstructions: `${draft().promptInstructions} Add crisp detail.` }), refreshShareImage });
    const before = await readTranslatorSnapshot(translatorId);
    const versionCount = await prisma.growthContentVersion.count({ where: { translatorId } });
    const category = await prisma.category.findFirstOrThrow({ where: { slug: "funny" } });
    await prisma.category.update({ where: { id: category.id }, data: { isActive: false } });
    await expect(rollbackTranslatorVersion({ translatorId, targetVersionId: createVersion.id, expectedCurrentChecksum: before!.checksum, refreshShareImage })).rejects.toMatchObject({ diagnostics: expect.arrayContaining([expect.objectContaining({ code: "HISTORICAL_CATEGORY_UNAVAILABLE" })]) });
    await prisma.category.update({ where: { id: category.id }, data: { isActive: true } });
    const stored = createVersion.afterSnapshot as Record<string, unknown>;
    await prisma.growthContentVersion.update({ where: { id: createVersion.id }, data: { afterSnapshot: { ...stored, categories: [{ id: "missing-category", name: "Missing", slug: "missing", sortOrder: 1 }], primaryCategoryId: "missing-category" } } });
    await expect(rollbackTranslatorVersion({ translatorId, targetVersionId: createVersion.id, expectedCurrentChecksum: before!.checksum, refreshShareImage })).rejects.toMatchObject({ diagnostics: expect.arrayContaining([expect.objectContaining({ code: "HISTORICAL_CATEGORY_UNAVAILABLE" })]) });
    await prisma.growthContentVersion.update({ where: { id: createVersion.id }, data: { afterSnapshot: { ...stored, primaryCategoryId: "missing-primary" } } });
    await expect(rollbackTranslatorVersion({ translatorId, targetVersionId: createVersion.id, expectedCurrentChecksum: before!.checksum, refreshShareImage })).rejects.toMatchObject({ diagnostics: expect.arrayContaining([expect.objectContaining({ code: "PRIMARY_CATEGORY_INVALID" })]) });
    expect((await readTranslatorSnapshot(translatorId))!.checksum).toBe(before!.checksum);
    expect(await prisma.growthContentVersion.count({ where: { translatorId } })).toBe(versionCount);
  });

  it("P: reconciles a failed post-commit share image without duplicate mutation", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const provider = new FakeProvider();
    const failingRefresh = vi.fn(async () => { throw new Error("fake image renderer failure"); });
    await expect(executeTranslatorDecision(planned.decision.id, { provider, refreshShareImage: failingRefresh })).rejects.toThrow("reconciliation is pending");
    expect(await prisma.translator.count()).toBe(1);
    expect(await prisma.growthContentVersion.count()).toBe(1);
    expect((await prisma.growthContentVersion.findFirstOrThrow()).sideEffectStatus).toBe("FAILED_RETRYABLE");
    await executeTranslatorDecision(planned.decision.id, { provider, refreshShareImage });
    expect(await prisma.translator.count()).toBe(1);
    expect(await prisma.growthContentVersion.count()).toBe(1);
    expect((await prisma.growthContentVersion.findFirstOrThrow()).sideEffectStatus).toBe("SYNCHRONIZED");
    expect(provider.calls).toBe(1);
  });

  it("revalidates duplicates that appear after generation", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const result = await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(), refreshShareImage, beforeApply: async () => { await seedTranslator("Moonlit Compliment Translator"); } });
    expect("blocked" in result && result.blocked).toBe(true);
    expect(await prisma.translator.count()).toBe(1);
    expect(await prisma.growthContentVersion.count()).toBe(0);
  });

  it("revalidates decision executability immediately before mutation", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const result = await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(), refreshShareImage, beforeApply: async () => { await prisma.growthDecision.update({ where: { id: planned.decision.id }, data: { status: GrowthDecisionStatus.CANCELLED } }); } });
    expect(result.reused).toBe(true);
    expect(await prisma.translator.count()).toBe(0);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.CANCELLED);
  });

  it("revalidates the source opportunity immediately before mutation", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const result = await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(), refreshShareImage, beforeApply: async () => { await prisma.growthOpportunity.update({ where: { id: opportunity.id }, data: { status: GrowthOpportunityStatus.DISMISSED, closedAt: new Date() } }); } });
    expect("blocked" in result && result.blocked).toBe(true);
    expect(await prisma.translator.count()).toBe(0);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.DISMISSED);
  });

  it("closes NO_ACTION and terminal validation outcomes deterministically", async () => {
    const noActionOpportunity = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER });
    const noAction = await decideTranslatorOpportunity(noActionOpportunity.id);
    expect(noAction.decision).toMatchObject({ type: GrowthDecisionType.NO_ACTION, status: GrowthDecisionStatus.COMPLETED });
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: noActionOpportunity.id } })).status).toBe(GrowthOpportunityStatus.DISMISSED);

    const terminalOpportunity = await seedOpportunity();
    const terminal = await decideTranslatorOpportunity(terminalOpportunity.id);
    await executeTranslatorDecision(terminal.decision.id, { provider: new FakeProvider({ ...draft(), subtitle: "TODO placeholder" }), refreshShareImage });
    expect((await prisma.growthDecision.findUniqueOrThrow({ where: { id: terminal.decision.id } })).status).toBe(GrowthDecisionStatus.FAILED_TERMINAL);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: terminalOpportunity.id } })).status).toBe(GrowthOpportunityStatus.FAILED_TERMINAL);
  });

  it("keeps a Growth-created Translator inactive until quality and share-image state are activation-ready", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const created = await executeTranslatorDecision(planned.decision.id, { provider: new FakeProvider(), refreshShareImage });
    const translatorId = created.translatorId!;
    expect((await prisma.translator.findUniqueOrThrow({ where: { id: translatorId } })).isActive).toBe(false);
    await expect(assertGrowthTranslatorActivationReady(translatorId)).rejects.toThrow("share image");
    await prisma.translator.update({ where: { id: translatorId }, data: { shareImagePath: "/generated/pins/ready.png", shareImageHash: "ready-hash", shareImageUpdatedAt: new Date() } });
    await expect(assertGrowthTranslatorActivationReady(translatorId)).resolves.toBeUndefined();
    await prisma.translator.update({ where: { id: translatorId }, data: { subtitle: "TODO placeholder" } });
    await expect(assertGrowthTranslatorActivationReady(translatorId)).rejects.toThrow("PLACEHOLDER_TEXT");
  });

  it("recovers a stale Translator execution decision and retries without duplicate mutation", async () => {
    const opportunity = await seedOpportunity();
    const planned = await decideTranslatorOpportunity(opportunity.id);
    const jobId = planned.execution!.job.id;
    await prisma.growthDecision.update({ where: { id: planned.decision.id }, data: { status: GrowthDecisionStatus.EXECUTING } });
    await prisma.growthJob.update({ where: { id: jobId }, data: { status: GrowthJobStatus.RUNNING, workerId: "crashed-translator-worker", attemptCount: 1, maxAttempts: 2, claimedAt: new Date(0), leaseUntil: new Date(0), heartbeatAt: new Date(0) } });

    await expect(recoverStaleGrowthJobs(new Date(), 1)).resolves.toBe(1);
    expect(await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } })).toMatchObject({ status: GrowthDecisionStatus.FAILED_RETRYABLE, reasonCodes: expect.arrayContaining(["EXECUTION_JOB_LEASE_EXPIRED"]) });
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.FAILED_RETRYABLE);
    expect((await prisma.growthJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe(GrowthJobStatus.PENDING);

    const provider = new FakeProvider();
    await executeTranslatorDecision(planned.decision.id, { provider, refreshShareImage });
    await executeTranslatorDecision(planned.decision.id, { provider, refreshShareImage });
    expect(await prisma.translator.count()).toBe(1);
    expect(await prisma.growthContentVersion.count()).toBe(1);
  });
});
