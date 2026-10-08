import {
  GrowthActivityActorKind,
  GrowthDecisionStatus,
  GrowthDecisionType,
  GrowthIdeaStatus,
  GrowthIdeaTranslatorReferenceKind,
  GrowthIdeaVersionAction,
  GrowthJobType,
  GrowthOpportunityStatus,
  Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { GROWTH_SETTINGS_ID } from "@/lib/growth/contracts";
import { RetryableGrowthJobError } from "@/lib/growth/errors";
import { enqueueGrowthJob } from "@/lib/growth/jobs";
import { resolveIdeaCategory } from "@/lib/growth/ideas/categories";
import { checksumIdeaCandidate } from "@/lib/growth/ideas/checksum";
import {
  ideaBlockSchema,
  resolvedIdeaCandidateSchema,
  type GeneratedIdeaCandidate,
  type IdeaBlock,
  type ResolvedIdeaCandidate,
} from "@/lib/growth/ideas/contracts";
import {
  IDEA_AUTOPILOT_VERSION,
  IDEA_DECISION_REASON,
  IDEA_DEDUPE_VERSION,
  IDEA_GENERATION_VERSION,
  IDEA_QUALITY_VERSION,
  IDEA_SNAPSHOT_VERSION,
  MAX_IDEA_DEDUPE_CANDIDATES,
  MAX_IDEA_RELATED_TRANSLATORS,
} from "@/lib/growth/ideas/constants";
import { classifyIdeaDuplicate, ideaItemFingerprints } from "@/lib/growth/ideas/dedupe";
import {
  aggregateIdeaGenerationMetadata,
  IdeaGenerationError,
  OpenAIIdeaGenerationProvider,
  type IdeaGenerationMetadata,
  type IdeaGenerationProvider,
  type IdeaGenerationRequest,
} from "@/lib/growth/ideas/generation";
import { planIdeaAction } from "@/lib/growth/ideas/planner";
import { validateIdeaQuality } from "@/lib/growth/ideas/quality";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";

type Tx = Prisma.TransactionClient;

interface ExecuteIdeaOptions {
  jobId?: string | null;
  provider?: IdeaGenerationProvider;
  beforeApply?: () => Promise<void>;
}

class IdeaExecutionBlockedError extends Error {
  constructor(readonly status: GrowthDecisionStatus, readonly reason: string) {
    super(reason);
    this.name = "IdeaExecutionBlockedError";
  }
}

export class IdeaRollbackValidationError extends Error {
  constructor(readonly diagnostics: Array<{ code: string; message: string }>) {
    super(diagnostics.map((item) => item.code).join(", "));
    this.name = "IdeaRollbackValidationError";
  }
}

function json(value: unknown) { return value as Prisma.InputJsonValue; }
function decisionKey(opportunityId: string) { return `idea-decision:${IDEA_AUTOPILOT_VERSION}:${opportunityId}`; }
function actionKey(decisionId: string, type: GrowthDecisionType) { return `idea-action:${decisionId}:${type === GrowthDecisionType.CREATE_IDEA ? "create" : "improve"}`; }

async function persistIdeaGenerationMetadata(decisionId: string, attempts: IdeaGenerationMetadata[]) {
  if (!attempts.length) return;
  const metadata = aggregateIdeaGenerationMetadata(attempts);
  const existing = await prisma.growthDecision.findUnique({ where: { id: decisionId }, select: { actualOutcome: true } });
  const outcome = existing?.actualOutcome && typeof existing.actualOutcome === "object" && !Array.isArray(existing.actualOutcome)
    ? existing.actualOutcome as Record<string, Prisma.JsonValue>
    : {};
  await prisma.growthDecision.update({ where: { id: decisionId }, data: {
    aiProvider: metadata.provider,
    aiModel: metadata.model,
    aiResponseId: metadata.responseId,
    aiPromptTokens: metadata.promptTokens,
    aiCompletionTokens: metadata.completionTokens,
    aiTotalTokens: metadata.totalTokens,
    actualOutcome: json({ ...outcome, generation: { attemptCount: metadata.attemptCount } }),
  } });
}

async function getOpportunityContext(opportunityId: string) {
  const opportunity = await prisma.growthOpportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: { cluster: true, analysisRun: { select: { intelligenceModelVersion: true, clusteringModelVersion: true } } },
  });
  const snapshot = opportunity.clusterId
    ? await prisma.growthContentClusterSnapshot.findFirst({
        where: { analysisRunId: opportunity.analysisRunId, clusterId: opportunity.clusterId },
        include: { memberships: { take: 100, orderBy: { pinterestPinId: "asc" }, include: { pin: { select: { title: true, description: true } } } } },
      })
    : null;
  const representativePins = (snapshot?.memberships || []).filter((item) => item.pin?.title || item.pin?.description).slice(0, 12).map((item) => ({
    title: item.pin?.title || null,
    description: item.pin?.description || null,
    destinationPath: item.destinationPath,
  }));
  const mappedIdeas = opportunity.clusterId
    ? await prisma.growthIdea.findMany({ where: { clusterId: opportunity.clusterId, status: { notIn: [GrowthIdeaStatus.ARCHIVED, GrowthIdeaStatus.CANCELLED] } }, select: { id: true }, take: 3 })
    : [];
  return { opportunity, snapshot, representativePins, mappedIdeaIds: mappedIdeas.map((item) => item.id) };
}

export async function enqueueIdeaAutopilotDecision(opportunityId: string) {
  return enqueueGrowthJob({
    type: GrowthJobType.IDEA_AUTOPILOT_DECIDE,
    idempotencyKey: decisionKey(opportunityId),
    payload: { opportunityId, decisionModelVersion: IDEA_AUTOPILOT_VERSION },
  });
}

async function ensureExecutionJob(decision: { id: string; type: GrowthDecisionType; executionJobId: string | null }) {
  if (decision.type !== GrowthDecisionType.CREATE_IDEA && decision.type !== GrowthDecisionType.IMPROVE_IDEA) return null;
  const result = await enqueueGrowthJob({ type: GrowthJobType.IDEA_AUTOPILOT_EXECUTE, idempotencyKey: actionKey(decision.id, decision.type), payload: { decisionId: decision.id }, maxAttempts: 3 });
  if (decision.executionJobId !== result.job.id) await prisma.growthDecision.update({ where: { id: decision.id }, data: { executionJobId: result.job.id } });
  return result;
}

export async function decideIdeaOpportunity(opportunityId: string) {
  const context = await getOpportunityContext(opportunityId);
  const plan = planIdeaAction({
    type: context.opportunity.type,
    status: context.opportunity.status,
    score: context.opportunity.score,
    confidence: context.opportunity.confidence,
    evidenceQuality: context.opportunity.evidenceQuality,
    intelligenceModelVersion: context.opportunity.analysisRun.intelligenceModelVersion,
    analysisClusteringModelVersion: context.opportunity.analysisRun.clusteringModelVersion,
    opportunityClusteringModelVersion: context.opportunity.clusteringModelVersion,
    clusterName: context.opportunity.cluster?.name || null,
    representativeEvidenceCount: context.representativePins.length,
    mappedIdeaIds: context.mappedIdeaIds,
    obviousCoverage: context.mappedIdeaIds.length ? "RELATED" : "NONE",
  });
  const idempotencyKey = decisionKey(opportunityId);
  const current = plan.targetIdeaId ? await readCurrentIdea(plan.targetIdeaId) : null;
  const evidence = {
    opportunityType: context.opportunity.type,
    score: context.opportunity.score,
    confidence: context.opportunity.confidence,
    evidenceQuality: context.opportunity.evidenceQuality,
    intelligenceModelVersion: context.opportunity.analysisRun.intelligenceModelVersion,
    analysisClusteringModelVersion: context.opportunity.analysisRun.clusteringModelVersion,
    opportunityClusteringModelVersion: context.opportunity.clusteringModelVersion,
    clusterId: context.opportunity.clusterId,
    clusterName: context.opportunity.cluster?.name || null,
    representativePins: context.representativePins,
    mappedIdeaIds: context.mappedIdeaIds,
    targetChecksum: current?.checksum || null,
    sourceReasonCodes: context.opportunity.reasonCodes.slice(0, 24),
  };
  const status = plan.type === GrowthDecisionType.WAIT_FOR_MORE_DATA ? GrowthDecisionStatus.WAITING_DATA : plan.type === GrowthDecisionType.NO_ACTION ? GrowthDecisionStatus.COMPLETED : GrowthDecisionStatus.PROPOSED;
  let decision;
  try {
    decision = await prisma.$transaction(async (tx) => {
      const created = await tx.growthDecision.create({ data: {
        opportunityId, ideaId: plan.targetIdeaId, type: plan.type, status,
        decisionModelVersion: IDEA_AUTOPILOT_VERSION, qualityModelVersion: IDEA_QUALITY_VERSION, dedupeModelVersion: IDEA_DEDUPE_VERSION,
        evidence: json(evidence), reasonCodes: plan.reasonCodes, confidence: plan.confidence, idempotencyKey,
        actualOutcome: plan.type === GrowthDecisionType.NO_ACTION ? json({ outcome: "NO_ACTION" }) : undefined,
        completedAt: plan.type === GrowthDecisionType.NO_ACTION ? new Date() : null,
      } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthDecision", entityId: created.id, action: "IDEA_DECISION_CREATED", toState: created.status, summary: { opportunityId, type: created.type, reasonCodes: created.reasonCodes }, correlationKey: idempotencyKey }, tx);
      if (created.type === GrowthDecisionType.CREATE_IDEA || created.type === GrowthDecisionType.IMPROVE_IDEA) await tx.growthOpportunity.updateMany({ where: { id: opportunityId, status: GrowthOpportunityStatus.OPEN }, data: { status: GrowthOpportunityStatus.EVALUATING } });
      else if (created.type === GrowthDecisionType.WAIT_FOR_MORE_DATA) {
        await tx.growthOpportunity.updateMany({ where: { id: opportunityId, status: GrowthOpportunityStatus.OPEN }, data: { status: GrowthOpportunityStatus.DEFERRED } });
        await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthDecision", entityId: created.id, action: "IDEA_DECISION_WAITING_DATA", toState: created.status, summary: { reasonCodes: created.reasonCodes }, correlationKey: idempotencyKey }, tx);
      } else await tx.growthOpportunity.updateMany({ where: { id: opportunityId, status: GrowthOpportunityStatus.OPEN }, data: { status: GrowthOpportunityStatus.DISMISSED, closedAt: new Date() } });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") decision = await prisma.growthDecision.findUniqueOrThrow({ where: { idempotencyKey } });
    else throw error;
  }
  return { decision, execution: await ensureExecutionJob(decision) };
}

async function readCurrentIdea(ideaId: string, tx: Tx | typeof prisma = prisma) {
  const idea = await tx.growthIdea.findUnique({
    where: { id: ideaId },
    include: { currentVersion: { include: { translatorReferences: { include: { translator: { select: { slug: true } } } } } }, category: true },
  });
  if (!idea?.currentVersion) return null;
  const candidate = resolvedIdeaCandidateSchema.parse({
    title: idea.currentVersion.title, slug: idea.slug, categoryId: idea.currentVersion.categoryId,
    excerpt: idea.currentVersion.excerpt, seoTitle: idea.currentVersion.seoTitle, seoDescription: idea.currentVersion.seoDescription,
    blocks: idea.currentVersion.blocks,
  });
  return { idea, version: idea.currentVersion, candidate, checksum: checksumIdeaCandidate(candidate) };
}

function versionToGenerated(current: Awaited<ReturnType<typeof readCurrentIdea>>): GeneratedIdeaCandidate | null {
  if (!current) return null;
  const refs = new Map(current.idea.currentVersion?.translatorReferences.map((item) => [item.translatorId, item.translator.slug]) || []);
  return {
    title: current.candidate.title, slug: current.candidate.slug, categorySuggestion: current.idea.category.slug,
    excerpt: current.candidate.excerpt, seoTitle: current.candidate.seoTitle, seoDescription: current.candidate.seoDescription,
    blocks: current.candidate.blocks.map((block) => {
      if (block.type === "TRANSLATOR_CTA" || block.type === "EMBEDDED_TRANSLATOR") return { ...block, translatorSlug: refs.get(block.translatorId) || block.translatorId };
      return block;
    }) as GeneratedIdeaCandidate["blocks"],
  };
}

async function buildGenerationRequest(decisionId: string) {
  const decision = await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } });
  const evidence = decision.evidence as Record<string, unknown>;
  const [categories, translators, existingIdeas, current] = await Promise.all([
    prisma.growthIdeaCategory.findMany({ where: { isActive: true, archivedAt: null }, select: { name: true, slug: true }, orderBy: [{ sortOrder: "asc" }, { slug: "asc" }], take: 50 }),
    prisma.translator.findMany({ where: { isActive: true, archivedAt: null }, select: { name: true, slug: true, shortDescription: true }, orderBy: [{ updatedAt: "desc" }, { slug: "asc" }], take: MAX_IDEA_RELATED_TRANSLATORS }),
    prisma.growthIdea.findMany({ where: { status: { notIn: [GrowthIdeaStatus.ARCHIVED, GrowthIdeaStatus.CANCELLED] } }, select: { slug: true, category: { select: { slug: true } }, currentVersion: { select: { title: true } } }, orderBy: { updatedAt: "desc" }, take: 40 }),
    decision.ideaId ? readCurrentIdea(decision.ideaId) : Promise.resolve(null),
  ]);
  return {
    decision, current, expectedChecksum: typeof evidence.targetChecksum === "string" ? evidence.targetChecksum : null,
    request: {
      action: decision.type as "CREATE_IDEA" | "IMPROVE_IDEA",
      opportunityType: String(evidence.opportunityType || "UNKNOWN"), clusterName: String(evidence.clusterName || ""),
      score: Number(evidence.score || 0), confidence: Number(evidence.confidence || decision.confidence),
      reasonCodes: Array.isArray(evidence.sourceReasonCodes) ? evidence.sourceReasonCodes.map(String).slice(0, 24) : [],
      categoryOptions: categories, relatedTranslators: translators,
      existingIdeas: existingIdeas.filter((item) => item.currentVersion).map((item) => ({ title: item.currentVersion!.title, slug: item.slug, categorySlug: item.category.slug })),
      representativePins: Array.isArray(evidence.representativePins) ? (evidence.representativePins as IdeaGenerationRequest["representativePins"]).slice(0, 12) : [],
      currentIdea: versionToGenerated(current),
    } satisfies IdeaGenerationRequest,
  };
}

async function resolveGeneratedCandidate(generated: GeneratedIdeaCandidate, stableSlug?: string | null) {
  const [categories, translators] = await Promise.all([
    prisma.growthIdeaCategory.findMany({ select: { id: true, name: true, slug: true, isActive: true, archivedAt: true }, orderBy: { slug: "asc" }, take: 100 }),
    prisma.translator.findMany({ where: { isActive: true, archivedAt: null }, select: { id: true, name: true, slug: true, shortDescription: true }, orderBy: { slug: "asc" }, take: 1000 }),
  ]);
  const category = resolveIdeaCategory(generated.categorySuggestion, categories);
  if (category.status !== "RESOLVED") return { status: "CATEGORY_INVALID" as const, candidate: null, translatorIds: [] as string[] };
  const translatorIds: string[] = [];
  const blocks: IdeaBlock[] = [];
  for (const block of generated.blocks) {
    if (block.type !== "TRANSLATOR_CTA" && block.type !== "EMBEDDED_TRANSLATOR") { blocks.push(ideaBlockSchema.parse(block)); continue; }
    const key = slugify(block.translatorSlug);
    const matches = translators.filter((item) => slugify(item.slug) === key || slugify(item.name) === key);
    if (matches.length !== 1) return { status: "TRANSLATOR_INVALID" as const, candidate: null, translatorIds: [] as string[] };
    translatorIds.push(matches[0].id);
    blocks.push(ideaBlockSchema.parse(block.type === "TRANSLATOR_CTA"
      ? { type: block.type, translatorId: matches[0].id, heading: block.heading, body: block.body, buttonLabel: block.buttonLabel }
      : { type: block.type, translatorId: matches[0].id, heading: block.heading, helperText: block.helperText }));
  }
  const candidate = resolvedIdeaCandidateSchema.parse({
    title: generated.title,
    slug: stableSlug || slugify(generated.slug || generated.title),
    categoryId: category.category.id,
    excerpt: generated.excerpt,
    seoTitle: generated.seoTitle,
    seoDescription: generated.seoDescription,
    blocks,
  });
  return { status: "RESOLVED" as const, candidate, translatorIds: [...new Set(translatorIds)], translatorContextById: new Map(translators.map((item) => [item.id, `${item.name} ${item.slug} ${item.shortDescription}`])), category: category.category };
}

async function updateFailure(decisionId: string, status: GrowthDecisionStatus, reason: string) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.growthDecision.findUniqueOrThrow({ where: { id: decisionId } });
    const decision = await tx.growthDecision.update({ where: { id: decisionId }, data: { status, reasonCodes: { push: reason }, completedAt: status === GrowthDecisionStatus.FAILED_TERMINAL ? new Date() : null } });
    if (decision.opportunityId) {
      const opportunityStatus = status === GrowthDecisionStatus.WAITING_DATA ? GrowthOpportunityStatus.DEFERRED : status === GrowthDecisionStatus.FAILED_TERMINAL ? GrowthOpportunityStatus.FAILED_TERMINAL : GrowthOpportunityStatus.FAILED_RETRYABLE;
      await tx.growthOpportunity.updateMany({ where: { id: decision.opportunityId, status: { in: [GrowthOpportunityStatus.EVALUATING, GrowthOpportunityStatus.FAILED_RETRYABLE] } }, data: { status: opportunityStatus, closedAt: opportunityStatus === GrowthOpportunityStatus.FAILED_TERMINAL ? new Date() : null } });
    }
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthDecision", entityId: decisionId, action: status === GrowthDecisionStatus.WAITING_DATA ? "IDEA_DECISION_WAITING_DATA" : "IDEA_FAILURE", fromState: before.status, toState: status, summary: { reason }, correlationKey: before.idempotencyKey }, tx);
  });
}

function dedupeInput(candidate: ResolvedIdeaCandidate, clusterId: string | null) {
  return { title: candidate.title, slug: candidate.slug, categoryId: candidate.categoryId, clusterId, itemFingerprints: ideaItemFingerprints(candidate.blocks as Array<Record<string, unknown>>), archivedAt: null };
}

async function readDedupeCandidates(excludeIdeaId?: string | null, tx: Tx | typeof prisma = prisma) {
  const rows = await tx.growthIdea.findMany({
    where: excludeIdeaId ? { id: { not: excludeIdeaId } } : undefined,
    select: { id: true, slug: true, categoryId: true, clusterId: true, archivedAt: true, currentVersion: { select: { title: true, blocks: true } } },
    orderBy: [{ archivedAt: "asc" }, { slug: "asc" }], take: MAX_IDEA_DEDUPE_CANDIDATES + 1,
  });
  return rows.filter((item) => item.currentVersion).map((item) => ({ id: item.id, title: item.currentVersion!.title, slug: item.slug, categoryId: item.categoryId, clusterId: item.clusterId, itemFingerprints: ideaItemFingerprints(item.currentVersion!.blocks as Array<Record<string, unknown>>), archivedAt: item.archivedAt }));
}

async function nextVersion(tx: Tx, ideaId: string) {
  const latest = await tx.growthIdeaVersion.findFirst({ where: { ideaId }, orderBy: { version: "desc" }, select: { version: true } });
  return (latest?.version || 0) + 1;
}

async function executeIdeaDecisionAttempt(decisionId: string, options: ExecuteIdeaOptions) {
  const claimed = await prisma.growthDecision.updateMany({
    where: { id: decisionId, status: { in: [GrowthDecisionStatus.PROPOSED, GrowthDecisionStatus.VALIDATING, GrowthDecisionStatus.FAILED_RETRYABLE] }, type: { in: [GrowthDecisionType.CREATE_IDEA, GrowthDecisionType.IMPROVE_IDEA] } },
    data: { status: GrowthDecisionStatus.EXECUTING },
  });
  if (!claimed.count) return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: true };
  const prepared = await buildGenerationRequest(decisionId);
  if (prepared.decision.type === GrowthDecisionType.IMPROVE_IDEA && (!prepared.current || prepared.current.checksum !== prepared.expectedChecksum)) {
    await updateFailure(decisionId, GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.TARGET_CHANGED);
    return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
  }
  const provider = options.provider || new OpenAIIdeaGenerationProvider();
  const attempts: IdeaGenerationMetadata[] = [];
  let generated;
  let repairUsed = false;
  try {
    generated = await provider.generate(prepared.request);
    attempts.push(generated.metadata);
    await persistIdeaGenerationMetadata(decisionId, attempts);
  }
  catch (error) {
    if (error instanceof IdeaGenerationError && error.metadata) {
      attempts.push(error.metadata);
      await persistIdeaGenerationMetadata(decisionId, attempts);
    }
    repairUsed = true;
    try {
      generated = await provider.generate(prepared.request, { attempt: 1, issue: error instanceof Error ? error.message : "Invalid generated Idea." });
      attempts.push(generated.metadata);
      await persistIdeaGenerationMetadata(decisionId, attempts);
    }
    catch (repairError) {
      if (repairError instanceof IdeaGenerationError && repairError.metadata) {
        attempts.push(repairError.metadata);
        await persistIdeaGenerationMetadata(decisionId, attempts);
      }
      await updateFailure(decisionId, GrowthDecisionStatus.FAILED_RETRYABLE, "IDEA_GENERATION_FAILED");
      throw new RetryableGrowthJobError(repairError instanceof Error ? repairError.message : "Idea generation failed.");
    }
  }
  let resolved = await resolveGeneratedCandidate(generated.candidate, prepared.current?.candidate.slug);
  if (resolved.status !== "RESOLVED") {
    await updateFailure(decisionId, GrowthDecisionStatus.WAITING_DATA, resolved.status === "CATEGORY_INVALID" ? IDEA_DECISION_REASON.CATEGORY_UNAVAILABLE : IDEA_DECISION_REASON.TRANSLATOR_REFERENCE_CHANGED);
    return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
  }
  let checksum = checksumIdeaCandidate(resolved.candidate);
  let quality = validateIdeaQuality(resolved.candidate, { activeTranslatorIds: new Set(resolved.translatorIds), translatorContextById: resolved.translatorContextById, previousChecksum: prepared.current?.checksum, checksum });
  if (!quality.valid && !repairUsed) {
    repairUsed = true;
    try {
      const repaired = await provider.generate(prepared.request, { attempt: 1, issue: quality.diagnostics.map((item) => item.code).join(", ") });
      attempts.push(repaired.metadata);
      await persistIdeaGenerationMetadata(decisionId, attempts);
      generated = repaired;
      resolved = await resolveGeneratedCandidate(repaired.candidate, prepared.current?.candidate.slug);
      if (resolved.status !== "RESOLVED") throw new Error(resolved.status);
      checksum = checksumIdeaCandidate(resolved.candidate);
      quality = validateIdeaQuality(resolved.candidate, { activeTranslatorIds: new Set(resolved.translatorIds), translatorContextById: resolved.translatorContextById, previousChecksum: prepared.current?.checksum, checksum });
    } catch (repairError) {
      if (repairError instanceof IdeaGenerationError && repairError.metadata) {
        attempts.push(repairError.metadata);
        await persistIdeaGenerationMetadata(decisionId, attempts);
      }
      await updateFailure(decisionId, GrowthDecisionStatus.FAILED_TERMINAL, "IDEA_QUALITY_REPAIR_FAILED");
      return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
    }
  }
  if (!quality.valid) {
    await updateFailure(decisionId, GrowthDecisionStatus.FAILED_TERMINAL, "IDEA_QUALITY_VALIDATION_FAILED");
    return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
  }
  const evidence = prepared.decision.evidence as Record<string, unknown>;
  const clusterId = typeof evidence.clusterId === "string" ? evidence.clusterId : null;
  const candidates = await readDedupeCandidates(prepared.decision.ideaId);
  if (candidates.length > MAX_IDEA_DEDUPE_CANDIDATES) {
    await updateFailure(decisionId, GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.DEDUPE_CAP_EXCEEDED);
    return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
  }
  const duplicate = classifyIdeaDuplicate(dedupeInput(resolved.candidate, clusterId), candidates);
  if (["EXACT_DUPLICATE", "NEAR_DUPLICATE"].includes(duplicate.classification)) {
    await updateFailure(decisionId, GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.DUPLICATE_BLOCKED);
    return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
  }
  if (options.beforeApply) await options.beforeApply();
  const enabled = await prisma.growthSettings.findUnique({ where: { id: GROWTH_SETTINGS_ID }, select: { enabled: true } });
  if (!enabled?.enabled) {
    await updateFailure(decisionId, GrowthDecisionStatus.FAILED_RETRYABLE, IDEA_DECISION_REASON.GROWTH_DISABLED_BEFORE_APPLY);
    throw new RetryableGrowthJobError("Growth was disabled after generation and before Idea publication.");
  }
  const metadata = aggregateIdeaGenerationMetadata(attempts);
  const result = await prisma.$transaction(async (tx) => {
    const settings = await tx.$queryRaw<Array<{ enabled: boolean }>>`SELECT "enabled" FROM "GrowthSettings" WHERE "id" = ${GROWTH_SETTINGS_ID} FOR SHARE`;
    if (!settings[0]?.enabled) throw new IdeaExecutionBlockedError(GrowthDecisionStatus.FAILED_RETRYABLE, IDEA_DECISION_REASON.GROWTH_DISABLED_BEFORE_APPLY);
    const decision = await tx.growthDecision.findUniqueOrThrow({ where: { id: decisionId } });
    if (decision.status !== GrowthDecisionStatus.EXECUTING) return { decision, ideaId: decision.ideaId, version: null, reused: true };
    if (decision.opportunityId) {
      const source = await tx.growthOpportunity.findUnique({ where: { id: decision.opportunityId }, select: { status: true } });
      const allowedOpportunityStatuses = new Set<GrowthOpportunityStatus>([GrowthOpportunityStatus.EVALUATING, GrowthOpportunityStatus.FAILED_RETRYABLE]);
      if (!source || !allowedOpportunityStatuses.has(source.status)) throw new IdeaExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.SOURCE_OPPORTUNITY_CHANGED);
    }
    const safeCategory = await tx.growthIdeaCategory.findFirst({ where: { id: resolved.candidate.categoryId, isActive: true, archivedAt: null }, select: { id: true } });
    if (!safeCategory) throw new IdeaExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.CATEGORY_CHANGED);
    const safeTranslators = await tx.translator.findMany({ where: { id: { in: resolved.translatorIds }, isActive: true, archivedAt: null }, select: { id: true } });
    if (safeTranslators.length !== resolved.translatorIds.length) throw new IdeaExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.TRANSLATOR_REFERENCE_CHANGED);
    const existingMutation = await tx.growthIdeaVersion.findUnique({ where: { mutationKey: actionKey(decisionId, decision.type) } });
    if (existingMutation) return { decision, ideaId: existingMutation.ideaId, version: existingMutation, reused: true };

    let ideaId = decision.ideaId;
    if (decision.type === GrowthDecisionType.CREATE_IDEA) {
      await tx.$queryRaw`SELECT 1::int AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtext('growth-idea-create-v1'))) AS "acquired"`;
      const lateCandidates = await readDedupeCandidates(null, tx);
      if (lateCandidates.length > MAX_IDEA_DEDUPE_CANDIDATES) throw new IdeaExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.DEDUPE_CAP_EXCEEDED);
      const lateDuplicate = classifyIdeaDuplicate(dedupeInput(resolved.candidate, clusterId), lateCandidates);
      if (["EXACT_DUPLICATE", "NEAR_DUPLICATE"].includes(lateDuplicate.classification)) throw new IdeaExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.DUPLICATE_BLOCKED);
      const created = await tx.growthIdea.create({ data: { slug: resolved.candidate.slug, categoryId: resolved.candidate.categoryId, status: GrowthIdeaStatus.VALIDATING, clusterId, seoTitle: resolved.candidate.seoTitle, seoDescription: resolved.candidate.seoDescription } });
      ideaId = created.id;
    } else {
      if (!ideaId || !prepared.current) throw new IdeaExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.TARGET_CHANGED);
      await tx.$queryRaw`SELECT "id" FROM "GrowthIdea" WHERE "id" = ${ideaId} FOR UPDATE`;
      const live = await readCurrentIdea(ideaId, tx);
      const editableStatuses = new Set<GrowthIdeaStatus>([GrowthIdeaStatus.PUBLISHED, GrowthIdeaStatus.DRAFT, GrowthIdeaStatus.NEEDS_REVISION, GrowthIdeaStatus.REVISING]);
      if (!live || live.checksum !== prepared.current.checksum || !editableStatuses.has(live.idea.status)) throw new IdeaExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, IDEA_DECISION_REASON.TARGET_CHANGED);
      await tx.growthIdea.update({ where: { id: ideaId }, data: { status: GrowthIdeaStatus.REVISING } });
    }
    if (!ideaId) throw new Error("Idea mutation did not produce a target.");
    const publishedAt = new Date();
    const version = await tx.growthIdeaVersion.create({ data: {
      ideaId, categoryId: resolved.candidate.categoryId, decisionId, jobId: options.jobId || null,
      version: await nextVersion(tx, ideaId), action: decision.type === GrowthDecisionType.CREATE_IDEA ? GrowthIdeaVersionAction.CREATE : GrowthIdeaVersionAction.IMPROVE,
      title: resolved.candidate.title, excerpt: resolved.candidate.excerpt, seoTitle: resolved.candidate.seoTitle, seoDescription: resolved.candidate.seoDescription,
      blocks: json(resolved.candidate.blocks), checksum, qualityResult: json(quality),
      decisionModelVersion: IDEA_AUTOPILOT_VERSION, generationModelVersion: IDEA_GENERATION_VERSION, qualityModelVersion: IDEA_QUALITY_VERSION, dedupeModelVersion: IDEA_DEDUPE_VERSION, snapshotModelVersion: IDEA_SNAPSHOT_VERSION,
      aiProvider: metadata.provider, aiModel: metadata.model, aiResponseId: metadata.responseId, aiPromptTokens: metadata.promptTokens, aiCompletionTokens: metadata.completionTokens, aiTotalTokens: metadata.totalTokens, generationAttemptCount: metadata.attemptCount,
      authorKind: GrowthActivityActorKind.WORKER, mutationKey: actionKey(decisionId, decision.type), publishedAt,
      translatorReferences: { create: resolved.candidate.blocks.flatMap((block, index): Array<{ translatorId: string; kind: GrowthIdeaTranslatorReferenceKind; sortOrder: number }> => block.type === "TRANSLATOR_CTA" ? [{ translatorId: block.translatorId, kind: GrowthIdeaTranslatorReferenceKind.CTA, sortOrder: index }] : block.type === "EMBEDDED_TRANSLATOR" ? [{ translatorId: block.translatorId, kind: GrowthIdeaTranslatorReferenceKind.EMBEDDED, sortOrder: index }] : []) },
    } });
    await tx.growthIdea.update({ where: { id: ideaId }, data: { categoryId: resolved.candidate.categoryId, status: GrowthIdeaStatus.PUBLISHED, currentVersionId: version.id, seoTitle: resolved.candidate.seoTitle, seoDescription: resolved.candidate.seoDescription, publishedAt, archivedAt: null } });
    const completed = await tx.growthDecision.update({ where: { id: decisionId }, data: {
      status: GrowthDecisionStatus.COMPLETED, ideaId, completedAt: publishedAt,
      aiProvider: metadata.provider, aiModel: metadata.model, aiResponseId: metadata.responseId, aiPromptTokens: metadata.promptTokens, aiCompletionTokens: metadata.completionTokens, aiTotalTokens: metadata.totalTokens,
      actualOutcome: json({ action: version.action, ideaId, versionId: version.id, version: version.version, checksum, generationAttempts: metadata.attemptCount }),
    } });
    if (decision.opportunityId) await tx.growthOpportunity.updateMany({ where: { id: decision.opportunityId, status: { in: [GrowthOpportunityStatus.EVALUATING, GrowthOpportunityStatus.FAILED_RETRYABLE] } }, data: { status: GrowthOpportunityStatus.ACTIONED, closedAt: publishedAt } });
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthIdea", entityId: ideaId, action: version.action === GrowthIdeaVersionAction.CREATE ? "IDEA_CREATED" : "IDEA_IMPROVED", summary: { decisionId, versionId: version.id, version: version.version, checksum }, correlationKey: decision.idempotencyKey }, tx);
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthIdea", entityId: ideaId, action: "IDEA_PUBLISHED", fromState: decision.type === GrowthDecisionType.CREATE_IDEA ? GrowthIdeaStatus.VALIDATING : GrowthIdeaStatus.REVISING, toState: GrowthIdeaStatus.PUBLISHED, summary: { versionId: version.id, checksum }, correlationKey: decision.idempotencyKey }, tx);
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthDecision", entityId: decisionId, action: "IDEA_DECISION_COMPLETED", fromState: GrowthDecisionStatus.EXECUTING, toState: GrowthDecisionStatus.COMPLETED, summary: { ideaId, versionId: version.id }, correlationKey: decision.idempotencyKey }, tx);
    return { decision: completed, ideaId, version, reused: false };
  });
  return result;
}

export async function executeIdeaDecision(decisionId: string, options: ExecuteIdeaOptions = {}) {
  try { return await executeIdeaDecisionAttempt(decisionId, options); }
  catch (error) {
    const current = await prisma.growthDecision.findUnique({ where: { id: decisionId }, select: { status: true } });
    const uniqueConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (error instanceof IdeaExecutionBlockedError && current?.status === GrowthDecisionStatus.EXECUTING) {
      await updateFailure(decisionId, error.status, error.reason);
      if (error.status === GrowthDecisionStatus.FAILED_RETRYABLE) throw new RetryableGrowthJobError(error.message);
      return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
    }
    if (current?.status === GrowthDecisionStatus.EXECUTING) await updateFailure(decisionId, uniqueConflict ? GrowthDecisionStatus.WAITING_DATA : GrowthDecisionStatus.FAILED_RETRYABLE, uniqueConflict ? IDEA_DECISION_REASON.DUPLICATE_BLOCKED : "IDEA_EXECUTION_FAILED");
    if (uniqueConflict) return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
    if (error instanceof RetryableGrowthJobError) throw error;
    throw new RetryableGrowthJobError(error instanceof Error ? error.message : "Idea execution failed.");
  }
}

export async function archiveIdea(params: { ideaId: string; expectedCurrentChecksum: string; actorUserId: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "GrowthIdea" WHERE "id" = ${params.ideaId} FOR UPDATE`;
    const current = await readCurrentIdea(params.ideaId, tx);
    if (!current || current.checksum !== params.expectedCurrentChecksum) throw new Error("Idea changed before it could be archived.");
    if (current.idea.status === GrowthIdeaStatus.ARCHIVED) return current.idea;
    const archived = await tx.growthIdea.update({ where: { id: params.ideaId }, data: { status: GrowthIdeaStatus.ARCHIVED, archivedAt: new Date() } });
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.USER, actorUserId: params.actorUserId, entityType: "GrowthIdea", entityId: params.ideaId, action: "IDEA_ARCHIVED", fromState: current.idea.status, toState: GrowthIdeaStatus.ARCHIVED, summary: { checksum: current.checksum } }, tx);
    return archived;
  });
}

export async function rollbackIdeaVersion(params: { ideaId: string; targetVersionId: string; expectedCurrentChecksum: string; actorUserId: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "GrowthIdea" WHERE "id" = ${params.ideaId} FOR UPDATE`;
    const current = await readCurrentIdea(params.ideaId, tx);
    if (!current) throw new Error("Idea no longer exists.");
    if (current.checksum !== params.expectedCurrentChecksum) throw new Error("Idea changed before rollback could be applied.");
    if (current.idea.status === GrowthIdeaStatus.ARCHIVED || current.idea.archivedAt) throw new Error("Archived Ideas cannot be restored through rollback.");
    const target = await tx.growthIdeaVersion.findFirst({ where: { id: params.targetVersionId, ideaId: params.ideaId }, include: { translatorReferences: true } });
    if (!target) throw new Error("The selected version does not belong to this Idea.");
    const candidate = resolvedIdeaCandidateSchema.parse({ title: target.title, slug: current.idea.slug, categoryId: target.categoryId, excerpt: target.excerpt, seoTitle: target.seoTitle, seoDescription: target.seoDescription, blocks: target.blocks });
    const safeCategory = await tx.growthIdeaCategory.findFirst({ where: { id: candidate.categoryId, isActive: true, archivedAt: null }, select: { id: true } });
    const referenceIds = [...new Set(target.translatorReferences.map((item) => item.translatorId))];
    const safeTranslators = await tx.translator.findMany({ where: { id: { in: referenceIds }, isActive: true, archivedAt: null }, select: { id: true, name: true, slug: true, shortDescription: true } });
    const diagnostics: Array<{ code: string; message: string }> = [];
    if (!safeCategory) diagnostics.push({ code: "HISTORICAL_CATEGORY_UNAVAILABLE", message: "Stored Idea category is unavailable." });
    if (safeTranslators.length !== referenceIds.length) diagnostics.push({ code: "HISTORICAL_TRANSLATOR_UNAVAILABLE", message: "A stored Translator reference is unavailable." });
    const checksum = checksumIdeaCandidate(candidate);
    const quality = validateIdeaQuality(candidate, { activeTranslatorIds: new Set(safeTranslators.map((item) => item.id)), translatorContextById: new Map(safeTranslators.map((item) => [item.id, `${item.name} ${item.slug} ${item.shortDescription}`])), checksum });
    if (!quality.valid) diagnostics.push(...quality.diagnostics.map((item) => ({ code: item.code, message: item.message })));
    if (diagnostics.length) throw new IdeaRollbackValidationError(diagnostics);
    if (checksum === current.checksum) return { changed: false, ideaId: params.ideaId, version: null, checksum };
    const mutationKey = `idea-rollback:${params.ideaId}:${target.id}:${current.checksum}`;
    const existing = await tx.growthIdeaVersion.findUnique({ where: { mutationKey } });
    if (existing) return { changed: false, ideaId: params.ideaId, version: existing, checksum: existing.checksum };
    const publishedAt = new Date();
    const version = await tx.growthIdeaVersion.create({ data: {
      ideaId: params.ideaId, categoryId: candidate.categoryId, sourceVersionId: target.id, authorUserId: params.actorUserId,
      version: await nextVersion(tx, params.ideaId), action: GrowthIdeaVersionAction.ROLLBACK,
      title: candidate.title, excerpt: candidate.excerpt, seoTitle: candidate.seoTitle, seoDescription: candidate.seoDescription, blocks: json(candidate.blocks), checksum, qualityResult: json(quality),
      decisionModelVersion: IDEA_AUTOPILOT_VERSION, generationModelVersion: IDEA_GENERATION_VERSION, qualityModelVersion: IDEA_QUALITY_VERSION, dedupeModelVersion: IDEA_DEDUPE_VERSION, snapshotModelVersion: IDEA_SNAPSHOT_VERSION,
      authorKind: GrowthActivityActorKind.USER, mutationKey, publishedAt,
      translatorReferences: { create: target.translatorReferences.map((item) => ({ translatorId: item.translatorId, kind: item.kind, sortOrder: item.sortOrder })) },
    } });
    await tx.growthIdea.update({ where: { id: params.ideaId }, data: { categoryId: candidate.categoryId, currentVersionId: version.id, status: GrowthIdeaStatus.PUBLISHED, seoTitle: candidate.seoTitle, seoDescription: candidate.seoDescription, publishedAt, archivedAt: null } });
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.USER, actorUserId: params.actorUserId, entityType: "GrowthIdea", entityId: params.ideaId, action: "IDEA_ROLLED_BACK", summary: { targetVersionId: target.id, createdVersionId: version.id, version: version.version, checksum }, correlationKey: mutationKey }, tx);
    return { changed: true, ideaId: params.ideaId, version, checksum };
  });
}
