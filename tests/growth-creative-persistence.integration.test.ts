import {
  GrowthAssetGenerationKind,
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
  GrowthExperimentDimension,
  GrowthIdeaStatus,
  GrowthIdeaVersionAction,
  GrowthPinCandidateStatus,
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { APP_NAME } from "@/lib/constants";
import type { CreativeAiImageProvider } from "@/lib/growth/creative/ai-image-provider";
import { CREATIVE_EXPERIMENT_VERSION, CREATIVE_LAB_VERSION } from "@/lib/growth/creative/constants";
import { generateCreativeCandidate } from "@/lib/growth/creative/candidates";
import { createDraftCreativeExperiment } from "@/lib/growth/creative/experiments";
import { renderDeterministicCreative } from "@/lib/growth/creative/renderer";
import { resolveCreativeAssetFile } from "@/lib/growth/creative/storage";
import { prisma } from "@/lib/prisma";

const enabled = process.env.RUN_GROWTH_CREATIVE_DB_TESTS === "1";
const suite = enabled ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase10_creative_test";

if (enabled) {
  const url = process.env.GROWTH_CREATIVE_TEST_DATABASE_URL;
  if (!url || url !== process.env.DATABASE_URL) throw new Error("Phase 10 DB tests require matching explicit URLs.");
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName) throw new Error(`Phase 10 DB tests refuse every target except local database ${requiredDatabaseName}.`);
}

const staticCopy = { title: "Creative test", description: "A bounded deterministic creative used only by the Phase 10 test suite.", headline: "Creative Lab test", subheadline: "A reproducible local image with no provider or Pinterest call.", cta: "See more", topic: "Testing", listItems: ["One", "Two", "Three"] };
const payload = (targetId: string, archetype = GrowthCreativeArchetype.TYPOGRAPHY_LED, extra: Record<string, unknown> = {}) => ({ targetKind: GrowthCreativeDestinationKind.TRANSLATOR, targetId, archetype, creativeModelVersion: CREATIVE_LAB_VERSION, ...extra });

async function removeKnownAssetFiles() {
  const assets = await prisma.growthAsset.findMany({ select: { publicPath: true } }).catch(() => []);
  for (const asset of assets) {
    const filePath = resolveCreativeAssetFile(path.basename(asset.publicPath));
    if (filePath) await rm(filePath, { force: true });
  }
  const shareRoot = path.join(process.cwd(), "storage", "generated", "pins");
  const shareFiles = await readdir(shareRoot).catch(() => []);
  await Promise.all(shareFiles.filter((item) => /^creative-translator-[a-z0-9]+-control\.png$/.test(item)).map((item) => rm(path.join(shareRoot, item), { force: true })));
}

async function clean() {
  await removeKnownAssetFiles();
  await prisma.growthPinCandidate.deleteMany();
  await prisma.growthAsset.deleteMany();
  await prisma.growthExperiment.deleteMany();
  await prisma.growthIdea.updateMany({ data: { currentVersionId: null, status: GrowthIdeaStatus.DRAFT, publishedAt: null, archivedAt: null } });
  await prisma.growthIdeaTranslatorReference.deleteMany();
  await prisma.growthIdeaVersion.deleteMany();
  await prisma.growthIdea.deleteMany();
  await prisma.growthJob.deleteMany();
  await prisma.growthActivity.deleteMany();
  await prisma.growthPinterestBoard.deleteMany();
  await prisma.growthPinterestAccount.deleteMany();
  await prisma.translator.deleteMany();
  await prisma.growthSettings.deleteMany();
  await prisma.growthIdeaCategory.updateMany({ data: { isActive: true, archivedAt: null } });
}

async function seedTranslator(active = true, withControl = false, label = "Warm") {
  const slug = `creative-translator-${Math.random().toString(36).slice(2, 10)}`;
  const values = { name: `${label} Translator`, slug, title: `${label} Message Translator`, subtitle: `Make your message ${label.toLowerCase()}`, shortDescription: `Rewrite a message with a ${label.toLowerCase()} tone while preserving its meaning.`, sourceLabel: "Original text", targetLabel: `${label} rewrite` };
  let shareImagePath: string | null = null;
  let shareImageHash: string | null = null;
  if (withControl) {
    const bytes = await renderDeterministicCreative(GrowthCreativeArchetype.TYPOGRAPHY_LED, staticCopy);
    shareImagePath = `/generated/pins/${slug}-control.png`;
    const filePath = path.join(process.cwd(), "storage", "generated", "pins", `${slug}-control.png`);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    shareImageHash = createHash("sha256").update(JSON.stringify({ platformName: APP_NAME, slug, name: values.name, subtitle: values.subtitle, shortDescription: values.shortDescription, sourceLabel: values.sourceLabel, targetLabel: values.targetLabel })).digest("hex").slice(0, 16);
  }
  return prisma.translator.create({ data: { ...values, promptSystem: "Rewrite safely.", promptInstructions: "Preserve meaning.", isActive: active, shareImagePath, shareImageHash, shareImageUpdatedAt: shareImagePath ? new Date() : null } });
}

async function seedIdea(status: GrowthIdeaStatus = GrowthIdeaStatus.PUBLISHED) {
  const category = await prisma.growthIdeaCategory.findFirstOrThrow({ where: { isActive: true, archivedAt: null } });
  const suffix = Math.random().toString(36).slice(2, 10);
  const idea = await prisma.growthIdea.create({ data: { slug: `birthday-messages-${suffix}`, categoryId: category.id, status: GrowthIdeaStatus.DRAFT, seoTitle: "Birthday messages", seoDescription: "Useful birthday message ideas for friends and family." } });
  const version = await prisma.growthIdeaVersion.create({ data: { ideaId: idea.id, categoryId: category.id, version: 1, action: GrowthIdeaVersionAction.CREATE, title: "15 Birthday Messages for Friends", excerpt: "Warm and funny birthday messages with context for choosing the right one.", seoTitle: "Birthday Messages for Friends", seoDescription: "Find useful birthday messages for friends with warm and funny options.", blocks: [{ type: "INTRO", text: "Choose a message that fits your friendship." }, { type: "HEADING", level: 2, text: "Birthday messages" }, { type: "IDEA_LIST", items: [{ text: "Hope your day feels as wonderful as you make everyone else feel." }, { text: "Another year wiser and still the funniest person I know." }, { text: "Celebrating you today and always." }] }], checksum: "a".repeat(64), qualityResult: {}, decisionModelVersion: "idea_autopilot_v2", generationModelVersion: "idea_generation_v1", qualityModelVersion: "idea_quality_v1", dedupeModelVersion: "idea_dedupe_v1", snapshotModelVersion: "idea_snapshot_v1", authorKind: "SYSTEM", mutationKey: `creative-idea-${suffix}`, publishedAt: status === GrowthIdeaStatus.PUBLISHED ? new Date() : null } });
  return prisma.growthIdea.update({ where: { id: idea.id }, data: { currentVersionId: version.id, status, publishedAt: status === GrowthIdeaStatus.PUBLISHED ? new Date() : null, archivedAt: status === GrowthIdeaStatus.ARCHIVED ? new Date() : null } });
}

async function seedAccount(username: string) {
  const role = username === "first" ? GrowthPinterestPublicationRole.SAYTWIST : GrowthPinterestPublicationRole.SAYTWIST_IDEAS;
  return prisma.growthPinterestAccount.create({ data: { pinterestAccountId: `p-${username}`, publicationRole: role, activeRole: role, username, apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION, connectionStatus: GrowthPinterestConnectionStatus.CONNECTED, grantedScopes: ["pins:read"], encryptedCredentials: "test-envelope", accessTokenExpiresAt: new Date("2028-01-01"), refreshTokenExpiresAt: new Date("2029-01-01") } });
}

beforeEach(async () => { await clean(); await prisma.growthSettings.create({ data: { id: "global", enabled: true, attributionEnabled: false } }); });
afterAll(async () => { if (enabled) await clean(); await prisma.$disconnect(); });

suite("Growth Phase 10 PostgreSQL A-R scenarios", () => {
  it("A: migration creates schema enums and destination constraints", async () => {
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT conname AS name FROM pg_constraint WHERE conname IN ('GrowthPinCandidate_destination_check', 'GrowthAsset_dimensions_check') ORDER BY conname`;
    expect(rows.map((row) => row.name)).toEqual(["GrowthAsset_dimensions_check", "GrowthPinCandidate_destination_check"]);
  });

  it("B-C: materializes Translator Renderer V1 as an immutable checksummed Growth asset", async () => {
    const translator = await seedTranslator(true, true);
    const result = await generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.V1_CONTROL));
    expect(result.candidate).toMatchObject({ status: GrowthPinCandidateStatus.READY, rendererKey: "v1-control", revision: 1 });
    expect(result.asset).toMatchObject({ generationKind: GrowthAssetGenerationKind.REUSED, width: 1000, height: 1500, mimeType: "image/png" });
    expect(result.asset.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(resolveCreativeAssetFile(path.basename(result.asset.publicPath))!)).toHaveLength(result.asset.byteSize);
  });

  it("D-E: exact retry is idempotent and does not duplicate candidate or asset", async () => {
    const translator = await seedTranslator();
    const first = await generateCreativeCandidate(payload(translator.id));
    const second = await generateCreativeCandidate(payload(translator.id));
    expect(second.reused).toBe(true); expect(second.candidate.id).toBe(first.candidate.id);
    expect(await prisma.growthPinCandidate.count()).toBe(1); expect(await prisma.growthAsset.count()).toBe(1);
  });

  it("F: near duplicate becomes DEFERRED", async () => {
    const translator = await seedTranslator();
    await generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.TYPOGRAPHY_LED));
    const near = await generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.EDITORIAL_LIST));
    expect(near.candidate).toMatchObject({ status: GrowthPinCandidateStatus.DEFERRED, similarityResult: "NEAR_DUPLICATE" });
  });

  it("G: deterministic non-control candidate becomes READY", async () => {
    const translator = await seedTranslator();
    const result = await generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.CONVERSATION_CHAT));
    expect(result.candidate).toMatchObject({ status: GrowthPinCandidateStatus.READY, archetype: GrowthCreativeArchetype.CONVERSATION_CHAT, rendererKey: "creative-static" });
  });

  it("H: published Idea candidate is supported", async () => {
    const idea = await seedIdea();
    const result = await generateCreativeCandidate({ targetKind: GrowthCreativeDestinationKind.IDEA, targetId: idea.id, archetype: GrowthCreativeArchetype.EDITORIAL_LIST, creativeModelVersion: CREATIVE_LAB_VERSION });
    expect(result.candidate).toMatchObject({ destinationKind: GrowthCreativeDestinationKind.IDEA, ideaId: idea.id, status: GrowthPinCandidateStatus.READY, pinRef: null });
  });

  it("I-J: inactive Translator and unpublished or archived Idea are rejected", async () => {
    const inactive = await seedTranslator(false);
    await expect(generateCreativeCandidate(payload(inactive.id))).rejects.toThrow("unavailable");
    const draft = await seedIdea(GrowthIdeaStatus.DRAFT);
    await expect(generateCreativeCandidate({ targetKind: "IDEA", targetId: draft.id, archetype: "TYPOGRAPHY_LED", creativeModelVersion: CREATIVE_LAB_VERSION })).rejects.toThrow("unavailable");
  });

  it("K: database rejects invalid destination ownership", async () => {
    const translator = await seedTranslator(); const idea = await seedIdea();
    const valid = await generateCreativeCandidate(payload(translator.id));
    await expect(prisma.growthPinCandidate.create({ data: { ...valid.candidate, id: undefined, candidateKey: "invalid-destination", revision: 1, generationJobId: null, translatorId: translator.id, ideaId: idea.id, assetId: valid.asset.id, similarityFlags: {} } })).rejects.toThrow();
  });

  it("L: DRAFT experiment and variant associate with a candidate", async () => {
    const translator = await seedTranslator();
    const experiment = await createDraftCreativeExperiment({ hypothesis: "Typography increases outbound clicks.", dimension: GrowthExperimentDimension.ARCHETYPE, variants: [{ key: "a", label: "Typography", value: "TYPOGRAPHY_LED" }, { key: "b", label: "Minimal", value: "MINIMAL_STATEMENT" }], primaryKpi: "OUTBOUND_CLICKS", guardrails: { minimumImpressions: 1000, minimumOutboundClicks: 20, maximumDays: 30 }, attributionModelVersion: "pinterest_organic_v1", scoringModelVersion: "opportunity_scoring_v1", experimentModelVersion: CREATIVE_EXPERIMENT_VERSION });
    await expect(generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.TYPOGRAPHY_LED, { experimentId: experiment.id, variantKey: "b" }))).rejects.toThrow("does not match");
    const result = await generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.TYPOGRAPHY_LED, { experimentId: experiment.id, variantKey: "a" }));
    expect(result.candidate).toMatchObject({ experimentId: experiment.id, experimentVariantKey: "a" });
    expect(experiment).toMatchObject({ status: "DRAFT", startedAt: null, result: null });
  });

  it("M: AI generation is disabled by default", async () => {
    const translator = await seedTranslator();
    await expect(generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.SCENE_BASED))).rejects.toThrow("disabled");
  });

  it("N-O: fake AI uses exactly one image unit and unknown price remains NULL", async () => {
    const translator = await seedTranslator();
    const bytes = await renderDeterministicCreative(GrowthCreativeArchetype.MINIMAL_STATEMENT, staticCopy);
    let calls = 0;
    const provider: CreativeAiImageProvider = { generate: async () => { calls += 1; return { bytes, mimeType: "image/png", width: 1000, height: 1500, metadata: { provider: "FAKE", model: "fake-image-v1", responseId: "fake-response", imageUnits: 1, estimatedCost: null } }; } };
    const result = await generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.SCENE_BASED), null, { aiEnabled: true, aiProvider: provider });
    expect(calls).toBe(1); expect(result.asset).toMatchObject({ generationKind: "AI", aiImageUnits: 1, estimatedCost: null, aiProvider: "FAKE" });
  });

  it("P: Growth kill switch prevents persistence", async () => {
    const translator = await seedTranslator(); await prisma.growthSettings.update({ where: { id: "global" }, data: { enabled: false } });
    await expect(generateCreativeCandidate(payload(translator.id))).rejects.toThrow("Growth is disabled");
    expect(await prisma.growthPinCandidate.count()).toBe(0);
  });

  it("Q: late target invalidation fails closed", async () => {
    const translator = await seedTranslator();
    await expect(generateCreativeCandidate(payload(translator.id), null, { beforePersist: async () => { await prisma.translator.update({ where: { id: translator.id }, data: { isActive: false } }); } })).rejects.toThrow("unavailable");
    expect(await prisma.growthPinCandidate.count()).toBe(0);
  });

  it("R: failed persistence removes its orphan without deleting referenced assets", async () => {
    const firstTranslator = await seedTranslator();
    const referenced = await generateCreativeCandidate(payload(firstTranslator.id));
    const referencedPath = resolveCreativeAssetFile(path.basename(referenced.asset.publicPath))!;
    const secondTranslator = await seedTranslator(true, false, "Cool");
    const before = new Set((await readdir(path.dirname(referencedPath))).filter((item) => item.startsWith("creative-")));
    await expect(generateCreativeCandidate(payload(secondTranslator.id, GrowthCreativeArchetype.MINIMAL_STATEMENT), null, { beforePersist: async () => { await prisma.growthSettings.delete({ where: { id: "global" } }); } })).rejects.toThrow("Growth is disabled");
    const after = new Set((await readdir(path.dirname(referencedPath))).filter((item) => item.startsWith("creative-")));
    expect(after).toEqual(before); expect(await readFile(referencedPath)).toHaveLength(referenced.asset.byteSize);
  });

  it("flags the same concept across accounts without another READY duplicate", async () => {
    const translator = await seedTranslator(); const firstAccount = await seedAccount("first"); const secondAccount = await seedAccount("second");
    const first = await generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.TYPOGRAPHY_LED, { accountId: firstAccount.id }));
    const duplicate = await generateCreativeCandidate(payload(translator.id, GrowthCreativeArchetype.TYPOGRAPHY_LED, { accountId: secondAccount.id }));
    expect(first.candidate.status).toBe(GrowthPinCandidateStatus.READY);
    expect(duplicate.candidate).toMatchObject({ status: GrowthPinCandidateStatus.DEFERRED, similarityResult: "EXACT_DUPLICATE", similarityFlags: { crossAccount: true } });
    expect(duplicate.asset.id).toBe(first.asset.id);
  });
});
