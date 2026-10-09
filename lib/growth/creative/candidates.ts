import {
  GrowthActivityActorKind,
  GrowthAssetGenerationKind,
  GrowthAssetState,
  GrowthCreativeArchetype,
  GrowthCreativeDestinationKind,
  GrowthCreativeSimilarityClassification,
  GrowthExperimentStatus,
  GrowthJobStatus,
  GrowthJobType,
  GrowthPinCandidateStatus,
  GrowthPinterestConnectionStatus,
  Prisma,
} from "@prisma/client";
import { createHash } from "node:crypto";

import { recordGrowthActivity } from "@/lib/growth/activity";
import type { CreativeAiImageProvider } from "@/lib/growth/creative/ai-image-provider";
import { createCreativeAiImageBudget, OpenAICreativeImageProvider } from "@/lib/growth/creative/ai-image-provider";
import {
  DEFAULT_CREATIVE_EXAMPLE_INPUT,
  generateCreativeExample,
  type CreativeExampleProvider,
} from "@/lib/growth/creative/example-provider";
import {
  CREATIVE_HEIGHT,
  CREATIVE_AI_FULL_KEY,
  CREATIVE_AI_FULL_VERSION,
  CREATIVE_DIRECTIONS,
  CREATIVE_DIRECTION_TEMPLATES,
  CREATIVE_LAB_VERSION,
  CREATIVE_SIMILARITY_VERSION,
  CREATIVE_TEMPLATE_DIRECTIONS,
  CREATIVE_WIDTH,
  MAX_CREATIVE_COMPARISONS,
  type CreativeDirection,
} from "@/lib/growth/creative/constants";
import {
  creativeCopySchema,
  creativeGenerationJobPayloadSchema,
  creativeGenerationRequestSchema,
  creativeRegenerationRequestSchema,
  type CreativeGenerationJobPayload,
  type CreativeGenerationRequest,
} from "@/lib/growth/creative/contracts";
import { readExperimentVariant } from "@/lib/growth/creative/experiments";
import { getCreativeRendererDefinition, renderDeterministicCreative } from "@/lib/growth/creative/renderer";
import { buildExactCreativeSimilarity, classifyCreativeSimilarity, type SimilarityCandidate } from "@/lib/growth/creative/similarity";
import { parseCreativeSimilarityFlags } from "@/lib/growth/creative/presentation";
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
import { getServerEnv } from "@/lib/env";

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

function compactStyleLabel(value: string, maximum = 18) {
  const normalized = value
    .replace(/\btranslator\b/gi, " ")
    .replace(/[^\p{L}\p{N}'’-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const words = normalized.split(" ");
  let label = "";
  for (const word of words) {
    const candidate = label ? `${label} ${word}` : word;
    if (candidate.length > maximum) break;
    label = candidate;
  }
  return label || normalized.slice(0, maximum).trim();
}

export function buildStyleAwareCreativeCta(topic: string, sourceFingerprint: string) {
  const style = compactStyleLabel(topic);
  if (!style) return "Try it with your own text";
  const frames = [
    `Try the ${style} version`,
    `Give it the ${style} twist`,
    `Rewrite it the ${style} way`,
  ];
  const frameIndex = Number.parseInt(sourceFingerprint.slice(0, 8), 16) % frames.length;
  return frames[Number.isFinite(frameIndex) ? frameIndex : 0];
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

async function resolveCreativeExample(target: CreativeTarget, useAi: boolean, provider: CreativeExampleProvider | undefined, jobId: string | null) {
  try {
    return await generateCreativeExample({
      savedExample: target.savedExample,
      useAi: useAi && target.kind === GrowthCreativeDestinationKind.TRANSLATOR,
      provider,
      assertGrowthEnabled: async () => {
        const settings = await prisma.growthSettings.findUnique({ where: { id: GROWTH_SETTINGS_ID }, select: { enabled: true } });
        if (!settings?.enabled) throw new NonRetryableGrowthJobError("Growth is disabled before Creative Lab AI generation.");
      },
      onAiUsage: jobId ? async (metadata) => {
        await recordGrowthActivity({
          actorKind: GrowthActivityActorKind.WORKER,
          entityType: "GrowthJob",
          entityId: jobId,
          action: "CREATIVE_EXAMPLE_AI_USED",
          summary: { provider: metadata.provider, model: metadata.model, promptTokens: metadata.promptTokens, completionTokens: metadata.completionTokens, totalTokens: metadata.totalTokens },
          correlationKey: jobId,
        });
      } : undefined,
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
  } catch (error) {
    if (error instanceof NonRetryableGrowthJobError) throw error;
    throw new NonRetryableGrowthJobError("Before-and-after example generation failed; no candidate was created.");
  }
}

async function buildCopy(target: CreativeTarget, archetype: GrowthCreativeArchetype, useAiExample: boolean, provider: CreativeExampleProvider | undefined, jobId: string | null) {
  const translator = target.kind === GrowthCreativeDestinationKind.TRANSLATOR;
  const cta = translator
    ? archetype === GrowthCreativeArchetype.BEFORE_AFTER
      ? buildStyleAwareCreativeCta(target.topic, target.sourceFingerprint)
      : "Try it with your own text"
    : archetype === GrowthCreativeArchetype.EDITORIAL_LIST
      ? "Explore the full version"
      : "See all ideas";
  const example = archetype === GrowthCreativeArchetype.BEFORE_AFTER ? await resolveCreativeExample(target, useAiExample, provider, jobId) : null;
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

export function creativeTemplateIdForVariation(baseTemplateId: string, variation: number) {
  const bounded = Math.min(2, Math.max(0, Math.trunc(variation)));
  return `${baseTemplateId}-layout-${bounded + 1}`;
}

export function creativeVariationFromTemplateId(templateId: string) {
  const match = templateId.match(/-layout-([123])$/);
  return match ? Number(match[1]) - 1 : null;
}

export function nextCreativeVariation(previousTemplateId?: string | null) {
  const previous = previousTemplateId ? creativeVariationFromTemplateId(previousTemplateId) : null;
  return previous === null ? 0 : (previous + 1) % 3;
}

export function creativeDirectionFromTemplateId(templateId?: string | null) {
  if (!templateId) return null;
  return CREATIVE_TEMPLATE_DIRECTIONS[templateId] || null;
}

export function selectCreativeDirection(recentTemplateIds: string[], excluded: CreativeDirection[] = []) {
  const excludedSet = new Set(excluded);
  const recentlyUsed = new Set(recentTemplateIds.map(creativeDirectionFromTemplateId).filter((value): value is CreativeDirection => Boolean(value)));
  const unused = CREATIVE_DIRECTIONS.find((direction) => !excludedSet.has(direction) && !recentlyUsed.has(direction));
  if (unused) return unused;
  return CREATIVE_DIRECTIONS.find((direction) => !excludedSet.has(direction)) || null;
}

export function selectUnusedCreativeDirection(recentTemplateIds: string[], excluded: CreativeDirection[] = []) {
  const excludedSet = new Set(excluded);
  const recentlyUsed = new Set(recentTemplateIds.map(creativeDirectionFromTemplateId).filter((value): value is CreativeDirection => Boolean(value)));
  return CREATIVE_DIRECTIONS.find((direction) => !excludedSet.has(direction) && !recentlyUsed.has(direction)) || null;
}

export function selectUnusedMinimalVariation(recentTemplateIds: string[], excluded: number[] = []) {
  const used = new Set(recentTemplateIds.map(creativeVariationFromTemplateId).filter((value): value is number => value !== null));
  const excludedSet = new Set(excluded);
  return [0, 1, 2].find((variation) => !excludedSet.has(variation) && !used.has(variation));
}

async function experimentVariation(request: CreativeGenerationRequest, baseTemplateId: string, rotatedVariation: number) {
  if (!request.experimentId || !request.variantKey) return rotatedVariation;
  const experiment = await prisma.growthExperiment.findUnique({ where: { id: request.experimentId }, select: { status: true, dimension: true, variants: true } });
  if (!experiment || experiment.dimension !== "TEMPLATE") return rotatedVariation;
  const variant = readExperimentVariant(experiment, request.variantKey);
  if (!variant.value.startsWith(`${baseTemplateId}-layout-`)) return rotatedVariation;
  return creativeVariationFromTemplateId(variant.value) ?? rotatedVariation;
}

async function creativeGenerationIdempotencyKey(baseKey: string) {
  const latest = await prisma.growthJob.findFirst({
    where: {
      type: GrowthJobType.CREATIVE_LAB_GENERATE,
      idempotencyKey: { startsWith: baseKey },
    },
    select: {
      id: true,
      status: true,
      idempotencyKey: true,
      growthPinCandidate: { select: { id: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!latest) return baseKey;
  if (latest.status !== GrowthJobStatus.FAILED_TERMINAL || latest.growthPinCandidate) return latest.idempotencyKey;
  return `${baseKey}:retry:${hash(latest.id).slice(0, 32)}`;
}

export async function enqueueCreativeGeneration(input: unknown) {
  const request = creativeGenerationRequestSchema.parse(input);
  const target = await getEligibleCreativeTarget(request.targetKind, request.targetId);
  if (request.archetype === GrowthCreativeArchetype.BEFORE_AFTER && !target.savedExample && !request.useAiExample) {
    throw new NonRetryableGrowthJobError("Before-and-after creative requires a saved example or enabled AI transformation.");
  }
  const recent = await prisma.growthPinCandidate.findMany({
    where: {
      destinationKind: request.targetKind,
      archetype: request.archetype,
      ...(request.targetKind === GrowthCreativeDestinationKind.TRANSLATOR ? { translatorId: target.id } : { ideaId: target.id }),
    },
    select: { id: true, templateId: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 25,
  });
  const latest = recent[0];
  const baseDefinition = getCreativeRendererDefinition(request.archetype);
  const visualVariation = request.archetype === GrowthCreativeArchetype.MINIMAL_STATEMENT
    ? await experimentVariation(request, baseDefinition.templateId, nextCreativeVariation(latest?.templateId))
    : undefined;
  let creativeDirection = request.archetype === GrowthCreativeArchetype.BEFORE_AFTER
    ? selectCreativeDirection(recent.map((candidate) => candidate.templateId))
    : null;
  if (request.archetype === GrowthCreativeArchetype.BEFORE_AFTER && request.experimentId && request.variantKey) {
    const experiment = await prisma.growthExperiment.findUnique({ where: { id: request.experimentId }, select: { status: true, dimension: true, variants: true } });
    if (experiment?.dimension === "TEMPLATE") {
      creativeDirection = creativeDirectionFromTemplateId(readExperimentVariant(experiment, request.variantKey).value);
    }
  }
  if (request.archetype === GrowthCreativeArchetype.BEFORE_AFTER && !creativeDirection) throw new NonRetryableGrowthJobError("No controlled Before-and-After direction is available.");
  const payload: CreativeGenerationJobPayload = {
    ...request,
    ...(visualVariation === undefined ? {} : { visualVariation }),
    ...(creativeDirection ? { creativeDirection } : {}),
  };
  const requestIdentity = hash({ request, sourceFingerprint: target.sourceFingerprint, predecessorCandidateId: latest?.id || null, visualVariation, creativeDirection }).slice(0, 48);
  const idempotencyKey = await creativeGenerationIdempotencyKey(`creative-generate:${requestIdentity}`);
  const requiresPaidGeneration = request.archetype === GrowthCreativeArchetype.BEFORE_AFTER;
  return enqueueGrowthJob({ type: GrowthJobType.CREATIVE_LAB_GENERATE, idempotencyKey, payload, maxAttempts: requiresPaidGeneration ? 1 : 3 });
}

export async function enqueueCreativeRegeneration(input: unknown) {
  const { candidateId } = creativeRegenerationRequestSchema.parse(input);
  const source = await prisma.growthPinCandidate.findUnique({
    where: { id: candidateId },
    include: { generationJob: { select: { id: true } } },
  });
  if (!source || source.status !== GrowthPinCandidateStatus.DEFERRED) throw new NonRetryableGrowthJobError("Only a deferred Creative Lab candidate can be regenerated.");
  const regenerationReason = source.similarityResult === GrowthCreativeSimilarityClassification.EXACT_DUPLICATE
    ? "EXACT_DUPLICATE" as const
    : source.similarityResult === GrowthCreativeSimilarityClassification.NEAR_DUPLICATE
      ? "NEAR_DUPLICATE" as const
      : null;
  if (!regenerationReason) {
    throw new NonRetryableGrowthJobError("This deferred candidate has no supported regeneration strategy.");
  }
  const flags = parseCreativeSimilarityFlags(source.similarityFlags);
  const matchedCandidateId = flags.matchedCandidateId || null;
  const targetId = source.translatorId || source.ideaId;
  if (!targetId) throw new NonRetryableGrowthJobError("The deferred candidate target is unavailable.");
  const targetWhere = source.destinationKind === GrowthCreativeDestinationKind.TRANSLATOR
    ? { translatorId: source.translatorId }
    : { ideaId: source.ideaId };
  const controlledTemplateIds = source.archetype === GrowthCreativeArchetype.MINIMAL_STATEMENT
    ? [0, 1, 2].map((variation) => creativeTemplateIdForVariation("minimal-poster-v2", variation))
    : source.archetype === GrowthCreativeArchetype.BEFORE_AFTER
      ? Object.keys(CREATIVE_TEMPLATE_DIRECTIONS)
      : [];
  const [recent, matchedCandidate, usedControlledTemplates] = await Promise.all([
    prisma.growthPinCandidate.findMany({
      where: { destinationKind: source.destinationKind, archetype: source.archetype, ...targetWhere },
      select: { id: true, templateId: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
    }),
    matchedCandidateId
      ? prisma.growthPinCandidate.findUnique({ where: { id: matchedCandidateId }, select: { id: true, templateId: true } })
      : Promise.resolve(null),
    controlledTemplateIds.length
      ? prisma.growthPinCandidate.groupBy({
        by: ["templateId"],
        where: {
          destinationKind: source.destinationKind,
          archetype: source.archetype,
          ...targetWhere,
          templateId: { in: controlledTemplateIds },
        },
      })
      : Promise.resolve([]),
  ]);
  const target = await getEligibleCreativeTarget(source.destinationKind, targetId);
  const avoidCandidateIds = [source.id, matchedCandidateId].filter((value): value is string => Boolean(value)).slice(0, 10);
  let visualVariation: number | undefined;
  let creativeDirection: CreativeDirection | undefined;
  let avoidDirections: CreativeDirection[] | undefined;
  if (source.archetype === GrowthCreativeArchetype.MINIMAL_STATEMENT) {
    const sourceVariation = creativeVariationFromTemplateId(source.templateId);
    const matchedVariation = creativeVariationFromTemplateId(matchedCandidate?.templateId || "");
    const excludedVariations = [sourceVariation, matchedVariation].filter((value): value is number => value !== null);
    visualVariation = selectUnusedMinimalVariation(usedControlledTemplates.map((candidate) => candidate.templateId), excludedVariations);
    if (visualVariation === undefined) throw new NonRetryableGrowthJobError("All deterministic Minimal Poster variations have already been used for this destination.");
  } else if (source.archetype === GrowthCreativeArchetype.BEFORE_AFTER) {
    avoidDirections = [creativeDirectionFromTemplateId(source.templateId), creativeDirectionFromTemplateId(matchedCandidate?.templateId)].filter((value): value is CreativeDirection => Boolean(value));
    creativeDirection = selectUnusedCreativeDirection(usedControlledTemplates.map((candidate) => candidate.templateId), avoidDirections) || undefined;
    if (!creativeDirection) throw new NonRetryableGrowthJobError("All controlled Before-and-After creative directions have already been used for this destination.");
  } else {
    throw new NonRetryableGrowthJobError("Historical Creative Lab concepts cannot be regenerated from this action.");
  }
  const payload: CreativeGenerationJobPayload = {
    targetKind: source.destinationKind,
    targetId,
    archetype: source.archetype,
    useAiExample: source.archetype === GrowthCreativeArchetype.BEFORE_AFTER ? true : undefined,
    accountId: source.accountId || undefined,
    creativeModelVersion: CREATIVE_LAB_VERSION,
    ...(visualVariation === undefined ? {} : { visualVariation }),
    ...(creativeDirection ? { creativeDirection } : {}),
    regenerationOfCandidateId: source.id,
    regenerationReason,
    avoidCandidateIds,
    ...(avoidDirections?.length ? { avoidDirections } : {}),
  };
  const selectedTemplate = creativeDirection ? CREATIVE_DIRECTION_TEMPLATES[creativeDirection] : creativeTemplateIdForVariation("minimal-poster-v2", visualVariation!);
  const requestIdentity = hash({ candidateId: source.id, sourceFingerprint: target.sourceFingerprint, selectedTemplate, recentHeadId: recent[0]?.id || null }).slice(0, 48);
  const idempotencyKey = await creativeGenerationIdempotencyKey(`creative-regenerate:${requestIdentity}`);
  const result = await enqueueGrowthJob({ type: GrowthJobType.CREATIVE_LAB_GENERATE, idempotencyKey, payload, maxAttempts: source.archetype === GrowthCreativeArchetype.BEFORE_AFTER ? 1 : 3 });
  if (result.created) {
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.USER,
      entityType: "GrowthPinCandidate",
      entityId: source.id,
      action: "CREATIVE_REGENERATION_REQUESTED",
      summary: { originalCandidateId: source.id, similarityReason: source.similarityResult, selectedTemplate, matchedCandidateId, archetype: source.archetype },
      correlationKey: result.job.idempotencyKey,
    });
  }
  return result;
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
  const baseDefinition: CreativeDefinition = payload.archetype === GrowthCreativeArchetype.SCENE_BASED
    ? { rendererKey: "ai-scene", rendererVersion: CREATIVE_LAB_VERSION, templateId: "scene-based-v1", headlinePattern: "scene-topic-promise", ctaPattern: "destination-action", visualTreatment: "generated-scene" }
    : getCreativeRendererDefinition(payload.archetype);
  const visualVariation = payload.visualVariation ?? 0;
  const definition: CreativeDefinition = payload.archetype === GrowthCreativeArchetype.BEFORE_AFTER && payload.creativeDirection
    ? {
        rendererKey: CREATIVE_AI_FULL_KEY,
        rendererVersion: CREATIVE_AI_FULL_VERSION,
        templateId: CREATIVE_DIRECTION_TEMPLATES[payload.creativeDirection],
        headlinePattern: "transformation-proof-v3",
        ctaPattern: "style-aware-transformation-cta",
        visualTreatment: `full-ai-${payload.creativeDirection.toLowerCase().replaceAll("_", "-")}`,
      }
    : payload.archetype === GrowthCreativeArchetype.MINIMAL_STATEMENT || payload.archetype === GrowthCreativeArchetype.BEFORE_AFTER
      ? { ...baseDefinition, templateId: creativeTemplateIdForVariation(baseDefinition.templateId, visualVariation) }
      : baseDefinition;
  const target = await getEligibleCreativeTarget(payload.targetKind, payload.targetId);
  await validateCreativeContext(prisma as unknown as CreativeReadClient, payload, target, definition);
  const { copy, exampleSource, exampleMetadata } = await buildCopy(target, payload.archetype, payload.useAiExample === true, options.exampleProvider, jobId);
  const contentHash = hash({ target: target.sourceFingerprint, copy, definition, archetype: payload.archetype });
  const similarityInput = { title: copy.title, contentHash, destinationPath: target.destinationPath, topic: copy.topic, accountId: payload.accountId || null, archetype: payload.archetype, templateId: definition.templateId, visualTreatment: definition.visualTreatment };
  const [preexistingExactContent, history] = await Promise.all([
    prisma.growthPinCandidate.findFirst({ where: { contentHash }, orderBy: { createdAt: "desc" }, include: { asset: true } }),
    prisma.growthPinCandidate.findMany({ select: { id: true, title: true, contentHash: true, destinationPath: true, topic: true, accountId: true, archetype: true, templateId: true, visualTreatment: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MAX_CREATIVE_COMPARISONS }),
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
  } else if (!preexistingExactContent && payload.archetype === GrowthCreativeArchetype.BEFORE_AFTER && payload.creativeDirection) {
    const env = getServerEnv();
    const enabled = options.aiEnabled ?? env.GROWTH_AI_IMAGE_ENABLED === true;
    if (!enabled) throw new NonRetryableGrowthJobError("Creative AI image generation is disabled.");
    const settings = await prisma.growthSettings.findUnique({ where: { id: GROWTH_SETTINGS_ID }, select: { enabled: true } });
    if (!settings?.enabled) throw new NonRetryableGrowthJobError("Growth is disabled before Creative Lab AI image generation.");
    const budget = createCreativeAiImageBudget(1);
    budget.consume();
    const provider = options.aiProvider || new OpenAICreativeImageProvider();
    if (!copy.exampleInput || !copy.exampleOutput) throw new NonRetryableGrowthJobError("Before-and-after creative requires verified example evidence.");
    const generated = await provider.generate({
      topic: target.topic,
      direction: payload.creativeDirection,
      avoidDirections: payload.avoidDirections,
      brandName: "SayTwist",
      headline: copy.headline,
      beforeLabel: "BEFORE",
      beforeText: copy.exampleInput,
      afterLabel: "AFTER",
      afterText: copy.exampleOutput,
      cta: copy.cta,
      domain: "saytwist.com",
    });
    validateCreativePng(generated.bytes);
    if (generated.width !== CREATIVE_WIDTH || generated.height !== CREATIVE_HEIGHT || generated.mimeType !== "image/png") throw new NonRetryableGrowthJobError("Creative AI provider returned an invalid image.");
    const providerName = clamp(generated.metadata.provider, 80);
    const model = clamp(generated.metadata.model, 120);
    const estimatedCost = generated.metadata.estimatedCost ?? null;
    if (!providerName || !model || generated.metadata.imageUnits !== 1 || (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0))) throw new NonRetryableGrowthJobError("Creative AI provider returned invalid metadata.");
    aiMetadata = { provider: providerName, model, responseId: generated.metadata.responseId ? clamp(generated.metadata.responseId, 191) : null, imageUnits: 1, estimatedCost };
    if (jobId) {
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.WORKER,
        entityType: "GrowthJob",
        entityId: jobId,
        action: "CREATIVE_IMAGE_AI_USED",
        summary: { provider: providerName, model, responseId: aiMetadata.responseId, imageUnits: 1, estimatedCost, creativeDirection: payload.creativeDirection },
        correlationKey: jobId,
      });
    }
    bytes = generated.bytes;
    generationKind = GrowthAssetGenerationKind.AI;
  } else if (!preexistingExactContent && payload.archetype === GrowthCreativeArchetype.SCENE_BASED) {
    const enabled = options.aiEnabled ?? process.env.GROWTH_AI_IMAGE_ENABLED === "true";
    if (!enabled || !options.aiProvider) throw new NonRetryableGrowthJobError("Creative AI image generation is disabled.");
    const budget = createCreativeAiImageBudget(1);
    budget.consume();
    const generated = await options.aiProvider.generate({
      topic: copy.topic,
      direction: "BOLD_POSTER",
      brandName: "SayTwist",
      headline: copy.headline,
      beforeLabel: "IDEA",
      beforeText: copy.subheadline,
      afterLabel: "EXPLORE",
      afterText: copy.description,
      cta: copy.cta,
      domain: "saytwist.com",
    });
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
    bytes = await renderDeterministicCreative(payload.archetype, copy, visualVariation);
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
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthPinCandidate", entityId: candidate.id, action: "CREATIVE_CANDIDATE_GENERATED", toState: candidate.status, summary: { archetype: candidate.archetype, similarity: candidate.similarityResult, targetKind: candidate.destinationKind, exampleSource, exampleProvider: exampleMetadata?.provider || null, exampleModel: exampleMetadata?.model || null, examplePromptTokens: exampleMetadata?.promptTokens ?? null, exampleCompletionTokens: exampleMetadata?.completionTokens ?? null, exampleTotalTokens: exampleMetadata?.totalTokens ?? null, creativeDirection: payload.creativeDirection || null, regenerationOfCandidateId: payload.regenerationOfCandidateId || null, regenerationReason: payload.regenerationReason || null }, correlationKey: candidate.candidateKey }, tx);
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
    prisma.growthPinCandidate.findMany({ include: { asset: true, translator: { select: { name: true, slug: true } }, idea: { select: { slug: true, currentVersion: { select: { title: true } } } }, experiment: { select: { hypothesis: true, dimension: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 }),
    prisma.translator.findMany({ where: { isActive: true, archivedAt: null }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" }, take: 100 }),
    prisma.growthIdea.findMany({ where: { status: "PUBLISHED", archivedAt: null, currentVersionId: { not: null }, category: { isActive: true, archivedAt: null } }, select: { id: true, slug: true, currentVersion: { select: { title: true, blocks: true, publishedAt: true } } }, orderBy: { publishedAt: "desc" }, take: 100 }),
    prisma.growthPinterestAccount.findMany({ where: { connectionStatus: GrowthPinterestConnectionStatus.CONNECTED }, select: { id: true, username: true, publicationRole: true }, orderBy: { username: "asc" }, take: 20 }),
    prisma.growthExperiment.findMany({ where: { status: GrowthExperimentStatus.DRAFT }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  const ideas = ideaRows.filter((idea) => idea.currentVersion?.publishedAt && ideaBlocksSchema.safeParse(idea.currentVersion.blocks).success);
  return { candidates, translators, ideas, accounts, experiments };
}
