import {
  GrowthActivityActorKind,
  GrowthContentSideEffectStatus,
  GrowthContentVersionAction,
  GrowthDecisionStatus,
  GrowthDecisionType,
  GrowthJobType,
  GrowthOpportunityStatus,
  Prisma,
} from "@prisma/client";

import { invalidatePublicTranslatorCaches } from "@/lib/data/translator-cache-invalidation";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { GROWTH_SETTINGS_ID } from "@/lib/growth/contracts";
import { RetryableGrowthJobError } from "@/lib/growth/errors";
import { enqueueGrowthJob } from "@/lib/growth/jobs";
import { resolveCategory } from "@/lib/growth/translator/categories";
import {
  DECISION_REASON,
  MAX_DEDUPE_CANDIDATES,
  MAX_RELATED_TRANSLATORS,
  TRANSLATOR_AUTOPILOT_VERSION,
  TRANSLATOR_DEDUPE_VERSION,
  TRANSLATOR_QUALITY_VERSION,
} from "@/lib/growth/translator/constants";
import { classifyTranslatorDuplicate } from "@/lib/growth/translator/dedupe";
import {
  OpenAITranslatorGenerationProvider,
  aggregateGenerationMetadata,
  generationMetadataFromError,
  type TranslatorGenerationProvider,
  type TranslatorGenerationMetadata,
  type TranslatorGenerationRequest,
} from "@/lib/growth/translator/generation";
import { planTranslatorAction } from "@/lib/growth/translator/planner";
import { validateTranslatorQuality } from "@/lib/growth/translator/quality";
import {
  assertSnapshotBound,
  checksumTranslatorSnapshot,
  readTranslatorSnapshot,
  snapshotToDraft,
  snapshotToTranslatorInput,
  translatorSnapshotSchema,
  type TranslatorSnapshot,
} from "@/lib/growth/translator/snapshot";
import { prisma } from "@/lib/prisma";
import { toSafeGrowthError } from "@/lib/growth/safe-data";
import { slugify } from "@/lib/slugify";
import { draftToTranslatorInput } from "@/lib/translator-draft";
import type { TranslatorUpsertInput } from "@/lib/types";

type Tx = Prisma.TransactionClient;

type ShareImageRefreshResult = {
  shareImagePath: string | null;
  shareImageHash: string | null;
  shareImageUpdatedAt: Date | null;
} | null;

export type TranslatorShareImageRefresher = (
  translatorId: string,
  options: { force: boolean; throwOnError: boolean },
) => Promise<ShareImageRefreshResult>;

interface ExecuteOptions {
  jobId?: string | null;
  provider?: TranslatorGenerationProvider;
  beforeApply?: () => Promise<void>;
  refreshShareImage?: TranslatorShareImageRefresher;
}

export class RollbackValidationError extends Error {
  constructor(readonly diagnostics: Array<{ code: string; message: string }>) {
    super(diagnostics.map((item) => item.code).join(", "));
    this.name = "RollbackValidationError";
  }
}

class ExecutionBlockedError extends Error {
  constructor(
    readonly status: GrowthDecisionStatus,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "ExecutionBlockedError";
  }
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function decisionKey(opportunityId: string) {
  return `translator-decision:${TRANSLATOR_AUTOPILOT_VERSION}:${opportunityId}`;
}

function actionKey(decisionId: string, type: GrowthDecisionType) {
  return `translator-action:${decisionId}:${type === GrowthDecisionType.CREATE_TRANSLATOR ? "create" : "improve"}`;
}

const shareImageFields = ["name", "subtitle", "shortDescription", "sourceLabel", "targetLabel"] as const;

export function needsShareImageRefresh(before: TranslatorSnapshot | null, after: TranslatorSnapshot) {
  return !before || shareImageFields.some((field) => before[field] !== after[field]);
}

async function defaultShareImageRefresher(
  translatorId: string,
  options: { force: boolean; throwOnError: boolean },
) {
  const { ensureTranslatorShareImageById } = await import("@/lib/share-images");
  return ensureTranslatorShareImageById(translatorId, options);
}

async function reconcileShareImage(
  versionId: string,
  refresher: TranslatorShareImageRefresher,
  throwOnFailure: boolean,
) {
  const version = await prisma.growthContentVersion.findUniqueOrThrow({ where: { id: versionId } });
  if (version.sideEffectStatus === GrowthContentSideEffectStatus.SYNCHRONIZED || version.sideEffectStatus === GrowthContentSideEffectStatus.NOT_REQUIRED) return version;
  try {
    const refreshed = await refresher(version.translatorId, { force: true, throwOnError: true });
    if (!refreshed?.shareImagePath || !refreshed.shareImageHash || !refreshed.shareImageUpdatedAt) {
      throw new Error("Share-image refresh returned incomplete metadata.");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.growthContentVersion.update({
        where: { id: version.id },
        data: { sideEffectStatus: GrowthContentSideEffectStatus.SYNCHRONIZED, sideEffectError: null, sideEffectCompletedAt: new Date() },
      });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthContentVersion", entityId: version.id, action: "SHARE_IMAGE_SYNCHRONIZED", summary: { translatorId: version.translatorId }, correlationKey: version.mutationKey }, tx);
      return updated;
    });
    invalidatePublicTranslatorCaches();
    return updated;
  } catch (error) {
    const message = toSafeGrowthError(error).slice(0, 500);
    const failed = await prisma.$transaction(async (tx) => {
      const updated = await tx.growthContentVersion.update({ where: { id: version.id }, data: { sideEffectStatus: GrowthContentSideEffectStatus.FAILED_RETRYABLE, sideEffectError: message, sideEffectCompletedAt: null } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthContentVersion", entityId: version.id, action: "SHARE_IMAGE_SYNC_FAILED", summary: { translatorId: version.translatorId, error: message }, correlationKey: version.mutationKey }, tx);
      return updated;
    });
    invalidatePublicTranslatorCaches();
    if (throwOnFailure) throw new RetryableGrowthJobError(`Translator mutation committed; share-image reconciliation is pending: ${message}`);
    return failed;
  }
}

async function nextVersion(tx: Tx, translatorId: string) {
  const latest = await tx.growthContentVersion.findFirst({
    where: { translatorId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version || 0) + 1;
}

function nestedCreate(input: TranslatorUpsertInput) {
  const editorial = input.editorial || {};
  return {
    modes: { createMany: { data: input.modes.map((item, index) => ({ key: slugify(item.key || item.label), label: item.label.trim(), description: item.description?.trim() || null, instruction: item.instruction.trim(), sortOrder: item.sortOrder || index + 1 })) } },
    examples: { createMany: { data: input.examples.map((item, index) => ({ label: item.label.trim(), value: item.value.trim(), sortOrder: item.sortOrder || index + 1 })) } },
    categories: { create: input.categoryIds.map((categoryId, index) => ({ categoryId, sortOrder: index + 1 })) },
    editorialContent: { create: { about: editorial.about?.trim() || null, whatItDoes: editorial.whatItDoes?.trim() || null, differenceDescription: editorial.differenceDescription?.trim() || null } },
    editorialLists: { createMany: { data: (editorial.lists || []).map((item) => ({ kind: item.kind, content: item.content.trim(), sortOrder: item.sortOrder })) } },
    editorialExamples: { createMany: { data: (editorial.examples || []).map((item) => ({ contextTitle: item.contextTitle?.trim() || null, originalText: item.originalText.trim(), transformedText: item.transformedText.trim(), sortOrder: item.sortOrder })) } },
    editorialFaqs: { createMany: { data: (editorial.faq || []).map((item) => ({ question: item.question.trim(), answer: item.answer.trim(), sortOrder: item.sortOrder })) } },
  };
}

function scalarData(input: TranslatorUpsertInput) {
  return {
    name: input.name.trim(), slug: input.slug, title: input.title.trim(), subtitle: input.subtitle.trim(), shortDescription: input.shortDescription.trim(),
    sourceLabel: input.sourceLabel.trim(), targetLabel: input.targetLabel.trim(), iconName: input.iconName?.trim() || null,
    promptSystem: input.promptSystem.trim(), promptInstructions: input.promptInstructions.trim(), seoTitle: input.seoTitle?.trim() || null,
    seoDescription: input.seoDescription?.trim() || null, isActive: input.isActive, showModeSelector: input.showModeSelector,
    showSwap: input.showSwap, showExamples: input.showExamples, sortOrder: input.sortOrder, primaryCategoryId: input.primaryCategoryId || input.categoryIds[0],
  };
}

function managedScalarData(input: TranslatorUpsertInput) {
  return {
    title: input.title.trim(),
    subtitle: input.subtitle.trim(),
    shortDescription: input.shortDescription.trim(),
    sourceLabel: input.sourceLabel.trim(),
    targetLabel: input.targetLabel.trim(),
    promptSystem: input.promptSystem.trim(),
    promptInstructions: input.promptInstructions.trim(),
    seoTitle: input.seoTitle?.trim() || null,
    seoDescription: input.seoDescription?.trim() || null,
    primaryCategoryId: input.primaryCategoryId || input.categoryIds[0],
  };
}

async function replaceTranslator(tx: Tx, translatorId: string, input: TranslatorUpsertInput) {
  await tx.translationMode.deleteMany({ where: { translatorId } });
  await tx.translatorExample.deleteMany({ where: { translatorId } });
  await tx.translatorCategory.deleteMany({ where: { translatorId } });
  await tx.translatorEditorialContent.deleteMany({ where: { translatorId } });
  await tx.translatorEditorialList.deleteMany({ where: { translatorId } });
  await tx.translatorEditorialExample.deleteMany({ where: { translatorId } });
  await tx.translatorEditorialFaq.deleteMany({ where: { translatorId } });
  await tx.translator.update({
    where: { id: translatorId },
    data: { ...managedScalarData(input), ...nestedCreate(input) },
  });
}

async function getOpportunityContext(opportunityId: string) {
  const opportunity = await prisma.growthOpportunity.findUnique({
    where: { id: opportunityId },
    include: { cluster: { select: { id: true, name: true } } },
  });
  if (!opportunity) throw new Error("Growth opportunity was not found.");
  const snapshot = opportunity.clusterId
    ? await prisma.growthContentClusterSnapshot.findUnique({
        where: { analysisRunId_clusterId: { analysisRunId: opportunity.analysisRunId, clusterId: opportunity.clusterId } },
        include: {
          memberships: {
            take: 100,
            orderBy: { pinterestPinId: "asc" },
            include: { pin: { select: { title: true, description: true } } },
          },
        },
      })
    : null;
  const memberships = snapshot?.memberships || [];
  const mappedTranslatorIds = memberships.map((item) => item.translatorId).filter((id): id is string => Boolean(id));
  const representativePins = memberships
    .filter((item) => item.pin?.title || item.pin?.description)
    .slice(0, 12)
    .map((item) => ({ title: item.pin?.title || null, description: item.pin?.description || null, destinationPath: item.destinationPath }));
  return { opportunity, snapshot, memberships, mappedTranslatorIds, representativePins };
}

export async function enqueueTranslatorAutopilotDecision(opportunityId: string) {
  return enqueueGrowthJob({
    type: GrowthJobType.TRANSLATOR_AUTOPILOT_DECIDE,
    idempotencyKey: decisionKey(opportunityId),
    payload: { opportunityId, decisionModelVersion: TRANSLATOR_AUTOPILOT_VERSION },
  });
}

async function ensureExecutionJob(decision: { id: string; type: GrowthDecisionType; executionJobId: string | null }) {
  if (decision.type !== GrowthDecisionType.CREATE_TRANSLATOR && decision.type !== GrowthDecisionType.IMPROVE_TRANSLATOR) return null;
  const result = await enqueueGrowthJob({
    type: GrowthJobType.TRANSLATOR_AUTOPILOT_EXECUTE,
    idempotencyKey: actionKey(decision.id, decision.type),
    payload: { decisionId: decision.id },
    maxAttempts: 3,
  });
  if (decision.executionJobId !== result.job.id) {
    await prisma.growthDecision.update({ where: { id: decision.id }, data: { executionJobId: result.job.id } });
  }
  return result;
}

export async function decideTranslatorOpportunity(opportunityId: string) {
  const context = await getOpportunityContext(opportunityId);
  const plan = planTranslatorAction({
    type: context.opportunity.type,
    status: context.opportunity.status,
    score: context.opportunity.score,
    confidence: context.opportunity.confidence,
    evidenceQuality: context.opportunity.evidenceQuality,
    clusterName: context.opportunity.cluster?.name || null,
    mappedTranslatorIds: context.mappedTranslatorIds,
    distinctDestinationCount: context.snapshot?.distinctDestinationCount || 0,
    representativeEvidenceCount: context.representativePins.length,
  });
  const idempotencyKey = decisionKey(opportunityId);
  const plannedTarget = plan.targetTranslatorId ? await readTranslatorSnapshot(plan.targetTranslatorId) : null;
  const evidence = {
    opportunityType: context.opportunity.type,
    score: context.opportunity.score,
    confidence: context.opportunity.confidence,
    evidenceQuality: context.opportunity.evidenceQuality,
    clusterName: context.opportunity.cluster?.name || null,
    clusterId: context.opportunity.clusterId,
    distinctDestinationCount: context.snapshot?.distinctDestinationCount || 0,
    representativePins: context.representativePins,
    mappedTranslatorIds: [...new Set(context.mappedTranslatorIds)].sort(),
    targetChecksum: plannedTarget?.checksum || null,
    sourceReasonCodes: context.opportunity.reasonCodes.slice(0, 24),
  };
  const terminalStatus = plan.type === GrowthDecisionType.WAIT_FOR_MORE_DATA
    ? GrowthDecisionStatus.WAITING_DATA
    : plan.type === GrowthDecisionType.NO_ACTION
      ? GrowthDecisionStatus.COMPLETED
      : GrowthDecisionStatus.PROPOSED;

  let decision;
  try {
    decision = await prisma.$transaction(async (tx) => {
      const created = await tx.growthDecision.create({
        data: {
          opportunityId,
          translatorId: plan.targetTranslatorId,
          executionJobId: null,
          type: plan.type,
          status: terminalStatus,
          decisionModelVersion: TRANSLATOR_AUTOPILOT_VERSION,
          qualityModelVersion: TRANSLATOR_QUALITY_VERSION,
          dedupeModelVersion: TRANSLATOR_DEDUPE_VERSION,
          evidence: json(evidence),
          reasonCodes: plan.reasonCodes,
          confidence: plan.confidence,
          idempotencyKey,
          actualOutcome: plan.type === GrowthDecisionType.NO_ACTION ? json({ outcome: "NO_ACTION" }) : undefined,
          completedAt: plan.type === GrowthDecisionType.NO_ACTION ? new Date() : null,
        },
      });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthDecision", entityId: created.id, action: "DECISION_CREATED", toState: created.status, summary: { opportunityId, type: created.type, reasonCodes: created.reasonCodes }, correlationKey: idempotencyKey }, tx);
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthDecision", entityId: created.id, action: terminalStatus === GrowthDecisionStatus.WAITING_DATA ? "DECISION_WAITING_DATA" : "DECISION_VALIDATED", toState: terminalStatus, summary: { type: created.type, targetTranslatorId: created.translatorId }, correlationKey: idempotencyKey }, tx);
      if (created.type === GrowthDecisionType.CREATE_TRANSLATOR || created.type === GrowthDecisionType.IMPROVE_TRANSLATOR) {
        await tx.growthOpportunity.updateMany({ where: { id: opportunityId, status: GrowthOpportunityStatus.OPEN }, data: { status: GrowthOpportunityStatus.EVALUATING } });
      } else if (created.type === GrowthDecisionType.WAIT_FOR_MORE_DATA) {
        await tx.growthOpportunity.updateMany({ where: { id: opportunityId, status: GrowthOpportunityStatus.OPEN }, data: { status: GrowthOpportunityStatus.DEFERRED } });
      } else {
        await tx.growthOpportunity.updateMany({ where: { id: opportunityId, status: GrowthOpportunityStatus.OPEN }, data: { status: GrowthOpportunityStatus.DISMISSED, closedAt: new Date() } });
      }
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      decision = await prisma.growthDecision.findUniqueOrThrow({ where: { idempotencyKey } });
    } else throw error;
  }
  const execution = await ensureExecutionJob(decision);
  return { decision, execution };
}

async function loadGenerationRequest(decisionId: string): Promise<{ decision: Awaited<ReturnType<typeof prisma.growthDecision.findUniqueOrThrow>>; request: TranslatorGenerationRequest; current: Awaited<ReturnType<typeof readTranslatorSnapshot>>; expectedTargetChecksum: string | null }> {
  const decision = await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } });
  const evidence = decision.evidence as Record<string, unknown>;
  const categories = await prisma.category.findMany({ where: { isActive: true, archivedAt: null }, select: { name: true, slug: true }, orderBy: [{ sortOrder: "asc" }, { slug: "asc" }], take: 100 });
  const related = await prisma.translator.findMany({
    where: { archivedAt: null },
    select: { name: true, slug: true, categories: { select: { category: { select: { slug: true } } } } },
    orderBy: [{ updatedAt: "desc" }, { slug: "asc" }],
    take: MAX_RELATED_TRANSLATORS,
  });
  const current = decision.translatorId ? await readTranslatorSnapshot(decision.translatorId) : null;
  return {
    decision,
    current,
    expectedTargetChecksum: typeof evidence.targetChecksum === "string" ? evidence.targetChecksum : null,
    request: {
      action: decision.type as "CREATE_TRANSLATOR" | "IMPROVE_TRANSLATOR",
      opportunityType: String(evidence.opportunityType || "UNKNOWN"),
      clusterName: String(evidence.clusterName || ""),
      score: Number(evidence.score || 0),
      confidence: Number(evidence.confidence || decision.confidence),
      reasonCodes: Array.isArray(evidence.sourceReasonCodes) ? evidence.sourceReasonCodes.map(String).slice(0, 24) : [],
      intendedNeed: `Produce a distinct, useful Translator grounded in the supplied cluster and representative evidence. ${decision.type === GrowthDecisionType.IMPROVE_TRANSLATOR ? "Improve the mapped Translator without changing its identity or operational fields." : "Do not create a generic category clone."}`,
      categoryOptions: categories,
      relatedTranslators: related.map((item) => ({ name: item.name, slug: item.slug, categories: item.categories.map((entry) => entry.category.slug) })),
      representativePins: Array.isArray(evidence.representativePins) ? (evidence.representativePins as TranslatorGenerationRequest["representativePins"]).slice(0, 12) : [],
      currentTranslator: current ? snapshotToDraft(current.snapshot) : null,
    },
  };
}

async function updateFailure(decisionId: string, status: GrowthDecisionStatus, reason: string) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.growthDecision.findUniqueOrThrow({ where: { id: decisionId } });
    const decision = await tx.growthDecision.update({
      where: { id: decisionId },
      data: { status, reasonCodes: { push: reason }, completedAt: status === GrowthDecisionStatus.FAILED_TERMINAL ? new Date() : null },
    });
    if (decision.opportunityId && status === GrowthDecisionStatus.WAITING_DATA) {
      await tx.growthOpportunity.updateMany({ where: { id: decision.opportunityId, status: { in: [GrowthOpportunityStatus.EVALUATING, GrowthOpportunityStatus.FAILED_RETRYABLE] } }, data: { status: GrowthOpportunityStatus.DEFERRED } });
    }
    if (decision.opportunityId && status === GrowthDecisionStatus.FAILED_RETRYABLE) {
      await tx.growthOpportunity.updateMany({ where: { id: decision.opportunityId, status: GrowthOpportunityStatus.EVALUATING }, data: { status: GrowthOpportunityStatus.FAILED_RETRYABLE } });
    }
    if (decision.opportunityId && status === GrowthDecisionStatus.FAILED_TERMINAL) {
      await tx.growthOpportunity.updateMany({ where: { id: decision.opportunityId, status: { in: [GrowthOpportunityStatus.EVALUATING, GrowthOpportunityStatus.FAILED_RETRYABLE] } }, data: { status: GrowthOpportunityStatus.FAILED_TERMINAL, closedAt: new Date() } });
    }
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.WORKER,
      entityType: "GrowthDecision",
      entityId: decisionId,
      action: status === GrowthDecisionStatus.WAITING_DATA ? "DECISION_WAITING_DATA" : "DECISION_FAILED",
      fromState: before.status,
      toState: status,
      summary: { reason },
      correlationKey: before.idempotencyKey,
    }, tx);
  });
}

async function persistGenerationMetadata(decisionId: string, attempts: TranslatorGenerationMetadata[]) {
  if (!attempts.length) return;
  const metadata = aggregateGenerationMetadata(attempts);
  await prisma.growthDecision.update({
    where: { id: decisionId },
    data: {
      aiProvider: metadata.provider,
      aiModel: metadata.model,
      aiResponseId: metadata.responseId,
      aiPromptTokens: metadata.promptTokens,
      aiCompletionTokens: metadata.completionTokens,
      aiTotalTokens: metadata.totalTokens,
      actualOutcome: json({ generationAttempts: metadata.attemptCount, generationStatus: "IN_PROGRESS" }),
    },
  });
}

function mergeOperationalFields(input: TranslatorUpsertInput, current: TranslatorSnapshot | null, categoryId: string) {
  return {
    ...input,
    name: current?.name || input.name,
    slug: current?.slug || input.slug,
    isActive: false,
    isFeatured: false,
    showModeSelector: true,
    showSwap: true,
    showExamples: true,
    sortOrder: 0,
    modelOverride: "",
    categoryIds: [categoryId],
    primaryCategoryId: categoryId,
  } satisfies TranslatorUpsertInput;
}

async function executeTranslatorDecisionAttempt(
  decisionId: string,
  options: ExecuteOptions = {},
) {
  const claimed = await prisma.growthDecision.updateMany({
    where: { id: decisionId, status: { in: [GrowthDecisionStatus.PROPOSED, GrowthDecisionStatus.VALIDATING, GrowthDecisionStatus.FAILED_RETRYABLE] }, type: { in: [GrowthDecisionType.CREATE_TRANSLATOR, GrowthDecisionType.IMPROVE_TRANSLATOR] } },
    data: { status: GrowthDecisionStatus.EXECUTING },
  });
  if (claimed.count === 0) {
    const existing = await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } });
    if (existing.status === GrowthDecisionStatus.COMPLETED) {
      const version = await prisma.growthContentVersion.findFirst({ where: { decisionId }, orderBy: { version: "desc" } });
      if (version && (version.sideEffectStatus === GrowthContentSideEffectStatus.PENDING || version.sideEffectStatus === GrowthContentSideEffectStatus.FAILED_RETRYABLE)) {
        await reconcileShareImage(version.id, options.refreshShareImage || defaultShareImageRefresher, true);
      }
    }
    return { decision: existing, reused: true };
  }

  const prepared = await loadGenerationRequest(decisionId);
  const provider = options.provider || new OpenAITranslatorGenerationProvider();
  const beforeChecksum = prepared.current?.checksum || null;
  if (prepared.decision.type === GrowthDecisionType.IMPROVE_TRANSLATOR && (!prepared.current || !prepared.expectedTargetChecksum || prepared.current.checksum !== prepared.expectedTargetChecksum)) {
    await updateFailure(decisionId, GrowthDecisionStatus.WAITING_DATA, DECISION_REASON.TARGET_CHANGED);
    return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), translatorId: prepared.decision.translatorId, reused: false, blocked: true };
  }
  let generated;
  let repairAttempted = false;
  const attemptMetadata: TranslatorGenerationMetadata[] = [];
  try {
    generated = await provider.generate(prepared.request);
    attemptMetadata.push(generated.metadata);
    await persistGenerationMetadata(decisionId, attemptMetadata);
  } catch (error) {
    const failedMetadata = generationMetadataFromError(error);
    if (failedMetadata) attemptMetadata.push(failedMetadata);
    await persistGenerationMetadata(decisionId, attemptMetadata);
    repairAttempted = true;
    try {
      generated = await provider.generate(prepared.request, { attempt: 1, issue: error instanceof Error ? error.message : "Generated output was invalid." });
      attemptMetadata.push(generated.metadata);
      await persistGenerationMetadata(decisionId, attemptMetadata);
    } catch (repairError) {
      const repairMetadata = generationMetadataFromError(repairError);
      if (repairMetadata) attemptMetadata.push(repairMetadata);
      await persistGenerationMetadata(decisionId, attemptMetadata);
      await updateFailure(decisionId, GrowthDecisionStatus.FAILED_RETRYABLE, "GENERATION_FAILED");
      throw new RetryableGrowthJobError(repairError instanceof Error ? repairError.message : "Translator generation failed.");
    }
  }

  const allCategories = await prisma.category.findMany({ select: { id: true, name: true, slug: true, isActive: true, archivedAt: true }, orderBy: { slug: "asc" }, take: 200 });
  const suggested = generated.draft.categorySuggestion || prepared.current?.snapshot.categories.find((item) => item.id === prepared.current?.snapshot.primaryCategoryId)?.slug || "";
  let category = resolveCategory(suggested, allCategories);
  if (category.status !== "RESOLVED") {
    await updateFailure(decisionId, GrowthDecisionStatus.WAITING_DATA, category.status === "AMBIGUOUS" ? DECISION_REASON.CATEGORY_AMBIGUOUS : DECISION_REASON.CATEGORY_UNAVAILABLE);
    return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
  }

  let input = draftToTranslatorInput({ draft: generated.draft, categoryIds: [category.category.id], primaryCategoryId: category.category.id });
  input = mergeOperationalFields(input, prepared.current?.snapshot || null, category.category.id);
  const activeCategoryIds = new Set(allCategories.filter((item) => item.isActive && !item.archivedAt).map((item) => item.id));
  let quality = validateTranslatorQuality(input, { activeCategoryIds, previous: prepared.current ? snapshotToTranslatorInput(prepared.current.snapshot) : null });
  if (!quality.valid) {
    if (repairAttempted) {
      await updateFailure(decisionId, GrowthDecisionStatus.FAILED_TERMINAL, "QUALITY_VALIDATION_FAILED");
      return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
    }
    repairAttempted = true;
    try {
      generated = await provider.generate(prepared.request, { attempt: 1, issue: quality.diagnostics.map((item) => item.code).join(", ") });
      attemptMetadata.push(generated.metadata);
      await persistGenerationMetadata(decisionId, attemptMetadata);
      const repairedCategory = resolveCategory(generated.draft.categorySuggestion || suggested, allCategories);
      if (repairedCategory.status !== "RESOLVED") throw new Error(`Category resolution failed: ${repairedCategory.status}`);
      category = repairedCategory;
      input = mergeOperationalFields(draftToTranslatorInput({ draft: generated.draft, categoryIds: [repairedCategory.category.id], primaryCategoryId: repairedCategory.category.id }), prepared.current?.snapshot || null, repairedCategory.category.id);
      quality = validateTranslatorQuality(input, { activeCategoryIds, previous: prepared.current ? snapshotToTranslatorInput(prepared.current.snapshot) : null });
    } catch (error) {
      await updateFailure(decisionId, GrowthDecisionStatus.FAILED_TERMINAL, "QUALITY_REPAIR_FAILED");
      return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true, error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (!quality.valid) {
    await updateFailure(decisionId, GrowthDecisionStatus.FAILED_TERMINAL, "QUALITY_VALIDATION_FAILED");
    return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), reused: false, blocked: true };
  }
  const aiMetadata = aggregateGenerationMetadata(attemptMetadata);

  if (prepared.decision.type === GrowthDecisionType.CREATE_TRANSLATOR) {
    const candidates = await prisma.translator.findMany({
      select: { id: true, name: true, slug: true, promptInstructions: true, sourceLabel: true, targetLabel: true, archivedAt: true, categories: { select: { category: { select: { slug: true } } } } },
      orderBy: [{ archivedAt: "asc" }, { slug: "asc" }],
      take: MAX_DEDUPE_CANDIDATES + 1,
    });
    if (candidates.length > MAX_DEDUPE_CANDIDATES) {
      await updateFailure(decisionId, GrowthDecisionStatus.WAITING_DATA, DECISION_REASON.DEDUPE_CORPUS_TRUNCATED);
      return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), blocked: true };
    }
    const duplicate = classifyTranslatorDuplicate(
      { name: input.name, slug: input.slug, promptPurpose: input.promptInstructions, sourceLabel: input.sourceLabel, targetLabel: input.targetLabel, categorySlugs: [category.category.slug], archivedAt: null },
      candidates.map((item) => ({ id: item.id, name: item.name, slug: item.slug, promptPurpose: item.promptInstructions, sourceLabel: item.sourceLabel, targetLabel: item.targetLabel, archivedAt: item.archivedAt, categorySlugs: item.categories.map((entry) => entry.category.slug) })),
    );
    if (["EXACT_DUPLICATE", "NEAR_DUPLICATE"].includes(duplicate.classification)) {
      if (duplicate.match && !duplicate.match.archivedAt) {
        const redirectedTarget = await readTranslatorSnapshot(duplicate.match.id);
        const redirectedEvidence = { ...(prepared.decision.evidence as Record<string, unknown>), targetChecksum: redirectedTarget?.checksum || null };
        const redirected = await prisma.growthDecision.update({ where: { id: decisionId }, data: { type: GrowthDecisionType.IMPROVE_TRANSLATOR, translatorId: duplicate.match.id, status: GrowthDecisionStatus.PROPOSED, evidence: json(redirectedEvidence), reasonCodes: { push: DECISION_REASON.DUPLICATE_CREATE_BLOCKED } } });
        const execution = await ensureExecutionJob(redirected);
        return { decision: redirected, redirected: true, execution };
      }
      await updateFailure(decisionId, GrowthDecisionStatus.WAITING_DATA, DECISION_REASON.DUPLICATE_CREATE_BLOCKED);
      return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), blocked: true };
    }
  }

  if (options.beforeApply) await options.beforeApply();

  const settingsBeforeApply = await prisma.growthSettings.findUnique({ where: { id: GROWTH_SETTINGS_ID }, select: { enabled: true } });
  if (!settingsBeforeApply?.enabled) {
    await updateFailure(decisionId, GrowthDecisionStatus.FAILED_RETRYABLE, DECISION_REASON.GROWTH_DISABLED_BEFORE_APPLY);
    throw new RetryableGrowthJobError("Growth was disabled after generation and before Translator mutation.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const settingsRows = await tx.$queryRaw<Array<{ enabled: boolean }>>`SELECT "enabled" FROM "GrowthSettings" WHERE "id" = ${GROWTH_SETTINGS_ID} FOR SHARE`;
    if (!settingsRows[0]?.enabled) throw new ExecutionBlockedError(GrowthDecisionStatus.FAILED_RETRYABLE, DECISION_REASON.GROWTH_DISABLED_BEFORE_APPLY);
    const decision = await tx.growthDecision.findUniqueOrThrow({ where: { id: decisionId } });
    if (decision.status !== GrowthDecisionStatus.EXECUTING || (decision.type !== GrowthDecisionType.CREATE_TRANSLATOR && decision.type !== GrowthDecisionType.IMPROVE_TRANSLATOR)) {
      if (decision.opportunityId && decision.status === GrowthDecisionStatus.CANCELLED) {
        await tx.growthOpportunity.updateMany({ where: { id: decision.opportunityId, status: GrowthOpportunityStatus.EVALUATING }, data: { status: GrowthOpportunityStatus.CANCELLED, closedAt: new Date() } });
      } else if (decision.opportunityId && (decision.status === GrowthDecisionStatus.WAITING_DATA || decision.status === GrowthDecisionStatus.REJECTED)) {
        await tx.growthOpportunity.updateMany({ where: { id: decision.opportunityId, status: GrowthOpportunityStatus.EVALUATING }, data: { status: GrowthOpportunityStatus.DEFERRED } });
      }
      return { decision, version: null, translatorId: decision.translatorId, reused: true };
    }
    if (decision.opportunityId) {
      const source = await tx.growthOpportunity.findUnique({ where: { id: decision.opportunityId }, select: { status: true } });
      if (!source || (source.status !== GrowthOpportunityStatus.EVALUATING && source.status !== GrowthOpportunityStatus.FAILED_RETRYABLE)) {
        throw new ExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, DECISION_REASON.SOURCE_OPPORTUNITY_CHANGED);
      }
    }
    const safeCategories = await tx.category.findMany({ where: { id: { in: input.categoryIds }, isActive: true, archivedAt: null }, select: { id: true } });
    if (safeCategories.length !== input.categoryIds.length || !input.primaryCategoryId || !safeCategories.some((item) => item.id === input.primaryCategoryId)) {
      throw new ExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, DECISION_REASON.CATEGORY_CHANGED_BEFORE_APPLY);
    }
    let translatorId = decision.translatorId;
    let beforeSnapshot: TranslatorSnapshot | null = null;

    if (decision.type === GrowthDecisionType.CREATE_TRANSLATOR) {
      const existingMutation = await tx.growthContentVersion.findUnique({ where: { mutationKey: actionKey(decisionId, decision.type) } });
      if (existingMutation) return { decision, version: existingMutation, translatorId: existingMutation.translatorId, reused: true };
      await tx.$queryRaw`SELECT 1::int AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtext('growth-translator-create-v1'))) AS "acquired"`;
      const currentCandidates = await tx.translator.findMany({
        select: { id: true, name: true, slug: true, promptInstructions: true, sourceLabel: true, targetLabel: true, archivedAt: true, categories: { select: { category: { select: { slug: true } } } } },
        orderBy: [{ archivedAt: "asc" }, { slug: "asc" }],
        take: MAX_DEDUPE_CANDIDATES + 1,
      });
      if (currentCandidates.length > MAX_DEDUPE_CANDIDATES) throw new ExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, DECISION_REASON.DEDUPE_CORPUS_TRUNCATED);
      const selectedCategorySlug = allCategories.find((item) => item.id === input.primaryCategoryId)?.slug || "";
      const currentDuplicate = classifyTranslatorDuplicate(
        { name: input.name, slug: input.slug, promptPurpose: input.promptInstructions, sourceLabel: input.sourceLabel, targetLabel: input.targetLabel, categorySlugs: [selectedCategorySlug], archivedAt: null },
        currentCandidates.map((item) => ({ id: item.id, name: item.name, slug: item.slug, promptPurpose: item.promptInstructions, sourceLabel: item.sourceLabel, targetLabel: item.targetLabel, archivedAt: item.archivedAt, categorySlugs: item.categories.map((entry) => entry.category.slug) })),
      );
      if (["EXACT_DUPLICATE", "NEAR_DUPLICATE"].includes(currentDuplicate.classification)) {
        throw new ExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, DECISION_REASON.DUPLICATE_CREATE_BLOCKED);
      }
      const finalQuality = validateTranslatorQuality(input, { activeCategoryIds: new Set(safeCategories.map((item) => item.id)) });
      if (!finalQuality.valid) throw new ExecutionBlockedError(GrowthDecisionStatus.FAILED_TERMINAL, "QUALITY_CHANGED_BEFORE_APPLY");
      const created = await tx.translator.create({
        data: {
          ...scalarData({ ...input, isActive: false }),
          isActive: false,
          isFeatured: false,
          featuredRank: null,
          featuredSource: "MANUAL",
          modelOverride: null,
          shareImagePath: null,
          shareImageHash: null,
          shareImageUpdatedAt: null,
          ...nestedCreate({ ...input, isActive: false }),
        },
      });
      translatorId = created.id;
    } else {
      if (!translatorId || !beforeChecksum) throw new Error("Improvement target is unavailable.");
      await tx.$queryRaw`SELECT "id" FROM "Translator" WHERE "id" = ${translatorId} FOR UPDATE`;
      const current = await readTranslatorSnapshot(translatorId, tx);
      if (!current || current.checksum !== beforeChecksum) {
        throw new ExecutionBlockedError(GrowthDecisionStatus.WAITING_DATA, DECISION_REASON.TARGET_CHANGED);
      }
      const finalQuality = validateTranslatorQuality(input, { activeCategoryIds: new Set(safeCategories.map((item) => item.id)), previous: snapshotToTranslatorInput(current.snapshot) });
      if (!finalQuality.valid) throw new ExecutionBlockedError(GrowthDecisionStatus.FAILED_TERMINAL, "QUALITY_CHANGED_BEFORE_APPLY");
      beforeSnapshot = current.snapshot;
      await replaceTranslator(tx, translatorId, { ...input, name: current.snapshot.name, slug: current.snapshot.slug });
    }

    if (!translatorId) throw new Error("Translator mutation did not produce a target.");
    const after = await readTranslatorSnapshot(translatorId, tx);
    if (!after) throw new Error("Translator snapshot could not be created.");
    assertSnapshotBound(after.snapshot);
    const refreshRequired = needsShareImageRefresh(beforeSnapshot, after.snapshot);
    const version = await tx.growthContentVersion.create({
      data: {
        translatorId,
        decisionId,
        jobId: options.jobId || null,
        version: await nextVersion(tx, translatorId),
        action: decision.type === GrowthDecisionType.CREATE_TRANSLATOR ? GrowthContentVersionAction.CREATE : GrowthContentVersionAction.IMPROVE,
        actorKind: GrowthActivityActorKind.WORKER,
        decisionModelVersion: decision.decisionModelVersion,
        qualityModelVersion: decision.qualityModelVersion,
        dedupeModelVersion: decision.dedupeModelVersion,
        sideEffectStatus: refreshRequired ? GrowthContentSideEffectStatus.PENDING : GrowthContentSideEffectStatus.NOT_REQUIRED,
        sideEffectCompletedAt: refreshRequired ? null : new Date(),
        beforeSnapshot: beforeSnapshot ? json(beforeSnapshot) : undefined,
        afterSnapshot: json(after.snapshot),
        reason: decision.reasonCodes.join(", ").slice(0, 500),
        checksum: after.checksum,
        mutationKey: actionKey(decisionId, decision.type),
      },
    });
    const completed = await tx.growthDecision.update({
      where: { id: decisionId },
      data: {
        status: GrowthDecisionStatus.COMPLETED,
        translatorId,
        completedAt: new Date(),
        aiProvider: aiMetadata.provider,
        aiModel: aiMetadata.model,
        aiResponseId: aiMetadata.responseId,
        aiPromptTokens: aiMetadata.promptTokens,
        aiCompletionTokens: aiMetadata.completionTokens,
        aiTotalTokens: aiMetadata.totalTokens,
        actualOutcome: json({ action: version.action, version: version.version, checksum: version.checksum, changedFields: quality.changedFields.slice(0, 30), generationAttempts: aiMetadata.attemptCount, shareImageStatus: version.sideEffectStatus }),
      },
    });
    if (decision.opportunityId) {
      await tx.growthOpportunity.updateMany({ where: { id: decision.opportunityId, status: { in: [GrowthOpportunityStatus.EVALUATING, GrowthOpportunityStatus.FAILED_RETRYABLE] } }, data: { status: GrowthOpportunityStatus.ACTIONED, closedAt: new Date() } });
    }
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "Translator", entityId: translatorId, action: version.action === GrowthContentVersionAction.CREATE ? "TRANSLATOR_CREATED" : "TRANSLATOR_IMPROVED", summary: { decisionId, versionId: version.id, version: version.version, checksum: version.checksum, changedFields: quality.changedFields.slice(0, 30), aiModel: aiMetadata.model, totalTokens: aiMetadata.totalTokens, generationAttempts: aiMetadata.attemptCount, shareImageStatus: version.sideEffectStatus }, correlationKey: decision.idempotencyKey }, tx);
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthDecision", entityId: decisionId, action: "DECISION_COMPLETED", fromState: GrowthDecisionStatus.EXECUTING, toState: GrowthDecisionStatus.COMPLETED, summary: { translatorId, versionId: version.id }, correlationKey: decision.idempotencyKey }, tx);
    return { decision: completed, version, translatorId, reused: false };
  });
  invalidatePublicTranslatorCaches();
  if (result.version?.sideEffectStatus === GrowthContentSideEffectStatus.PENDING) {
    await reconcileShareImage(result.version.id, options.refreshShareImage || defaultShareImageRefresher, true);
  }
  return result;
}

export async function executeTranslatorDecision(
  decisionId: string,
  options: ExecuteOptions = {},
) {
  try {
    return await executeTranslatorDecisionAttempt(decisionId, options);
  } catch (error) {
    const current = await prisma.growthDecision.findUnique({ where: { id: decisionId }, select: { status: true } });
    const uniqueConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (error instanceof ExecutionBlockedError && current?.status === GrowthDecisionStatus.EXECUTING) {
      await updateFailure(decisionId, error.status, error.reason);
      if (error.status === GrowthDecisionStatus.FAILED_RETRYABLE) throw new RetryableGrowthJobError(error.message);
      return { decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }), translatorId: null, reused: false, blocked: true };
    }
    if (current?.status === GrowthDecisionStatus.EXECUTING) {
      await updateFailure(
        decisionId,
        uniqueConflict ? GrowthDecisionStatus.WAITING_DATA : GrowthDecisionStatus.FAILED_RETRYABLE,
        uniqueConflict ? DECISION_REASON.CREATE_SLUG_COLLISION : "EXECUTION_FAILED",
      );
    }
    if (uniqueConflict) {
      return {
        decision: await prisma.growthDecision.findUniqueOrThrow({ where: { id: decisionId } }),
        translatorId: null,
        reused: false,
        blocked: true,
      };
    }
    if (error instanceof RetryableGrowthJobError) throw error;
    throw new RetryableGrowthJobError(error instanceof Error ? error.message : "Translator execution failed.");
  }
}

async function restoreSnapshot(tx: Tx, translatorId: string, snapshot: TranslatorSnapshot) {
  const parsed = translatorSnapshotSchema.parse(snapshot);
  await replaceTranslator(tx, translatorId, snapshotToTranslatorInput(parsed));
}

export async function rollbackTranslatorVersion(params: {
  translatorId: string;
  targetVersionId: string;
  actorUserId?: string | null;
  expectedCurrentChecksum: string;
  refreshShareImage?: TranslatorShareImageRefresher;
}) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Translator" WHERE "id" = ${params.translatorId} FOR UPDATE`;
    const target = await tx.growthContentVersion.findFirst({ where: { id: params.targetVersionId, translatorId: params.translatorId } });
    if (!target) throw new Error("The selected version does not belong to this Translator.");
    const current = await readTranslatorSnapshot(params.translatorId, tx);
    if (!current) throw new Error("Translator no longer exists.");
    if (params.expectedCurrentChecksum !== current.checksum) throw new Error("Translator changed before rollback could be applied.");
    const targetSnapshot = translatorSnapshotSchema.parse(target.afterSnapshot);
    const diagnostics: Array<{ code: string; message: string }> = [];
    if (targetSnapshot.slug !== current.snapshot.slug) diagnostics.push({ code: "SNAPSHOT_SLUG_MISMATCH", message: "Stored snapshot slug does not match the current Translator identity." });
    if (targetSnapshot.name !== current.snapshot.name) diagnostics.push({ code: "SNAPSHOT_NAME_MISMATCH", message: "Stored snapshot name does not match the current Translator identity." });
    const targetCategoryIds = targetSnapshot.categories.map((item) => item.id);
    if (!targetSnapshot.primaryCategoryId || !targetCategoryIds.includes(targetSnapshot.primaryCategoryId)) diagnostics.push({ code: "PRIMARY_CATEGORY_INVALID", message: "Stored primary category is absent from the stored category set." });
    const safeCategories = await tx.category.findMany({ where: { id: { in: targetCategoryIds }, isActive: true, archivedAt: null }, select: { id: true } });
    if (safeCategories.length !== targetCategoryIds.length) diagnostics.push({ code: "HISTORICAL_CATEGORY_UNAVAILABLE", message: "One or more stored categories are missing, inactive, or archived." });
    if (diagnostics.length) throw new RollbackValidationError(diagnostics);
    const targetChecksum = checksumTranslatorSnapshot(targetSnapshot);
    if (current.checksum === targetChecksum) return { changed: false, translatorId: params.translatorId, version: null, checksum: current.checksum };
    const mutationKey = `translator-rollback:${params.translatorId}:${params.targetVersionId}:${current.checksum}`;
    const existing = await tx.growthContentVersion.findUnique({ where: { mutationKey } });
    if (existing) return { changed: false, translatorId: params.translatorId, version: existing, checksum: existing.checksum };
    await restoreSnapshot(tx, params.translatorId, targetSnapshot);
    const restored = await readTranslatorSnapshot(params.translatorId, tx);
    if (!restored || restored.checksum !== targetChecksum) throw new Error("Rollback checksum verification failed.");
    const version = await tx.growthContentVersion.create({
      data: {
        translatorId: params.translatorId,
        sourceVersionId: target.id,
        version: await nextVersion(tx, params.translatorId),
        action: GrowthContentVersionAction.ROLLBACK,
        actorKind: params.actorUserId ? GrowthActivityActorKind.USER : GrowthActivityActorKind.SYSTEM,
        decisionModelVersion: TRANSLATOR_AUTOPILOT_VERSION,
        qualityModelVersion: TRANSLATOR_QUALITY_VERSION,
        dedupeModelVersion: TRANSLATOR_DEDUPE_VERSION,
        sideEffectStatus: needsShareImageRefresh(current.snapshot, restored.snapshot) ? GrowthContentSideEffectStatus.PENDING : GrowthContentSideEffectStatus.NOT_REQUIRED,
        sideEffectCompletedAt: needsShareImageRefresh(current.snapshot, restored.snapshot) ? null : new Date(),
        beforeSnapshot: json(current.snapshot),
        afterSnapshot: json(restored.snapshot),
        reason: `Rollback to trusted version ${target.version}`,
        checksum: restored.checksum,
        mutationKey,
      },
    });
    await recordGrowthActivity({ actorKind: params.actorUserId ? GrowthActivityActorKind.USER : GrowthActivityActorKind.SYSTEM, actorUserId: params.actorUserId, entityType: "Translator", entityId: params.translatorId, action: "TRANSLATOR_ROLLED_BACK", summary: { targetVersionId: target.id, createdVersionId: version.id, version: version.version, checksum: version.checksum }, correlationKey: mutationKey }, tx);
    return { changed: true, translatorId: params.translatorId, version, checksum: restored.checksum };
  });
  invalidatePublicTranslatorCaches();
  if (result.version?.sideEffectStatus === GrowthContentSideEffectStatus.PENDING) {
    const reconciled = await reconcileShareImage(result.version.id, params.refreshShareImage || defaultShareImageRefresher, false);
    return { ...result, version: reconciled, sideEffectWarning: reconciled.sideEffectStatus === GrowthContentSideEffectStatus.FAILED_RETRYABLE ? reconciled.sideEffectError : null };
  }
  return { ...result, sideEffectWarning: null };
}
