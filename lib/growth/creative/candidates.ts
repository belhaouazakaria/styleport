import {
  GrowthActivityActorKind,
  GrowthAssetGenerationKind,
  GrowthAssetState,
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
  GrowthCreativeSimilarityClassification,
  GrowthExperimentStatus,
  GrowthJobType,
  GrowthPinCandidateStatus,
  GrowthPinterestConnectionStatus,
  Prisma,
} from "@prisma/client";
import { createHash } from "node:crypto";

import { recordGrowthActivity } from "@/lib/growth/activity";
import type { CreativeAiImageProvider } from "@/lib/growth/creative/ai-image-provider";
import { createCreativeAiImageBudget } from "@/lib/growth/creative/ai-image-provider";
import {
  DEFAULT_CREATIVE_EXAMPLE_INPUT,
  generateCreativeExampleWithFallback,
  type CreativeExampleProvider,
} from "@/lib/growth/creative/example-provider";
import {
  CREATIVE_HEIGHT,
  CREATIVE_LAB_VERSION,
  CREATIVE_SIMILARITY_VERSION,
  CREATIVE_WIDTH,
  MAX_CREATIVE_COMPARISONS,
} from "@/lib/growth/creative/constants";
import {
  creativeCopySchema,
  creativeGenerationJobPayloadSchema,
  creativeGenerationRequestSchema,
  type CreativeGenerationJobPayload,
} from "@/lib/growth/creative/contracts";
import { readExperimentVariant } from "@/lib/growth/creative/experiments";
import { getCreativeRendererDefinition, renderDeterministicCreative } from "@/lib/growth/creative/renderer";
import { buildExactCreativeSimilarity, classifyCreativeSimilarity, type SimilarityCandidate } from "@/lib/growth/creative/similarity";
import {
  cleanupCreativeAssetAfterFailure,
  persistCreativeAssetFile,
  readControlAsset,
  releaseCreativeAssetLease,
  validateCreativePng,
} from "@/lib/growth/creative/storage";
import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
import { ideaBlocksSchema } from "@/lib/growth/ideas/contracts";
import { enqueueGrowthJob } from "@/lib/growth/jobs";
import { GROWTH_SETTINGS_ID } from "@/lib/growth/contracts";
import { prisma } from "@/lib/prisma";
import { ensureTranslatorShareImageById, getStoredShareImageFilePath } from "@/lib/share-images";

interface CreativeTarget {
  kind: GrowthCreativeDestinationKind;
  id: string;
  destinationPath: string;
  clusterId: string | null;
  title: string;
  excerpt: string;
  topic: string;
  sourceLabel: string;
  targetLabel: string;
  sourceFingerprint: string;
  listItems: string[];
  promptSystem: string;
  promptInstructions: string;
  savedExample: { input: string; output: string } | null;
}

interface GenerateCreativeOptions {
  aiProvider?: CreativeAiImageProvider;
  aiEnabled?: boolean;
  exampleProvider?: CreativeExampleProvider;
  beforePersist?: () => Promise<void>;
}

type CreativeReadClient = Pick<Prisma.TransactionClient, "translator" | "growthIdea" | "growthPinterestAccount" | "growthExperiment">;
type CreativeDefinition = { rendererKey: string; rendererVersion: string; templateId: string; headlinePattern: string; ctaPattern: string; visualTreatment: string };

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clamp(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function ideaListItems(blocks: Array<Record<string, unknown>>) {
  for (const block of blocks) {
    if (block.type !== "IDEA_LIST") continue;
    const items = block.items;
    if (!Array.isArray(items)) continue;
    return items.map((item) => typeof item === "object" && item && typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : "").filter(Boolean).slice(0, 5);
  }
  return [];
}

export async function getEligibleCreativeTarget(kind: GrowthCreativeDestinationKind, id: string): Promise<CreativeTarget> {
  return readEligibleCreativeTarget(prisma as unknown as CreativeReadClient, kind, id);
}

async function readEligibleCreativeTarget(db: CreativeReadClient, kind: GrowthCreativeDestinationKind, id: string): Promise<CreativeTarget> {
  if (kind === GrowthCreativeDestinationKind.TRANSLATOR) {
    const translator = await db.translator.findFirst({ where: { id, isActive: true, archivedAt: null }, select: { id: true, slug: true, name: true, title: true, subtitle: true, shortDescription: true, sourceLabel: true, targetLabel: true, promptSystem: true, promptInstructions: true, editorialExamples: { select: { originalText: true, transformedText: true }, orderBy: { sortOrder: "asc" }, take: 1 } } });
    if (!translator) throw new NonRetryableGrowthJobError("Creative Translator target is unavailable.");
    return {
      kind,
      id: translator.id,
      destinationPath: `/translators/${translator.slug}`,
      clusterId: null,
      title: translator.title || translator.name,
      excerpt: translator.shortDescription || translator.subtitle,
      topic: translator.name.replace(/\btranslator\b/gi, "").trim() || translator.name,
      sourceLabel: translator.sourceLabel,
      targetLabel: translator.targetLabel,
      sourceFingerprint: hash({ id: translator.id, slug: translator.slug, title: translator.title, subtitle: translator.subtitle, shortDescription: translator.shortDescription, sourceLabel: translator.sourceLabel, targetLabel: translator.targetLabel, promptSystem: translator.promptSystem, promptInstructions: translator.promptInstructions, editorialExample: translator.editorialExamples[0] || null }),
      listItems: [translator.sourceLabel, translator.targetLabel],
      promptSystem: translator.promptSystem,
      promptInstructions: translator.promptInstructions,
      savedExample: translator.editorialExamples[0] ? { input: translator.editorialExamples[0].originalText, output: translator.editorialExamples[0].transformedText } : null,
    };
  }
  const idea = await db.growthIdea.findFirst({
    where: { id, status: "PUBLISHED", archivedAt: null, currentVersionId: { not: null }, category: { isActive: true, archivedAt: null } },
    include: { category: { select: { name: true } }, currentVersion: { select: { title: true, excerpt: true, checksum: true, blocks: true, publishedAt: true } } },
  });
  if (!idea?.currentVersion?.publishedAt) throw new NonRetryableGrowthJobError("Creative Idea target is unavailable.");
  const parsedBlocks = ideaBlocksSchema.safeParse(idea.currentVersion.blocks);
  if (!parsedBlocks.success) throw new NonRetryableGrowthJobError("Creative Idea target has invalid published content.");
  return {
    kind,
    id: idea.id,
    destinationPath: `/ideas/${idea.slug}`,
    clusterId: idea.clusterId,
    title: idea.currentVersion.title,
    excerpt: idea.currentVersion.excerpt,
    topic: idea.category.name,
    sourceLabel: "Idea",
    targetLabel: idea.category.name,
    sourceFingerprint: hash({ currentVersionId: idea.currentVersionId, checksum: idea.currentVersion.checksum }),
    listItems: ideaListItems(parsedBlocks.data as Array<Record<string, unknown>>),
    promptSystem: "",
    promptInstructions: "",
    savedExample: null,
  };
}

function resolveCreativeExample(target: CreativeTarget, useAi: boolean, provider?: CreativeExampleProvider) {
  return generateCreativeExampleWithFallback({
    savedExample: target.savedExample,
    useAi: useAi && target.kind === GrowthCreativeDestinationKind.TRANSLATOR,
    provider,
    request: {
        translatorName: target.topic,
        title: target.title,
        description: target.excerpt,
        sourceLabel: target.sourceLabel,
        targetLabel: target.targetLabel,
        promptSystem: target.promptSystem,
        promptInstructions: target.promptInstructions,
        input: DEFAULT_CREATIVE_EXAMPLE_INPUT,
    },
  });
}

async function buildCopy(target: CreativeTarget, archetype: GrowthCreativeArchetype, useAiExample: boolean, provider?: CreativeExampleProvider) {
  const translator = target.kind === GrowthCreativeDestinationKind.TRANSLATOR;
  const cta = translator ? "Try it with your own text" : archetype === GrowthCreativeArchetype.EDITORIAL_LIST ? "Explore the full version" : "See all ideas";
  const example = archetype === GrowthCreativeArchetype.BEFORE_AFTER ? await resolveCreativeExample(target, useAiExample, provider) : null;
  const copy = creativeCopySchema.parse({
    title: clamp(`${target.title} | ${cta}`, 100),
    description: clamp(`${target.excerpt} ${cta} on SayTwist.`, 500),
    headline: clamp(target.title, 90),
    subheadline: clamp(target.excerpt, 180),
    cta,
    topic: clamp(target.topic, 160),
    listItems: target.listItems.map((item) => clamp(item, 80)).slice(0, 5),
    ...(example ? { exampleInput: clamp(example.input, 180), exampleOutput: clamp(example.output, 180) } : {}),
  });
  return { copy, exampleSource: example?.source || null, exampleMetadata: example?.metadata || null };
}

function candidateGroupKey(payload: CreativeGenerationJobPayload) {
  return hash({ targetKind: payload.targetKind, targetId: payload.targetId, archetype: payload.archetype, accountId: payload.accountId || null, experimentId: payload.experimentId || null, variantKey: payload.variantKey || null }).slice(0, 48);
}

export async function enqueueCreativeGeneration(input: unknown) {
  const payload = creativeGenerationRequestSchema.parse(input);
  const target = await getEligibleCreativeTarget(payload.targetKind, payload.targetId);
  const key = hash({ payload, sourceFingerprint: target.sourceFingerprint }).slice(0, 48);
  return enqueueGrowthJob({ type: GrowthJobType.CREATIVE_LAB_GENERATE, idempotencyKey: `creative-generate:${key}`, payload, maxAttempts: 3 });
}

async function validateCreativeContext(db: CreativeReadClient, payload: CreativeGenerationJobPayload, target: CreativeTarget, definition: CreativeDefinition) {
  const account = payload.accountId ? await db.growthPinterestAccount.findFirst({ where: { id: payload.accountId, connectionStatus: GrowthPinterestConnectionStatus.CONNECTED }, select: { id: true } }) : null;
  if (payload.accountId && !account) throw new NonRetryableGrowthJobError("Creative account is unavailable.");
  const experiment = payload.experimentId ? await db.growthExperiment.findUnique({ where: { id: payload.experimentId } }) : null;
  if (payload.experimentId && (!experiment || experiment.status !== GrowthExperimentStatus.DRAFT)) throw new NonRetryableGrowthJobError("Creative experiment is unavailable.");
  if (experiment?.clusterId && experiment.clusterId !== target.clusterId) throw new NonRetryableGrowthJobError("Creative experiment cluster is incompatible with the target.");
  if (experiment && payload.variantKey) {
    const variant = readExperimentVariant(experiment, payload.variantKey);
    const actualValue = {
      ARCHETYPE: payload.archetype,
      TEMPLATE: definition.templateId,
      HEADLINE_PATTERN: definition.headlinePattern,
      CTA_PATTERN: definition.ctaPattern,
      VISUAL_TREATMENT: definition.visualTreatment,
    }[experiment.dimension];
    if (variant.value !== actualValue) throw new NonRetryableGrowthJobError("Creative candidate does not match its experiment variant.");
  }
  return { account, experiment };
}

async function lockCreativeAuthorizationRows(tx: Prisma.TransactionClient, payload: CreativeGenerationJobPayload) {
  if (payload.targetKind === GrowthCreativeDestinationKind.TRANSLATOR) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Translator" WHERE "id" = ${payload.targetId} FOR UPDATE`);
  } else {
    const ideas = await tx.$queryRaw<Array<{ id: string; currentVersionId: string | null; categoryId: string }>>(Prisma.sql`
      SELECT "id", "currentVersionId", "categoryId"
      FROM "GrowthIdea"
      WHERE "id" = ${payload.targetId}
      FOR UPDATE
    `);
    const idea = ideas[0];
    if (idea?.currentVersionId) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "GrowthIdeaVersion" WHERE "id" = ${idea.currentVersionId} FOR UPDATE`);
    }
    if (idea?.categoryId) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "GrowthIdeaCategory" WHERE "id" = ${idea.categoryId} FOR UPDATE`);
    }
  }
  if (payload.accountId) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "GrowthPinterestAccount" WHERE "id" = ${payload.accountId} FOR UPDATE`);
  }
  if (payload.experimentId) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "GrowthExperiment" WHERE "id" = ${payload.experimentId} FOR UPDATE`);
  }
}

export async function generateCreativeCandidate(input: unknown, jobId: string | null = null, options: GenerateCreativeOptions = {}) {
  const payload = creativeGenerationJobPayloadSchema.parse(input);
  if (jobId) {
    const existing = await prisma.growthPinCandidate.findUnique({ where: { generationJobId: jobId }, include: { asset: true } });
    if (existing) return { candidate: existing, asset: existing.asset, reused: true };
  }
  if (payload.archetype === GrowthCreativeArchetype.V1_CONTROL && payload.targetKind !== GrowthCreativeDestinationKind.TRANSLATOR) throw new NonRetryableGrowthJobError("Renderer V1 control is available only for Translator destinations.");
  if (payload.archetype === GrowthCreativeArchetype.BEFORE_AFTER && payload.targetKind !== GrowthCreativeDestinationKind.TRANSLATOR) throw new NonRetryableGrowthJobError("Before-and-after creatives require a Translator destination.");
  const definition: CreativeDefinition = payload.archetype === GrowthCreativeArchetype.SCENE_BASED
    ? { rendererKey: "ai-scene", rendererVersion: CREATIVE_LAB_VERSION, templateId: "scene-based-v1", headlinePattern: "scene-topic-promise", ctaPattern: "destination-action", visualTreatment: "generated-scene" }
    : getCreativeRendererDefinition(payload.archetype);
  const target = await getEligibleCreativeTarget(payload.targetKind, payload.targetId);
  await validateCreativeContext(prisma as unknown as CreativeReadClient, payload, target, definition);
  const { copy, exampleSource, exampleMetadata } = await buildCopy(target, payload.archetype, payload.useAiExample === true, options.exampleProvider);
  const contentHash = hash({ target: target.sourceFingerprint, copy, definition, archetype: payload.archetype });
  const similarityInput = { title: copy.title, contentHash, destinationPath: target.destinationPath, topic: copy.topic, accountId: payload.accountId || null, archetype: payload.archetype, templateId: definition.templateId };
  const [preexistingExactContent, history] = await Promise.all([
    prisma.growthPinCandidate.findFirst({ where: { contentHash }, orderBy: { createdAt: "desc" }, include: { asset: true } }),
    prisma.growthPinCandidate.findMany({ select: { id: true, title: true, contentHash: true, destinationPath: true, topic: true, accountId: true, archetype: true, templateId: true }, orderBy: { createdAt: "desc" }, take: MAX_CREATIVE_COMPARISONS }),
  ]);
  const fuzzySimilarity = classifyCreativeSimilarity(similarityInput, history as SimilarityCandidate[]);

  let bytes: Buffer | null = null;
  let generationKind: GrowthAssetGenerationKind = GrowthAssetGenerationKind.DETERMINISTIC;
  let aiMetadata: { provider: string; model: string; responseId: string | null; imageUnits: number; estimatedCost: number | null } | null = null;
  if (!preexistingExactContent && payload.archetype === GrowthCreativeArchetype.V1_CONTROL) {
    const control = await ensureTranslatorShareImageById(target.id, { throwOnError: true });
    const controlPath = getStoredShareImageFilePath(control?.shareImagePath || null);
    if (!controlPath) throw new NonRetryableGrowthJobError("Renderer V1 control asset is unavailable.");
    bytes = await readControlAsset(controlPath);
    generationKind = GrowthAssetGenerationKind.REUSED;
  } else if (!preexistingExactContent && payload.archetype === GrowthCreativeArchetype.SCENE_BASED) {
    const enabled = options.aiEnabled ?? process.env.GROWTH_AI_IMAGE_ENABLED === "true";
    if (!enabled || !options.aiProvider) throw new NonRetryableGrowthJobError("Creative AI image generation is disabled.");
    const budget = createCreativeAiImageBudget(1);
    budget.consume();
    const generated = await options.aiProvider.generate({ headline: copy.headline, topic: copy.topic, visualTreatment: definition.visualTreatment });
    bytes = generated.bytes;
    validateCreativePng(bytes);
    if (generated.width !== CREATIVE_WIDTH || generated.height !== CREATIVE_HEIGHT || generated.mimeType !== "image/png") throw new NonRetryableGrowthJobError("Creative AI provider returned an invalid image.");
    generationKind = GrowthAssetGenerationKind.AI;
    const provider = clamp(generated.metadata.provider, 80);
    const model = clamp(generated.metadata.model, 120);
    const estimatedCost = generated.metadata.estimatedCost ?? null;
    if (!provider || !model || (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0))) throw new NonRetryableGrowthJobError("Creative AI provider returned invalid metadata.");
    aiMetadata = { provider, model, responseId: generated.metadata.responseId ? clamp(generated.metadata.responseId, 191) : null, imageUnits: 1, estimatedCost };
  } else if (!preexistingExactContent) {
    bytes = await renderDeterministicCreative(payload.archetype, copy);
  }

  const stored = bytes ? await persistCreativeAssetFile(bytes) : null;
  const visualChecksum = preexistingExactContent?.asset.checksum || stored?.checksum;
  if (!visualChecksum) throw new NonRetryableGrowthJobError("Creative visual fingerprint is unavailable.");
  try {
    if (options.beforePersist) await options.beforePersist();
    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.$queryRaw<Array<{ enabled: boolean }>>(Prisma.sql`SELECT "enabled" FROM "GrowthSettings" WHERE "id" = ${GROWTH_SETTINGS_ID} FOR UPDATE`);
      if (!settings[0]?.enabled) throw new NonRetryableGrowthJobError("Growth is disabled before Creative Lab persistence.");
      await lockCreativeAuthorizationRows(tx, payload);
      const currentTarget = await readEligibleCreativeTarget(tx, payload.targetKind, payload.targetId);
      if (currentTarget.sourceFingerprint !== target.sourceFingerprint) throw new NonRetryableGrowthJobError("Creative target changed during rendering.");
      await validateCreativeContext(tx, payload, currentTarget, definition);
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${candidateGroupKey(payload)}))`);
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`creative-asset:${visualChecksum}`}))`);
      const groupKey = candidateGroupKey(payload);
      const [sameRetry, anyExactContent, exactAsset] = await Promise.all([
        tx.growthPinCandidate.findFirst({ where: { contentHash, candidateKey: groupKey, accountId: payload.accountId || null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { asset: true } }),
        tx.growthPinCandidate.findFirst({ where: { contentHash }, orderBy: { createdAt: "desc" }, include: { asset: true } }),
        tx.growthAsset.findFirst({ where: { checksum: visualChecksum }, orderBy: { createdAt: "desc" }, include: { candidates: { orderBy: { createdAt: "desc" }, take: 1 } } }),
      ]);
      const exactContent = sameRetry || anyExactContent;
      const exactCandidate = exactContent || exactAsset?.candidates[0] || null;
      const exactSimilarity = exactCandidate ? buildExactCreativeSimilarity(similarityInput, exactCandidate, {
        contentHash: Boolean(exactContent),
        assetChecksum: Boolean(exactAsset || exactContent?.asset.checksum === visualChecksum),
      }) : null;
      if (sameRetry) {
        return { candidate: sameRetry, asset: sameRetry.asset, reused: true };
      }
      const similarity = exactSimilarity || fuzzySimilarity;
      const revision = (await tx.growthPinCandidate.aggregate({ where: { candidateKey: groupKey }, _max: { revision: true } }))._max.revision || 0;
      let asset = exactContent?.asset || exactAsset;
      if (!asset) {
        if (!stored) throw new NonRetryableGrowthJobError("Creative asset disappeared before persistence.");
        asset = await tx.growthAsset.upsert({
          where: { publicPath: stored.publicPath },
          create: {
            publicPath: stored.publicPath, checksum: stored.checksum, mimeType: "image/png", width: CREATIVE_WIDTH, height: CREATIVE_HEIGHT, byteSize: stored.byteSize,
            rendererKey: definition.rendererKey, rendererVersion: definition.rendererVersion, templateId: definition.templateId, generationKind, state: GrowthAssetState.READY,
            aiProvider: aiMetadata?.provider, aiModel: aiMetadata?.model, aiResponseId: aiMetadata?.responseId, aiImageUnits: aiMetadata?.imageUnits, estimatedCost: aiMetadata?.estimatedCost,
          },
          update: {},
        });
      }
      const deferred = similarity.classification === GrowthCreativeSimilarityClassification.EXACT_DUPLICATE || similarity.classification === GrowthCreativeSimilarityClassification.NEAR_DUPLICATE;
      const candidate = await tx.growthPinCandidate.create({ data: {
        candidateKey: groupKey, revision: revision + 1, accountId: payload.accountId, clusterId: currentTarget.clusterId, experimentId: payload.experimentId, experimentVariantKey: payload.variantKey, generationJobId: jobId,
        destinationKind: payload.targetKind, translatorId: payload.targetKind === GrowthCreativeDestinationKind.TRANSLATOR ? currentTarget.id : null, ideaId: payload.targetKind === GrowthCreativeDestinationKind.IDEA ? currentTarget.id : null,
        title: copy.title, description: copy.description, destinationPath: currentTarget.destinationPath, pinRef: null, assetId: asset.id,
        rendererKey: definition.rendererKey, rendererVersion: definition.rendererVersion, templateId: definition.templateId, archetype: payload.archetype,
        headlinePattern: definition.headlinePattern, ctaPattern: definition.ctaPattern, visualTreatment: definition.visualTreatment, topic: copy.topic, contentHash,
        similarityModelVersion: CREATIVE_SIMILARITY_VERSION, similarityResult: similarity.classification, similarityFlags: similarity.flags as Prisma.InputJsonValue,
        status: deferred ? GrowthPinCandidateStatus.DEFERRED : GrowthPinCandidateStatus.READY,
      } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthPinCandidate", entityId: candidate.id, action: "CREATIVE_CANDIDATE_GENERATED", toState: candidate.status, summary: { archetype: candidate.archetype, similarity: candidate.similarityResult, targetKind: candidate.destinationKind, exampleSource, exampleProvider: exampleMetadata?.provider || null, exampleModel: exampleMetadata?.model || null, examplePromptTokens: exampleMetadata?.promptTokens ?? null, exampleCompletionTokens: exampleMetadata?.completionTokens ?? null, exampleTotalTokens: exampleMetadata?.totalTokens ?? null }, correlationKey: candidate.candidateKey }, tx);
      return { candidate, asset, reused: false };
    });
    if (stored?.created && result.asset.publicPath !== stored.publicPath) {
      await cleanupCreativeAssetAfterFailure(stored, () => prisma.growthAsset.count({ where: { publicPath: stored.publicPath } }));
    }
    return result;
  } catch (error) {
    if (stored) await cleanupCreativeAssetAfterFailure(stored, () => prisma.growthAsset.count({ where: { publicPath: stored.publicPath } }));
    throw error;
  } finally {
    if (stored) await releaseCreativeAssetLease(stored.leasePath);
  }
}

export async function getAdminCreativeOverview() {
  const [candidates, translators, ideaRows, accounts, experiments] = await Promise.all([
    prisma.growthPinCandidate.findMany({ include: { asset: true, translator: { select: { name: true, slug: true } }, idea: { select: { slug: true, currentVersion: { select: { title: true } } } }, experiment: { select: { hypothesis: true, dimension: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.translator.findMany({ where: { isActive: true, archivedAt: null }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" }, take: 100 }),
    prisma.growthIdea.findMany({ where: { status: "PUBLISHED", archivedAt: null, currentVersionId: { not: null }, category: { isActive: true, archivedAt: null } }, select: { id: true, slug: true, currentVersion: { select: { title: true, blocks: true, publishedAt: true } } }, orderBy: { publishedAt: "desc" }, take: 100 }),
    prisma.growthPinterestAccount.findMany({ where: { connectionStatus: GrowthPinterestConnectionStatus.CONNECTED }, select: { id: true, username: true, publicationRole: true }, orderBy: { username: "asc" }, take: 20 }),
    prisma.growthExperiment.findMany({ where: { status: GrowthExperimentStatus.DRAFT }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  const ideas = ideaRows.filter((idea) => idea.currentVersion?.publishedAt && ideaBlocksSchema.safeParse(idea.currentVersion.blocks).success);
  return { candidates, translators, ideas, accounts, experiments };
}
