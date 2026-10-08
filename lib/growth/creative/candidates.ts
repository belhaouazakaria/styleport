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
  CREATIVE_HEIGHT,
  CREATIVE_LAB_VERSION,
  CREATIVE_SIMILARITY_VERSION,
  CREATIVE_WIDTH,
  MAX_CREATIVE_COMPARISONS,
} from "@/lib/growth/creative/constants";
import {
  creativeCopySchema,
  creativeGenerationJobPayloadSchema,
  type CreativeCopy,
  type CreativeGenerationJobPayload,
} from "@/lib/growth/creative/contracts";
import { readExperimentVariant } from "@/lib/growth/creative/experiments";
import { getCreativeRendererDefinition, renderDeterministicCreative } from "@/lib/growth/creative/renderer";
import { classifyCreativeSimilarity } from "@/lib/growth/creative/similarity";
import {
  persistCreativeAssetFile,
  readControlAsset,
  removeUnreferencedCreativeAssetFile,
  validateCreativePng,
} from "@/lib/growth/creative/storage";
import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
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
}

interface GenerateCreativeOptions {
  aiProvider?: CreativeAiImageProvider;
  aiEnabled?: boolean;
  beforePersist?: () => Promise<void>;
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clamp(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function ideaListItems(blocks: unknown) {
  if (!Array.isArray(blocks)) return [];
  for (const block of blocks) {
    if (!block || typeof block !== "object" || (block as { type?: unknown }).type !== "IDEA_LIST") continue;
    const items = (block as { items?: unknown }).items;
    if (!Array.isArray(items)) continue;
    return items.map((item) => typeof item === "object" && item && typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : "").filter(Boolean).slice(0, 5);
  }
  return [];
}

export async function getEligibleCreativeTarget(kind: GrowthCreativeDestinationKind, id: string): Promise<CreativeTarget> {
  if (kind === GrowthCreativeDestinationKind.TRANSLATOR) {
    const translator = await prisma.translator.findFirst({ where: { id, isActive: true, archivedAt: null }, select: { id: true, slug: true, name: true, title: true, subtitle: true, shortDescription: true, sourceLabel: true, targetLabel: true } });
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
      sourceFingerprint: hash({ id: translator.id, slug: translator.slug, title: translator.title, subtitle: translator.subtitle, shortDescription: translator.shortDescription, sourceLabel: translator.sourceLabel, targetLabel: translator.targetLabel }),
      listItems: [translator.sourceLabel, translator.targetLabel],
    };
  }
  const idea = await prisma.growthIdea.findFirst({
    where: { id, status: "PUBLISHED", archivedAt: null, currentVersionId: { not: null }, category: { isActive: true, archivedAt: null } },
    include: { category: { select: { name: true } }, currentVersion: { select: { title: true, excerpt: true, checksum: true, blocks: true, publishedAt: true } } },
  });
  if (!idea?.currentVersion?.publishedAt) throw new NonRetryableGrowthJobError("Creative Idea target is unavailable.");
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
    sourceFingerprint: idea.currentVersion.checksum,
    listItems: ideaListItems(idea.currentVersion.blocks),
  };
}

function buildCopy(target: CreativeTarget, archetype: GrowthCreativeArchetype): CreativeCopy {
  const translator = target.kind === GrowthCreativeDestinationKind.TRANSLATOR;
  const cta = translator ? "Try it with your own text" : archetype === GrowthCreativeArchetype.EDITORIAL_LIST ? "Explore the full version" : "See all ideas";
  const headline = archetype === GrowthCreativeArchetype.MINIMAL_STATEMENT
    ? target.title
    : archetype === GrowthCreativeArchetype.CONVERSATION_CHAT
      ? `How would you say it in ${target.topic}?`
      : target.title;
  return creativeCopySchema.parse({
    title: clamp(`${target.title} | ${cta}`, 100),
    description: clamp(`${target.excerpt} ${cta} on SayTwist.`, 500),
    headline: clamp(headline, 90),
    subheadline: clamp(target.excerpt, 180),
    cta,
    topic: clamp(target.topic, 160),
    listItems: target.listItems.map((item) => clamp(item, 80)).slice(0, 5),
  });
}

function candidateGroupKey(payload: CreativeGenerationJobPayload) {
  return hash({ targetKind: payload.targetKind, targetId: payload.targetId, archetype: payload.archetype, accountId: payload.accountId || null, experimentId: payload.experimentId || null, variantKey: payload.variantKey || null }).slice(0, 48);
}

export async function enqueueCreativeGeneration(input: unknown) {
  const payload = creativeGenerationJobPayloadSchema.parse(input);
  if (payload.archetype === GrowthCreativeArchetype.SCENE_BASED) throw new NonRetryableGrowthJobError("Creative AI image generation is not enabled for ADMIN jobs.");
  const target = await getEligibleCreativeTarget(payload.targetKind, payload.targetId);
  const key = hash({ payload, sourceFingerprint: target.sourceFingerprint }).slice(0, 48);
  return enqueueGrowthJob({ type: GrowthJobType.CREATIVE_LAB_GENERATE, idempotencyKey: `creative-generate:${key}`, payload, maxAttempts: 3 });
}

async function validateOptionalContext(payload: CreativeGenerationJobPayload) {
  const account = payload.accountId ? await prisma.growthPinterestAccount.findFirst({ where: { id: payload.accountId, connectionStatus: GrowthPinterestConnectionStatus.CONNECTED }, select: { id: true } }) : null;
  if (payload.accountId && !account) throw new NonRetryableGrowthJobError("Creative account is unavailable.");
  const experiment = payload.experimentId ? await prisma.growthExperiment.findUnique({ where: { id: payload.experimentId } }) : null;
  if (payload.experimentId && (!experiment || experiment.status !== GrowthExperimentStatus.DRAFT)) throw new NonRetryableGrowthJobError("Creative experiment is unavailable.");
  if (experiment && payload.variantKey) readExperimentVariant(experiment, payload.variantKey);
  return { account, experiment };
}

async function assertTargetUnchanged(target: CreativeTarget) {
  const current = await getEligibleCreativeTarget(target.kind, target.id);
  if (current.sourceFingerprint !== target.sourceFingerprint) throw new NonRetryableGrowthJobError("Creative target changed during rendering.");
}

export async function generateCreativeCandidate(input: unknown, jobId: string | null = null, options: GenerateCreativeOptions = {}) {
  const payload = creativeGenerationJobPayloadSchema.parse(input);
  const [target, context] = await Promise.all([getEligibleCreativeTarget(payload.targetKind, payload.targetId), validateOptionalContext(payload)]);
  if (payload.archetype === GrowthCreativeArchetype.V1_CONTROL && payload.targetKind !== GrowthCreativeDestinationKind.TRANSLATOR) throw new NonRetryableGrowthJobError("Renderer V1 control is available only for Translator destinations.");
  const definition = payload.archetype === GrowthCreativeArchetype.SCENE_BASED
    ? { rendererKey: "ai-scene", rendererVersion: CREATIVE_LAB_VERSION, templateId: "scene-based-v1", headlinePattern: "scene-topic-promise", ctaPattern: "destination-action", visualTreatment: "generated-scene" }
    : getCreativeRendererDefinition(payload.archetype);
  if (context.experiment && payload.variantKey) {
    const variant = readExperimentVariant(context.experiment, payload.variantKey);
    const actualValue = {
      ARCHETYPE: payload.archetype,
      TEMPLATE: definition.templateId,
      HEADLINE_PATTERN: definition.headlinePattern,
      CTA_PATTERN: definition.ctaPattern,
      VISUAL_TREATMENT: definition.visualTreatment,
    }[context.experiment.dimension];
    if (variant.value !== actualValue) throw new NonRetryableGrowthJobError("Creative candidate does not match its experiment variant.");
  }
  const copy = buildCopy(target, payload.archetype);
  const contentHash = hash({ target: target.sourceFingerprint, copy, definition, archetype: payload.archetype });
  const history = await prisma.growthPinCandidate.findMany({
    select: { id: true, title: true, contentHash: true, destinationPath: true, accountId: true, archetype: true, templateId: true, assetId: true },
    orderBy: { createdAt: "desc" },
    take: MAX_CREATIVE_COMPARISONS,
  });
  const similarity = classifyCreativeSimilarity({ title: copy.title, contentHash, destinationPath: target.destinationPath, accountId: payload.accountId || null, archetype: payload.archetype, templateId: definition.templateId }, history);
  const exact = similarity.classification === GrowthCreativeSimilarityClassification.EXACT_DUPLICATE ? history.find((item) => item.id === similarity.matchedCandidateId) : null;
  if (exact && exact.accountId === (payload.accountId || null)) {
    const existing = await prisma.growthPinCandidate.findUniqueOrThrow({ where: { id: exact.id }, include: { asset: true } });
    return { candidate: existing, asset: existing.asset, reused: true };
  }

  let bytes: Buffer | null = null;
  let generationKind: GrowthAssetGenerationKind = GrowthAssetGenerationKind.DETERMINISTIC;
  let aiMetadata: { provider: string; model: string; responseId: string | null; imageUnits: number; estimatedCost: number | null } | null = null;
  const reusedAssetId: string | null = exact?.assetId || null;
  if (!reusedAssetId && payload.archetype === GrowthCreativeArchetype.V1_CONTROL) {
    const control = await ensureTranslatorShareImageById(target.id, { throwOnError: true });
    const controlPath = getStoredShareImageFilePath(control?.shareImagePath || null);
    if (!controlPath) throw new NonRetryableGrowthJobError("Renderer V1 control asset is unavailable.");
    bytes = await readControlAsset(controlPath);
    generationKind = GrowthAssetGenerationKind.REUSED;
  } else if (!reusedAssetId && payload.archetype === GrowthCreativeArchetype.SCENE_BASED) {
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
  } else if (!reusedAssetId) {
    bytes = await renderDeterministicCreative(payload.archetype, copy);
  }

  const stored = bytes ? await persistCreativeAssetFile(bytes) : null;
  try {
    if (options.beforePersist) await options.beforePersist();
    await assertTargetUnchanged(target);
    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.$queryRaw<Array<{ enabled: boolean }>>(Prisma.sql`SELECT "enabled" FROM "GrowthSettings" WHERE "id" = ${GROWTH_SETTINGS_ID} FOR UPDATE`);
      if (!settings[0]?.enabled) throw new NonRetryableGrowthJobError("Growth is disabled before Creative Lab persistence.");
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${candidateGroupKey(payload)}))`);
      const revision = (await tx.growthPinCandidate.aggregate({ where: { candidateKey: candidateGroupKey(payload) }, _max: { revision: true } }))._max.revision || 0;
      let asset;
      if (reusedAssetId) {
        asset = await tx.growthAsset.findUniqueOrThrow({ where: { id: reusedAssetId } });
      } else {
        asset = await tx.growthAsset.upsert({
          where: { publicPath: stored!.publicPath },
          create: {
            publicPath: stored!.publicPath, checksum: stored!.checksum, mimeType: "image/png", width: CREATIVE_WIDTH, height: CREATIVE_HEIGHT, byteSize: stored!.byteSize,
            rendererKey: definition.rendererKey, rendererVersion: definition.rendererVersion, templateId: definition.templateId, generationKind, state: GrowthAssetState.READY,
            aiProvider: aiMetadata?.provider, aiModel: aiMetadata?.model, aiResponseId: aiMetadata?.responseId, aiImageUnits: aiMetadata?.imageUnits, estimatedCost: aiMetadata?.estimatedCost,
          },
          update: {},
        });
      }
      const deferred = similarity.classification === GrowthCreativeSimilarityClassification.EXACT_DUPLICATE || similarity.classification === GrowthCreativeSimilarityClassification.NEAR_DUPLICATE;
      const candidate = await tx.growthPinCandidate.create({ data: {
        candidateKey: candidateGroupKey(payload), revision: revision + 1, accountId: payload.accountId, clusterId: target.clusterId, experimentId: payload.experimentId, experimentVariantKey: payload.variantKey, generationJobId: jobId,
        destinationKind: payload.targetKind, translatorId: payload.targetKind === GrowthCreativeDestinationKind.TRANSLATOR ? target.id : null, ideaId: payload.targetKind === GrowthCreativeDestinationKind.IDEA ? target.id : null,
        title: copy.title, description: copy.description, destinationPath: target.destinationPath, pinRef: null, assetId: asset.id,
        rendererKey: definition.rendererKey, rendererVersion: definition.rendererVersion, templateId: definition.templateId, archetype: payload.archetype,
        headlinePattern: definition.headlinePattern, ctaPattern: definition.ctaPattern, visualTreatment: definition.visualTreatment, topic: copy.topic, contentHash,
        similarityModelVersion: CREATIVE_SIMILARITY_VERSION, similarityResult: similarity.classification, similarityFlags: similarity.flags as Prisma.InputJsonValue,
        status: deferred ? GrowthPinCandidateStatus.DEFERRED : GrowthPinCandidateStatus.READY,
      } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthPinCandidate", entityId: candidate.id, action: "CREATIVE_CANDIDATE_GENERATED", toState: candidate.status, summary: { archetype: candidate.archetype, similarity: candidate.similarityResult, targetKind: candidate.destinationKind }, correlationKey: candidate.candidateKey }, tx);
      return { candidate, asset };
    });
    return { ...result, reused: false };
  } catch (error) {
    if (stored?.created) {
      const referenced = await prisma.growthAsset.count({ where: { publicPath: stored.publicPath } }).catch(() => 0);
      await removeUnreferencedCreativeAssetFile(stored.filePath, referenced > 0);
    }
    throw error;
  }
}

export async function getAdminCreativeOverview() {
  const [candidates, translators, ideas, accounts, experiments] = await Promise.all([
    prisma.growthPinCandidate.findMany({ include: { asset: true, translator: { select: { name: true, slug: true } }, idea: { select: { slug: true, currentVersion: { select: { title: true } } } }, experiment: { select: { hypothesis: true, dimension: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.translator.findMany({ where: { isActive: true, archivedAt: null }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" }, take: 100 }),
    prisma.growthIdea.findMany({ where: { status: "PUBLISHED", archivedAt: null, currentVersionId: { not: null }, category: { isActive: true, archivedAt: null } }, select: { id: true, slug: true, currentVersion: { select: { title: true } } }, orderBy: { publishedAt: "desc" }, take: 100 }),
    prisma.growthPinterestAccount.findMany({ where: { connectionStatus: GrowthPinterestConnectionStatus.CONNECTED }, select: { id: true, username: true, publicationRole: true }, orderBy: { username: "asc" }, take: 20 }),
    prisma.growthExperiment.findMany({ where: { status: GrowthExperimentStatus.DRAFT }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  return { candidates, translators, ideas, accounts, experiments };
}
