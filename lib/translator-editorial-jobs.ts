import { Prisma, TranslatorEditorialDraftStatus, TranslatorEditorialJobItemStatus, TranslatorEditorialJobType } from "@prisma/client";

import { getAdminTranslatorIdsForBulk, type AdminTranslatorFilters } from "@/lib/translator-editorial-data";
import { getAppSettings } from "@/lib/settings";
import { generateTranslatorEditorialContent } from "@/lib/translator-editorial";
import type { TranslatorEditorialDraft } from "@/lib/types";
import { translatorDraftSchema } from "@/lib/validators";
import { prisma } from "@/lib/prisma";
import { mergeEditorialDraft, validateEditorialDraft } from "@/lib/editorial-job-utils";

export { getMissingEditorialSections, mergeEditorialDraft, validateEditorialDraft } from "@/lib/editorial-job-utils";

const MAX_ATTEMPTS = 3;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRY_BASE_MS = 1500;

export type EditorialJobOperation = keyof typeof TranslatorEditorialJobType;

export interface EditorialJobFilters extends AdminTranslatorFilters {
  activeOnly?: boolean;
  incompleteOnly?: boolean;
}

export interface EditorialJobProgress {
  totalItems: number;
  succeededItems: number;
  failedItems: number;
  skippedItems: number;
  pendingItems: number;
  processingItems: number;
}

function asOperation(value: string): TranslatorEditorialJobType {
  const operation = value.replaceAll("-", "_").toUpperCase() as TranslatorEditorialJobType;
  if (!Object.values(TranslatorEditorialJobType).includes(operation)) {
    throw new Error("Unsupported editorial generation operation.");
  }
  return operation;
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function currentEditorialDraft(translator: {
  editorialContent: { about: string | null; whatItDoes: string | null; differenceDescription: string | null } | null;
  editorialLists: Array<{ kind: string; content: string }>;
  editorialExamples: Array<{ contextTitle: string | null; originalText: string; transformedText: string }>;
  editorialFaqs: Array<{ question: string; answer: string }>;
}): TranslatorEditorialDraft {
  return {
    about: translator.editorialContent?.about || "",
    whatItDoes: translator.editorialContent?.whatItDoes || "",
    differenceDescription: translator.editorialContent?.differenceDescription || "",
    bestUses: translator.editorialLists.filter((item) => item.kind === "BEST_USE").map((item) => item.content),
    howToUse: translator.editorialLists.filter((item) => item.kind === "HOW_TO_USE").map((item) => item.content),
    tips: translator.editorialLists.filter((item) => item.kind === "TIP").map((item) => item.content),
    examples: translator.editorialExamples.map((item) => ({
      contextTitle: item.contextTitle || "",
      originalText: item.originalText,
      transformedText: item.transformedText,
    })),
    faq: translator.editorialFaqs.map((item) => ({ question: item.question, answer: item.answer })),
  };
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return "Editorial generation failed.";
  const message = error.message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500);
  return message || "Editorial generation failed.";
}

function isRetryable(error: unknown) {
  const candidate = error as { status?: number; code?: string; message?: string };
  const message = candidate.message?.toLowerCase() || "";
  return candidate.status === 429 || candidate.status === 408 || Boolean(candidate.status && candidate.status >= 500) || /timeout|network|fetch|temporar|rate limit|429|malformed|valid json|validation/.test(message);
}

function retryDelay(attempt: number) {
  const configured = Number(process.env.TRANSLATOR_EDITORIAL_RETRY_BASE_MS || DEFAULT_RETRY_BASE_MS);
  return Math.min(30_000, Math.max(250, configured) * 2 ** Math.max(0, attempt - 1));
}

export async function createEditorialJob(params: {
  operation: string;
  translatorIds?: string[];
  selectAllMatching?: boolean;
  filters?: EditorialJobFilters;
  requestedById?: string | null;
}) {
  const operation = asOperation(params.operation);
  let translatorIds = params.selectAllMatching
    ? await getAdminTranslatorIdsForBulk({ ...(params.filters || {}), status: params.filters?.activeOnly ? "active" : params.filters?.status })
    : Array.from(new Set(params.translatorIds || []));

  if (params.filters?.activeOnly || params.filters?.incompleteOnly) {
    const rows = await prisma.translator.findMany({
      where: {
        id: { in: translatorIds },
        archivedAt: null,
        ...(params.filters.activeOnly ? { isActive: true } : {}),
      },
      select: { id: true },
    });
    translatorIds = rows.map((row) => row.id);
  }

  if (!translatorIds.length) throw new Error("No translators match this selection.");

  const existing = await prisma.translatorEditorialJobItem.findMany({
    where: {
      translatorId: { in: translatorIds },
      operation,
      status: { in: ["PENDING", "PROCESSING"] },
      job: { status: { in: ["PENDING", "RUNNING", "PAUSED"] } },
    },
    select: { translatorId: true },
  });
  const duplicateIds = new Set(existing.map((item) => item.translatorId));
  translatorIds = translatorIds.filter((id) => !duplicateIds.has(id));
  if (!translatorIds.length) throw new Error("An identical active editorial job already covers these translators.");

  return prisma.translatorEditorialJob.create({
    data: {
      type: operation,
      requestedById: params.requestedById || null,
      configuration: toJson({ filters: params.filters || {}, selectionMode: params.selectAllMatching ? "matching" : "selected" }),
      totalItems: translatorIds.length,
      items: {
        createMany: {
          data: translatorIds.map((translatorId) => ({ translatorId, operation })),
        },
      },
    },
    select: { id: true, type: true, status: true, totalItems: true },
  });
}

export async function getEditorialJobProgress(id: string) {
  const job = await prisma.translatorEditorialJob.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      requestedBy: { select: { name: true, email: true } },
      createdAt: true,
      startedAt: true,
      completedAt: true,
      totalItems: true,
      succeededItems: true,
      failedItems: true,
      skippedItems: true,
      _count: { select: { items: true } },
      items: { select: { status: true, operation: true, attemptCount: true, lastError: true, translator: { select: { name: true, slug: true } } } },
    },
  });
  if (!job) return null;
  const counts = job.items.reduce((result, item) => {
    result[item.status] = (result[item.status] || 0) + 1;
    return result;
  }, {} as Record<string, number>);
  const { items: jobItems, ...jobSummary } = job;
  return {
    ...jobSummary,
    requestedBy: job.requestedBy?.name || job.requestedBy?.email || "Unknown",
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() || null,
    completedAt: job.completedAt?.toISOString() || null,
    progress: {
      totalItems: job.totalItems,
      succeededItems: job.succeededItems,
      failedItems: job.failedItems,
      skippedItems: job.skippedItems,
      pendingItems: counts.PENDING || 0,
      processingItems: counts.PROCESSING || 0,
    } satisfies EditorialJobProgress,
    failedItemsDetail: jobItems.filter((item) => item.status === "FAILED").map((item) => ({
      translator: item.translator,
      operation: item.operation,
      attemptCount: item.attemptCount,
      error: item.lastError || "Editorial generation failed.",
    })),
  };
}

async function refreshJobCounters(jobId: string) {
  const counts = await prisma.translatorEditorialJobItem.groupBy({ by: ["status"], where: { jobId }, _count: { _all: true } });
  const values = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
  const remaining = (values.PENDING || 0) + (values.PROCESSING || 0);
  const job = await prisma.translatorEditorialJob.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!job) return;
  const nextStatus = job.status === "CANCELLED" || job.status === "PAUSED"
    ? job.status
    : remaining > 0
      ? "RUNNING"
      : (values.FAILED || 0) > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
  await prisma.translatorEditorialJob.update({
    where: { id: jobId },
    data: {
      status: nextStatus,
      succeededItems: values.GENERATED || 0,
      failedItems: values.FAILED || 0,
      skippedItems: (values.SKIPPED || 0) + (values.CANCELLED || 0),
      completedAt: remaining === 0 && nextStatus !== "PAUSED" ? new Date() : null,
    },
  });
}

export async function updateEditorialJobStatus(id: string, action: "pause" | "resume" | "cancel") {
  const job = await prisma.translatorEditorialJob.findUnique({ where: { id }, select: { status: true } });
  if (!job) throw new Error("Editorial job not found.");
  if (action === "pause") {
    if (!["PENDING", "RUNNING"].includes(job.status)) throw new Error("Only pending or running jobs can be paused.");
    return prisma.translatorEditorialJob.update({ where: { id }, data: { status: "PAUSED" } });
  }
  if (action === "resume") {
    if (job.status !== "PAUSED") throw new Error("Only paused jobs can be resumed.");
    return prisma.translatorEditorialJob.update({ where: { id }, data: { status: "RUNNING", completedAt: null } });
  }
  if (["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"].includes(job.status)) throw new Error("This job is already finished.");
  await prisma.$transaction([
    prisma.translatorEditorialJobItem.updateMany({ where: { jobId: id, status: "PENDING" }, data: { status: "CANCELLED", completedAt: new Date() } }),
    prisma.translatorEditorialJob.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } }),
  ]);
  await refreshJobCounters(id);
  return prisma.translatorEditorialJob.findUniqueOrThrow({ where: { id } });
}

export async function retryFailedEditorialJobItems(id: string) {
  const result = await prisma.translatorEditorialJobItem.updateMany({
    where: { jobId: id, status: "FAILED" },
    data: { status: "PENDING", attemptCount: 0, lastError: null, completedAt: null },
  });
  if (result.count) await prisma.translatorEditorialJob.update({ where: { id }, data: { status: "RUNNING", completedAt: null } });
  return result.count;
}

export async function listEditorialJobs(limit = 50) {
  const jobs = await prisma.translatorEditorialJob.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, limit)),
    select: {
      id: true, type: true, status: true, createdAt: true, startedAt: true, completedAt: true,
      totalItems: true, succeededItems: true, failedItems: true, skippedItems: true,
      requestedBy: { select: { name: true, email: true } },
    },
  });
  return jobs.map((job) => ({
    ...job,
    requestedBy: job.requestedBy?.name || job.requestedBy?.email || "Unknown",
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() || null,
    completedAt: job.completedAt?.toISOString() || null,
  }));
}

export async function listEditorialDrafts(status?: "NEEDS_REVIEW" | "APPROVED" | "DISCARDED" | "PUBLISHED") {
  const drafts = await prisma.translatorEditorialDraft.findMany({
    where: status ? { status } : { status: { in: ["NEEDS_REVIEW", "APPROVED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, status: true, payload: true, validation: true, generatedAt: true, reviewedAt: true, publishedAt: true,
      translator: { select: { id: true, name: true, slug: true } },
      jobItem: { select: { operation: true, attemptCount: true, lastError: true } },
    },
  });
  return drafts.map((draft) => ({
    ...draft,
    generatedAt: draft.generatedAt.toISOString(),
    reviewedAt: draft.reviewedAt?.toISOString() || null,
    publishedAt: draft.publishedAt?.toISOString() || null,
  }));
}

export async function getEditorialDraft(id: string) {
  return prisma.translatorEditorialDraft.findUnique({
    where: { id },
    select: {
      id: true, status: true, payload: true, validation: true, generatedAt: true, reviewedAt: true, publishedAt: true,
      translator: {
        select: {
          id: true, name: true, slug: true,
          editorialContent: true,
          editorialLists: { orderBy: { sortOrder: "asc" } },
          editorialExamples: { orderBy: { sortOrder: "asc" } },
          editorialFaqs: { orderBy: { sortOrder: "asc" } },
        },
      },
      jobItem: { select: { operation: true, attemptCount: true, lastError: true } },
    },
  });
}

export async function setEditorialDraftStatus(id: string, status: "APPROVED" | "DISCARDED", reviewedById: string) {
  return prisma.translatorEditorialDraft.update({
    where: { id },
    data: { status, reviewedById, reviewedAt: new Date(), discardedAt: status === "DISCARDED" ? new Date() : null },
  });
}

export async function updateEditorialDraftPayload(id: string, payload: unknown) {
  const parsed = translatorDraftSchema.shape.editorial.safeParse(payload);
  if (!parsed.success) throw new Error("Draft content is invalid. Fix the highlighted JSON before saving.");
  const validation = validateEditorialDraft(parsed.data);
  return prisma.translatorEditorialDraft.update({
    where: { id },
    data: { payload: toJson(parsed.data), validation: toJson(validation), status: "NEEDS_REVIEW", reviewedAt: null, publishedAt: null, discardedAt: null },
  });
}

export async function publishEditorialDraft(id: string, reviewedById: string) {
  const draft = await prisma.translatorEditorialDraft.findUnique({ where: { id }, select: { status: true, translatorId: true, payload: true } });
  if (!draft) throw new Error("Editorial draft not found.");
  if (draft.status !== "APPROVED") throw new Error("Approve the draft before publishing it.");
  const parsed = translatorDraftSchema.shape.editorial.safeParse(draft.payload);
  if (!parsed.success) throw new Error("This draft is no longer valid and cannot be published.");
  const payload = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.translatorEditorialContent.upsert({
      where: { translatorId: draft.translatorId },
      create: { translatorId: draft.translatorId, about: payload.about, whatItDoes: payload.whatItDoes, differenceDescription: payload.differenceDescription },
      update: { about: payload.about, whatItDoes: payload.whatItDoes, differenceDescription: payload.differenceDescription },
    });
    await tx.translatorEditorialList.deleteMany({ where: { translatorId: draft.translatorId } });
    await tx.translatorEditorialList.createMany({
      data: [
        ...payload.bestUses.map((content, index) => ({ translatorId: draft.translatorId, kind: "BEST_USE" as const, content, sortOrder: index + 1 })),
        ...payload.howToUse.map((content, index) => ({ translatorId: draft.translatorId, kind: "HOW_TO_USE" as const, content, sortOrder: index + 1 })),
        ...payload.tips.map((content, index) => ({ translatorId: draft.translatorId, kind: "TIP" as const, content, sortOrder: index + 1 })),
      ],
    });
    await tx.translatorEditorialExample.deleteMany({ where: { translatorId: draft.translatorId } });
    await tx.translatorEditorialExample.createMany({ data: payload.examples.map((item, index) => ({ translatorId: draft.translatorId, contextTitle: item.contextTitle || null, originalText: item.originalText, transformedText: item.transformedText, sortOrder: index + 1 })) });
    await tx.translatorEditorialFaq.deleteMany({ where: { translatorId: draft.translatorId } });
    await tx.translatorEditorialFaq.createMany({ data: payload.faq.map((item, index) => ({ translatorId: draft.translatorId, question: item.question, answer: item.answer, sortOrder: index + 1 })) });
    await tx.translatorEditorialDraft.update({ where: { id }, data: { status: "PUBLISHED", reviewedById, reviewedAt: new Date(), publishedAt: new Date() } });
  });
}

async function claimNextItem() {
  await prisma.translatorEditorialJob.updateMany({ where: { status: "PENDING" }, data: { status: "RUNNING", startedAt: new Date() } });
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "TranslatorEditorialJobItem" AS item
    SET "status" = 'PROCESSING', "attemptCount" = "attemptCount" + 1, "startedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE item."id" = (
      SELECT candidate."id"
      FROM "TranslatorEditorialJobItem" AS candidate
      INNER JOIN "TranslatorEditorialJob" AS job ON job."id" = candidate."jobId"
      WHERE candidate."status" = 'PENDING' AND job."status" = 'RUNNING'
      ORDER BY candidate."createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING item."id"
  `);
  return claimed[0]?.id || null;
}

async function recoverStaleItems() {
  const staleBefore = new Date(Date.now() - Math.max(60_000, Number(process.env.TRANSLATOR_EDITORIAL_STALE_ITEM_MS || 10 * 60_000)));
  await prisma.translatorEditorialJobItem.updateMany({
    where: { status: "PROCESSING", startedAt: { lt: staleBefore }, job: { status: "RUNNING" }, attemptCount: { lt: MAX_ATTEMPTS } },
    data: { status: "PENDING", startedAt: null },
  });
  const exhausted = await prisma.translatorEditorialJobItem.updateMany({
    where: { status: "PROCESSING", startedAt: { lt: staleBefore }, job: { status: "RUNNING" }, attemptCount: { gte: MAX_ATTEMPTS } },
    data: { status: "FAILED", lastError: "Worker reclaimed an item after repeated interrupted attempts.", completedAt: new Date() },
  });
  if (exhausted.count) {
    const activeJobs = await prisma.translatorEditorialJob.findMany({ where: { status: "RUNNING" }, select: { id: true } });
    await Promise.all(activeJobs.map((job) => refreshJobCounters(job.id)));
  }
}

async function processItem(itemId: string) {
  const item = await prisma.translatorEditorialJobItem.findUnique({
    where: { id: itemId },
    include: {
      job: true,
      translator: {
        select: {
          id: true, name: true, title: true, subtitle: true, shortDescription: true, promptSystem: true, promptInstructions: true, modelOverride: true, primaryCategoryId: true,
          categories: { select: { category: { select: { name: true } } } },
          editorialContent: { select: { about: true, whatItDoes: true, differenceDescription: true } },
          editorialLists: { select: { kind: true, content: true } },
          editorialExamples: { select: { contextTitle: true, originalText: true, transformedText: true } },
          editorialFaqs: { select: { question: true, answer: true } },
        },
      },
    },
  });
  if (!item) return;

  try {
    const settings = await getAppSettings();
    const current = currentEditorialDraft(item.translator);
    const generated = await generateTranslatorEditorialContent({
      model: settings.defaultModelOverride || item.translator.modelOverride || undefined,
      context: {
        name: item.translator.name,
        description: `${item.translator.title}. ${item.translator.subtitle} ${item.translator.shortDescription}`,
        category: item.translator.categories[0]?.category.name || item.translator.primaryCategoryId,
        tone: item.translator.promptSystem,
        style: item.translator.promptInstructions,
        promptSystem: item.translator.promptSystem,
        promptInstructions: item.translator.promptInstructions,
        existingAbout: current.about || item.translator.shortDescription,
        focus: item.operation === "GENERATE_MISSING" ? "the missing sections only" : item.operation.toLowerCase().replaceAll("_", " "),
      },
    });
    const merged = mergeEditorialDraft(current, generated, item.operation);
    const validation = validateEditorialDraft(merged);
    if (!validation.valid) throw new Error(`Generated editorial draft failed validation: ${validation.errors.slice(0, 2).join("; ")}`);

    await prisma.$transaction(async (tx) => {
      await tx.translatorEditorialDraft.upsert({
        where: { jobItemId: item.id },
        create: { jobItemId: item.id, translatorId: item.translatorId, payload: toJson(merged), validation: toJson(validation), status: TranslatorEditorialDraftStatus.NEEDS_REVIEW },
        update: { payload: toJson(merged), validation: toJson(validation), status: TranslatorEditorialDraftStatus.NEEDS_REVIEW, generatedAt: new Date(), reviewedAt: null, publishedAt: null, discardedAt: null },
      });
      await tx.translatorEditorialJobItem.update({ where: { id: item.id }, data: { status: TranslatorEditorialJobItemStatus.GENERATED, lastError: null, completedAt: new Date() } });
    });
  } catch (error) {
    const latest = await prisma.translatorEditorialJobItem.findUnique({ where: { id: item.id }, select: { attemptCount: true } });
    const attemptCount = latest?.attemptCount || MAX_ATTEMPTS;
    await prisma.translatorEditorialJobItem.update({
      where: { id: item.id },
      data: {
        status: attemptCount < MAX_ATTEMPTS && isRetryable(error) ? "PENDING" : "FAILED",
        lastError: safeError(error),
        completedAt: attemptCount < MAX_ATTEMPTS && isRetryable(error) ? null : new Date(),
      },
    });
    if (attemptCount < MAX_ATTEMPTS && isRetryable(error)) await new Promise((resolve) => setTimeout(resolve, retryDelay(attemptCount)));
  } finally {
    await refreshJobCounters(item.jobId);
  }
}

export async function runEditorialWorker(options: { once?: boolean } = {}) {
  const concurrency = Math.min(10, Math.max(1, Number(process.env.TRANSLATOR_EDITORIAL_CONCURRENCY || DEFAULT_CONCURRENCY)));
  console.log(`[editorial-worker] Polling PostgreSQL jobs (concurrency=${concurrency}, once=${options.once ? "yes" : "no"}).`);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  while (!stopping) {
    await recoverStaleItems();
    const itemIds = (await Promise.all(Array.from({ length: concurrency }, () => claimNextItem()))).filter(Boolean) as string[];
    if (!itemIds.length) {
      if (options.once) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    await Promise.all(itemIds.map((id) => processItem(id)));
    if (options.once) break;
  }
  await prisma.$disconnect();
}
