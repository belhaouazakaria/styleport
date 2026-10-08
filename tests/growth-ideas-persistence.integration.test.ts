import {
  GrowthDecisionStatus,
  GrowthDecisionType,
  GrowthIdeaStatus,
  GrowthIdeaVersionAction,
  GrowthJobStatus,
  GrowthJobType,
  GrowthOpportunityEvidenceQuality,
  GrowthOpportunityStatus,
  GrowthOpportunityType,
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
  Role,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { generateMetadata as generateIdeaMetadata } from "@/app/(public)/ideas/[slug]/page";
import { getIndexableIdeaSlugsForSitemap, getPublicIdeaBySlug, getPublicIdeaCategories, getPublicIdeasPage } from "@/lib/data/ideas";
import type { GeneratedIdeaCandidate } from "@/lib/growth/ideas/contracts";
import { IdeaGenerationError, type IdeaGenerationProvider } from "@/lib/growth/ideas/generation";
import { recoverStaleGrowthJobs } from "@/lib/growth/jobs";
import { archiveIdea, decideIdeaOpportunity, enqueueIdeaAutopilotDecision, executeIdeaDecision, rollbackIdeaVersion } from "@/lib/growth/ideas/service";
import { CONTENT_CLUSTERING_VERSION, OPPORTUNITY_INTELLIGENCE_VERSION } from "@/lib/growth/opportunity/constants";
import { runGrowthWorker } from "@/lib/growth/worker";
import { prisma } from "@/lib/prisma";

const enabled = process.env.RUN_GROWTH_IDEAS_DB_TESTS === "1";
const suite = enabled ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase9_ideas_test";

if (enabled) {
  const url = process.env.GROWTH_IDEAS_TEST_DATABASE_URL;
  if (!url || url !== process.env.DATABASE_URL) throw new Error("Phase 9 DB tests require matching explicit URLs.");
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName) throw new Error(`Phase 9 DB tests refuse every target except local database ${requiredDatabaseName}.`);
}

let sequence = 0;

function candidate(translatorSlug: string, suffix = ""): GeneratedIdeaCandidate {
  return {
    title: "15 Funny Ways to Say Happy Birthday",
    slug: "15-funny-ways-to-say-happy-birthday",
    categorySuggestion: "birthdays",
    excerpt: `Fifteen playful birthday messages with context for choosing the right line.${suffix}`,
    seoTitle: "15 Funny Ways to Say Happy Birthday",
    seoDescription: "Find fifteen funny birthday messages with practical context, from warm teasing to playful one-liners for friends and family.",
    blocks: [
      { type: "INTRO", text: "A funny birthday line should fit the relationship, feel kind, and still sound like something you would actually send." },
      { type: "HEADING", level: 2, text: "Funny birthday messages" },
      { type: "IDEA_LIST", items: Array.from({ length: 15 }, (_, index) => ({ text: `Birthday message ${index + 1}: a distinct playful line${suffix}`, context: `Use this for birthday situation ${index + 1}.` })) },
      { type: "CALLOUT", heading: "Keep it personal", text: "Pick the line that fits your shared sense of humor and avoid jokes about sensitive topics." },
      { type: "TRANSLATOR_CTA", translatorSlug, heading: "Give your draft a funnier twist", body: "Use the Funny Translator when you already have a birthday message and want a more playful version.", buttonLabel: "Try the Funny Translator" },
    ],
  };
}

class FakeProvider implements IdeaGenerationProvider {
  calls = 0;
  constructor(private readonly output: GeneratedIdeaCandidate, private readonly fail = false) {}
  async generate() {
    this.calls += 1;
    if (this.fail) throw new Error("fake invalid generation");
    return { candidate: this.output, metadata: { provider: "FAKE", model: "fake-ideas-v1", responseId: `fake-${this.calls}`, promptTokens: 100, completionTokens: 200, totalTokens: 300 } };
  }
}

async function clean() {
  await prisma.growthIdea.updateMany({ data: { status: GrowthIdeaStatus.DRAFT, currentVersionId: null, publishedAt: null, archivedAt: null } });
  await prisma.growthIdeaTranslatorReference.deleteMany();
  await prisma.growthIdeaVersion.deleteMany();
  await prisma.growthDecision.deleteMany();
  await prisma.growthIdea.deleteMany();
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
  await prisma.user.deleteMany();
  await prisma.growthIdeaCategory.updateMany({ data: { isActive: true, archivedAt: null } });
}

async function seedTranslator(active = true) {
  return prisma.translator.create({ data: {
    name: "Funny Translator", slug: `funny-translator-${sequence}`, title: "Funny Translator", subtitle: "Make a message playful", shortDescription: "Rewrite a message with a playful tone while preserving its meaning.",
    sourceLabel: "Original text", targetLabel: "Funny rewrite", promptSystem: "Transform text into a funny style while preserving meaning and facts.", promptInstructions: "Preserve meaning, facts, and intent. Never invent details.", isActive: active,
  } });
}

async function seedOpportunity(options: {
  type?: GrowthOpportunityType;
  clusterId?: string;
  clusterName?: string;
  score?: number;
  confidence?: number;
  intelligenceModelVersion?: string;
  analysisClusteringModelVersion?: string;
  opportunityClusteringModelVersion?: string;
  representativePinCount?: number;
} = {}) {
  sequence += 1;
  const intelligenceModelVersion = options.intelligenceModelVersion || OPPORTUNITY_INTELLIGENCE_VERSION;
  const analysisClusteringModelVersion = options.analysisClusteringModelVersion || CONTENT_CLUSTERING_VERSION;
  const opportunityClusteringModelVersion = options.opportunityClusteringModelVersion || CONTENT_CLUSTERING_VERSION;
  const representativePinCount = options.representativePinCount ?? 3;
  const analysis = await prisma.growthOpportunityAnalysisRun.create({ data: {
    analysisDate: new Date(Date.UTC(2027, Math.floor((sequence - 1) / 28), ((sequence - 1) % 28) + 1)), evidenceWindowStart: new Date("2026-09-01T00:00:00Z"), evidenceWindowEnd: new Date("2026-09-28T00:00:00Z"),
    intelligenceModelVersion, scoringModelVersion: "opportunity_scoring_v1", clusteringModelVersion: analysisClusteringModelVersion, evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN,
    pinsConsidered: representativePinCount, pinCap: 500, clustersProduced: 1, opportunitiesProduced: 1, attributionCollection: "NOT_COLLECTING", reasonCodes: [], summary: "Bounded Phase 9 integration fixture.",
  } });
  const cluster = options.clusterId ? await prisma.growthContentCluster.findUniqueOrThrow({ where: { id: options.clusterId } }) : await prisma.growthContentCluster.create({ data: { clusterKey: `birthday-${sequence}`, name: options.clusterName || "funny-birthday-messages", clusteringVersion: analysisClusteringModelVersion, summary: "Specific birthday message intent." } });
  const snapshot = await prisma.growthContentClusterSnapshot.create({ data: { analysisRunId: analysis.id, clusterId: cluster.id, pinCount: representativePinCount, distinctDestinationCount: representativePinCount, activeWeekCount: 4, impressions: 3000, saves: 90, pinClicks: 150, outboundClicks: 110, evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN, reasonCodes: [] } });
  const account = await prisma.growthPinterestAccount.upsert({ where: { pinterestAccountId: "phase9" }, create: { pinterestAccountId: "phase9", publicationRole: GrowthPinterestPublicationRole.SAYTWIST_IDEAS, activeRole: GrowthPinterestPublicationRole.SAYTWIST_IDEAS, username: "saytwist", apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION, connectionStatus: GrowthPinterestConnectionStatus.CONNECTED, grantedScopes: ["pins:read"], encryptedCredentials: "integration-fixture-envelope-not-a-real-token", accessTokenExpiresAt: new Date("2027-12-01T00:00:00Z"), refreshTokenExpiresAt: new Date("2028-01-01T00:00:00Z") }, update: {} });
  for (let index = 0; index < representativePinCount; index += 1) {
    const pinterestPinId = `phase9-${sequence}-${index}`;
    const pin = await prisma.growthPinterestPin.create({ data: { accountId: account.id, pinterestPinId, title: `Funny birthday message ${index + 1}`, description: "Specific demand for playful birthday wishes and examples", destinationUrl: `https://saytwist.com/ideas/source-${sequence}-${index}`, isActive: true, analyticsEligible: true, lastSeenAt: new Date(), lastSyncedAt: new Date() } });
    await prisma.growthContentClusterMembership.create({ data: { snapshotId: snapshot.id, pinId: pin.id, pinterestPinId, destinationPath: `/ideas/source-${sequence}-${index}`, matchTokens: ["funny", "birthday", "messages"] } });
  }
  const opportunity = await prisma.growthOpportunity.create({ data: { analysisRunId: analysis.id, clusterId: cluster.id, type: options.type || GrowthOpportunityType.FILL_INVENTORY_GAP, status: GrowthOpportunityStatus.OPEN, score: options.score ?? 90, confidence: options.confidence ?? 92, evidenceQuality: GrowthOpportunityEvidenceQuality.KNOWN, scoringModelVersion: "opportunity_scoring_v1", clusteringModelVersion: opportunityClusteringModelVersion, evidence: {}, reasonCodes: ["SPECIFIC_EDITORIAL_GAP"], dedupeKey: `phase9-opportunity-${sequence}` } });
  return { opportunity, cluster };
}

async function createIdeaFixture() {
  const translator = await seedTranslator();
  const { opportunity, cluster } = await seedOpportunity();
  const planned = await decideIdeaOpportunity(opportunity.id);
  const result = await executeIdeaDecision(planned.decision.id, { provider: new FakeProvider(candidate(translator.slug)) });
  return { translator, opportunity, cluster, planned, result, idea: await prisma.growthIdea.findFirstOrThrow({ include: { currentVersion: true } }) };
}

beforeEach(async () => {
  await clean();
  await prisma.growthSettings.create({ data: { id: "global", enabled: true, attributionEnabled: false } });
});

afterAll(async () => { if (enabled) await clean(); await prisma.$disconnect(); });

suite("Growth Phase 9 PostgreSQL A-P scenarios", () => {
  it("A: creates and publishes one Idea with v1 and actions the opportunity", async () => {
    const { result, opportunity } = await createIdeaFixture();
    expect(result.decision.status).toBe(GrowthDecisionStatus.COMPLETED);
    expect(await prisma.growthIdea.count({ where: { status: GrowthIdeaStatus.PUBLISHED } })).toBe(1);
    expect(await prisma.growthIdeaVersion.count({ where: { action: GrowthIdeaVersionAction.CREATE } })).toBe(1);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.ACTIONED);
  });

  it("B: concurrent/repeated create execution produces one Idea and version", async () => {
    const translator = await seedTranslator(); const { opportunity } = await seedOpportunity(); const planned = await decideIdeaOpportunity(opportunity.id); const provider = new FakeProvider(candidate(translator.slug));
    await Promise.all([executeIdeaDecision(planned.decision.id, { provider }), executeIdeaDecision(planned.decision.id, { provider })]);
    expect(await prisma.growthIdea.count()).toBe(1); expect(await prisma.growthIdeaVersion.count()).toBe(1);
  });

  it("C: blocks an equivalent existing Idea", async () => {
    const first = await createIdeaFixture(); const { opportunity } = await seedOpportunity(); const planned = await decideIdeaOpportunity(opportunity.id);
    const result = await executeIdeaDecision(planned.decision.id, { provider: new FakeProvider(candidate(first.translator.slug)) });
    expect("blocked" in result && result.blocked).toBe(true); expect(await prisma.growthIdea.count()).toBe(1);
  });

  it("D: improves a mapped Idea with a new immutable version", async () => {
    const first = await createIdeaFixture(); const { opportunity } = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, clusterId: first.cluster.id }); const planned = await decideIdeaOpportunity(opportunity.id);
    expect(planned.decision.type).toBe(GrowthDecisionType.IMPROVE_IDEA);
    await executeIdeaDecision(planned.decision.id, { provider: new FakeProvider(candidate(first.translator.slug, " Refined")) });
    const idea = await prisma.growthIdea.findUniqueOrThrow({ where: { id: first.idea.id }, include: { currentVersion: true } });
    expect(idea.currentVersion?.version).toBe(2); expect(await prisma.growthIdeaVersion.count({ where: { ideaId: idea.id } })).toBe(2);
  });

  it("E: refuses a concurrent Idea revision", async () => {
    const first = await createIdeaFixture(); const { opportunity } = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, clusterId: first.cluster.id }); const planned = await decideIdeaOpportunity(opportunity.id);
    const result = await executeIdeaDecision(planned.decision.id, { provider: new FakeProvider(candidate(first.translator.slug, " Revised")), beforeApply: async () => { await prisma.growthIdeaVersion.update({ where: { id: first.idea.currentVersionId! }, data: { excerpt: "Manual concurrent edit that changes the trusted current version." } }); } });
    expect("blocked" in result && result.blocked).toBe(true); expect(await prisma.growthIdeaVersion.count({ where: { ideaId: first.idea.id } })).toBe(1);
  });

  it("F: invalid generation after repair leaves no published mutation", async () => {
    const translator = await seedTranslator(); const { opportunity } = await seedOpportunity(); const planned = await decideIdeaOpportunity(opportunity.id);
    await expect(executeIdeaDecision(planned.decision.id, { provider: new FakeProvider(candidate(translator.slug), true) })).rejects.toThrow("fake invalid generation");
    expect(await prisma.growthIdea.count()).toBe(0);
  });

  it("G: unknown category cannot be created or published", async () => {
    const translator = await seedTranslator(); const { opportunity } = await seedOpportunity(); const planned = await decideIdeaOpportunity(opportunity.id);
    await executeIdeaDecision(planned.decision.id, { provider: new FakeProvider({ ...candidate(translator.slug), categorySuggestion: "invented-category" }) });
    expect(await prisma.growthIdea.count()).toBe(0); expect(await prisma.growthIdeaCategory.findUnique({ where: { slug: "invented-category" } })).toBeNull();
    expect(await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } })).toMatchObject({ aiProvider: "FAKE", aiTotalTokens: 300, actualOutcome: { generation: { attemptCount: 1 } } });
  });

  it("H: inactive or unknown Translator references block publication", async () => {
    const translator = await seedTranslator(false); const { opportunity } = await seedOpportunity(); const planned = await decideIdeaOpportunity(opportunity.id);
    await executeIdeaDecision(planned.decision.id, { provider: new FakeProvider(candidate(translator.slug)) });
    expect(await prisma.growthIdea.count()).toBe(0);
  });

  it("I: rollback restores a trusted version by appending a new version", async () => {
    const first = await createIdeaFixture(); const v1 = await prisma.growthIdeaVersion.findFirstOrThrow({ where: { ideaId: first.idea.id } });
    const { opportunity } = await seedOpportunity({ type: GrowthOpportunityType.AMPLIFY_WINNER, clusterId: first.cluster.id }); const planned = await decideIdeaOpportunity(opportunity.id);
    await executeIdeaDecision(planned.decision.id, { provider: new FakeProvider(candidate(first.translator.slug, " Refined")) });
    const admin = await prisma.user.create({ data: { email: "admin@example.com", passwordHash: "not-a-real-hash", role: Role.ADMIN } });
    const current = await prisma.growthIdea.findUniqueOrThrow({ where: { id: first.idea.id }, include: { currentVersion: true } });
    const result = await rollbackIdeaVersion({ ideaId: first.idea.id, targetVersionId: v1.id, expectedCurrentChecksum: current.currentVersion!.checksum, actorUserId: admin.id });
    expect(result.changed).toBe(true); expect(result.version?.version).toBe(3);
  });

  it("J: rollback to equivalent current content is an idempotent no-op", async () => {
    const first = await createIdeaFixture(); const admin = await prisma.user.create({ data: { email: "admin@example.com", passwordHash: "not-a-real-hash", role: Role.ADMIN } });
    const result = await rollbackIdeaVersion({ ideaId: first.idea.id, targetVersionId: first.idea.currentVersionId!, expectedCurrentChecksum: first.idea.currentVersion!.checksum, actorUserId: admin.id });
    expect(result.changed).toBe(false); expect(await prisma.growthIdeaVersion.count()).toBe(1);
  });

  it("K: disabled Growth leaves the decision job pending", async () => {
    await prisma.growthSettings.update({ where: { id: "global" }, data: { enabled: false } }); const { opportunity } = await seedOpportunity(); const queued = await enqueueIdeaAutopilotDecision(opportunity.id);
    expect(await runGrowthWorker({ workerId: "phase9-disabled" })).toMatchObject({ status: "DISABLED", claimed: 0 });
    expect((await prisma.growthJob.findUniqueOrThrow({ where: { id: queued.job.id } })).status).toBe(GrowthJobStatus.PENDING);
  });

  it("L: disabling Growth during generation prevents publication", async () => {
    const translator = await seedTranslator(); const { opportunity } = await seedOpportunity(); const planned = await decideIdeaOpportunity(opportunity.id);
    const provider: IdeaGenerationProvider = { generate: async () => { await prisma.growthSettings.update({ where: { id: "global" }, data: { enabled: false } }); return new FakeProvider(candidate(translator.slug)).generate(); } };
    await expect(executeIdeaDecision(planned.decision.id, { provider })).rejects.toThrow("disabled after generation"); expect(await prisma.growthIdea.count()).toBe(0);
  });

  it("M: archives a published Idea while retaining all history", async () => {
    const first = await createIdeaFixture(); const admin = await prisma.user.create({ data: { email: "admin@example.com", passwordHash: "not-a-real-hash", role: Role.ADMIN } });
    await archiveIdea({ ideaId: first.idea.id, expectedCurrentChecksum: first.idea.currentVersion!.checksum, actorUserId: admin.id });
    expect((await prisma.growthIdea.findUniqueOrThrow({ where: { id: first.idea.id } })).status).toBe(GrowthIdeaStatus.ARCHIVED); expect(await prisma.growthIdeaVersion.count()).toBe(1);
  });

  it("N: public queries return only published current versions", async () => {
    const first = await createIdeaFixture(); expect((await getPublicIdeasPage()).total).toBe(1); expect(await getPublicIdeaBySlug(first.idea.slug)).not.toBeNull();
    await prisma.growthIdea.update({ where: { id: first.idea.id }, data: { status: GrowthIdeaStatus.NEEDS_REVISION } });
    expect((await getPublicIdeasPage()).total).toBe(0); expect(await getPublicIdeaBySlug(first.idea.slug)).toBeNull();
  });

  it("O: sitemap data includes only published, non-archived Ideas", async () => {
    const first = await createIdeaFixture(); expect(await getIndexableIdeaSlugsForSitemap()).toEqual([expect.objectContaining({ slug: first.idea.slug })]);
    await prisma.growthIdea.update({ where: { id: first.idea.id }, data: { status: GrowthIdeaStatus.ARCHIVED, archivedAt: new Date() } }); expect(await getIndexableIdeaSlugsForSitemap()).toEqual([]);
  });

  it("P: uses only the injected fake provider and records bounded AI metadata", async () => {
    const translator = await seedTranslator(); const { opportunity } = await seedOpportunity(); const planned = await decideIdeaOpportunity(opportunity.id); const provider = new FakeProvider(candidate(translator.slug));
    await executeIdeaDecision(planned.decision.id, { provider }); const decision = await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } });
    expect(provider.calls).toBe(1); expect(decision).toMatchObject({ aiProvider: "FAKE", aiModel: "fake-ideas-v1", aiResponseId: "fake-1", aiPromptTokens: 100, aiCompletionTokens: 200, aiTotalTokens: 300 });
  });

  it("recovers stale Idea execution as retryable and terminal without duplicate mutation", async () => {
    const translator = await seedTranslator();
    const { opportunity } = await seedOpportunity();
    const planned = await decideIdeaOpportunity(opportunity.id);
    const jobId = planned.execution!.job.id;
    await prisma.growthDecision.update({ where: { id: planned.decision.id }, data: { status: GrowthDecisionStatus.EXECUTING } });
    await prisma.growthJob.update({ where: { id: jobId }, data: { status: GrowthJobStatus.RUNNING, workerId: "crashed-idea-worker", attemptCount: 1, maxAttempts: 2, claimedAt: new Date(0), leaseUntil: new Date(0), heartbeatAt: new Date(0) } });
    await expect(recoverStaleGrowthJobs(new Date(), 1)).resolves.toBe(1);
    expect(await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } })).toMatchObject({ status: GrowthDecisionStatus.FAILED_RETRYABLE, reasonCodes: expect.arrayContaining(["EXECUTION_JOB_LEASE_EXPIRED"]) });
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.FAILED_RETRYABLE);
    await executeIdeaDecision(planned.decision.id, { provider: new FakeProvider(candidate(translator.slug)) });
    await executeIdeaDecision(planned.decision.id, { provider: new FakeProvider(candidate(translator.slug)) });
    expect(await prisma.growthIdea.count()).toBe(1);
    expect(await prisma.growthIdeaVersion.count()).toBe(1);

    const terminalOpportunity = await seedOpportunity({ clusterName: "specific-terminal-topic" });
    const terminal = await decideIdeaOpportunity(terminalOpportunity.opportunity.id);
    await prisma.growthDecision.update({ where: { id: terminal.decision.id }, data: { status: GrowthDecisionStatus.EXECUTING } });
    await prisma.growthJob.update({ where: { id: terminal.execution!.job.id }, data: { status: GrowthJobStatus.RUNNING, workerId: "crashed-terminal-worker", attemptCount: 1, maxAttempts: 1, claimedAt: new Date(0), leaseUntil: new Date(0), heartbeatAt: new Date(0) } });
    await expect(recoverStaleGrowthJobs(new Date(), 1)).resolves.toBe(1);
    expect(await prisma.growthDecision.findUniqueOrThrow({ where: { id: terminal.decision.id } })).toMatchObject({ status: GrowthDecisionStatus.FAILED_TERMINAL, completedAt: expect.any(Date) });
    expect(await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: terminalOpportunity.opportunity.id } })).toMatchObject({ status: GrowthOpportunityStatus.FAILED_TERMINAL, closedAt: expect.any(Date) });
  });

  it("requires an active Idea category for every public query", async () => {
    const first = await createIdeaFixture();
    await prisma.growthIdeaCategory.update({ where: { id: first.idea.categoryId }, data: { isActive: false } });
    expect((await getPublicIdeasPage()).total).toBe(0);
    expect(await getPublicIdeaBySlug(first.idea.slug)).toBeNull();
    expect(await getIndexableIdeaSlugsForSitemap()).toEqual([]);
    expect(await getPublicIdeaCategories()).toEqual([]);
  });

  it("rejects rollback of an archived Idea and keeps it unavailable", async () => {
    const first = await createIdeaFixture();
    const admin = await prisma.user.create({ data: { email: "archive-admin@example.com", passwordHash: "not-a-real-hash", role: Role.ADMIN } });
    await archiveIdea({ ideaId: first.idea.id, expectedCurrentChecksum: first.idea.currentVersion!.checksum, actorUserId: admin.id });
    await expect(rollbackIdeaVersion({ ideaId: first.idea.id, targetVersionId: first.idea.currentVersionId!, expectedCurrentChecksum: first.idea.currentVersion!.checksum, actorUserId: admin.id })).rejects.toThrow("Archived Ideas cannot be restored");
    expect((await prisma.growthIdea.findUniqueOrThrow({ where: { id: first.idea.id } })).status).toBe(GrowthIdeaStatus.ARCHIVED);
    expect(await getPublicIdeaBySlug(first.idea.slug)).toBeNull();
  });

  it("enforces current-version ownership in PostgreSQL", async () => {
    const first = await createIdeaFixture();
    const other = await prisma.growthIdea.create({ data: { slug: "another-safe-idea", categoryId: first.idea.categoryId, status: GrowthIdeaStatus.DRAFT, seoTitle: "Another safe Idea title", seoDescription: "Another safe Idea description that remains a draft during this ownership invariant test." } });
    await prisma.growthIdea.update({ where: { id: first.idea.id }, data: { status: GrowthIdeaStatus.DRAFT, currentVersionId: null, publishedAt: null } });
    await expect(prisma.growthIdea.update({ where: { id: other.id }, data: { currentVersionId: first.idea.currentVersionId } })).rejects.toThrow(/currentVersionId must reference a version owned by the same Idea/);
  });

  it("uses current-version SEO and fails closed on corrupt current blocks", async () => {
    const first = await createIdeaFixture();
    await prisma.growthIdea.update({ where: { id: first.idea.id }, data: { seoTitle: "Stale parent SEO title", seoDescription: "Stale parent SEO description that must never become public metadata." } });
    const metadata = await generateIdeaMetadata({ params: Promise.resolve({ slug: first.idea.slug }) });
    expect(metadata).toMatchObject({ title: first.idea.currentVersion!.seoTitle, description: first.idea.currentVersion!.seoDescription });
    await prisma.growthIdeaVersion.update({ where: { id: first.idea.currentVersionId! }, data: { blocks: [{ type: "PARAGRAPH", text: "Only one block is corrupt because the full contract requires at least three." }] } });
    expect(await getPublicIdeaBySlug(first.idea.slug)).toBeNull();
  });

  it("retains aggregate AI metadata when schema generation and repair both fail", async () => {
    const { opportunity } = await seedOpportunity();
    const planned = await decideIdeaOpportunity(opportunity.id);
    let calls = 0;
    const provider: IdeaGenerationProvider = { generate: async () => {
      calls += 1;
      throw new IdeaGenerationError("fake schema failure", { provider: "FAKE", model: "fake-invalid", responseId: `invalid-${calls}`, promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    } };
    await expect(executeIdeaDecision(planned.decision.id, { provider })).rejects.toThrow("fake schema failure");
    expect(await prisma.growthDecision.findUniqueOrThrow({ where: { id: planned.decision.id } })).toMatchObject({ aiProvider: "FAKE", aiModel: "fake-invalid", aiResponseId: "invalid-1,invalid-2", aiPromptTokens: 20, aiCompletionTokens: 40, aiTotalTokens: 60, actualOutcome: { generation: { attemptCount: 2 } } });
  });

  it("dismisses a high-volume v1 opportunity without creating an execution job", async () => {
    const { opportunity } = await seedOpportunity({
      type: GrowthOpportunityType.AMPLIFY_WINNER,
      clusterName: "translators",
      score: 94,
      confidence: 100,
      intelligenceModelVersion: "opportunity_intelligence_v1",
      analysisClusteringModelVersion: "content_clustering_v1",
      opportunityClusteringModelVersion: "content_clustering_v1",
      representativePinCount: 100,
    });
    const planned = await decideIdeaOpportunity(opportunity.id);
    expect(planned.decision).toMatchObject({ type: GrowthDecisionType.NO_ACTION, status: GrowthDecisionStatus.COMPLETED, reasonCodes: ["IDEA_SOURCE_MODEL_OUTDATED"] });
    expect(planned.execution).toBeNull();
    expect(await prisma.growthJob.count({ where: { type: GrowthJobType.IDEA_AUTOPILOT_EXECUTE } })).toBe(0);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.DISMISSED);
  });

  it("defers a high-volume current-model generic opportunity without creating an execution job", async () => {
    const { opportunity } = await seedOpportunity({
      type: GrowthOpportunityType.AMPLIFY_WINNER,
      clusterName: "historical",
      score: 77,
      confidence: 100,
      representativePinCount: 20,
    });
    const planned = await decideIdeaOpportunity(opportunity.id);
    expect(planned.decision).toMatchObject({ type: GrowthDecisionType.WAIT_FOR_MORE_DATA, status: GrowthDecisionStatus.WAITING_DATA, reasonCodes: ["IDEA_GENERIC_TOPIC_INSUFFICIENT"] });
    expect(planned.execution).toBeNull();
    expect(await prisma.growthJob.count({ where: { type: GrowthJobType.IDEA_AUTOPILOT_EXECUTE } })).toBe(0);
    expect((await prisma.growthOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe(GrowthOpportunityStatus.DEFERRED);
  });
});
