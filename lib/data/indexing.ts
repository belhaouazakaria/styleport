import { IndexingProvider, IndexingSource, IndexingStatus, Prisma } from "@prisma/client";

import { submitUrlToGoogleIndexing } from "@/lib/google-indexing";
import { logError, logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/env";
import type {
  AdminBulkIndexingSummary,
  AdminIndexingLogFilters,
  AdminIndexingLogListItem,
} from "@/lib/types";

function mapResultStatusToDb(status: "SUBMITTED" | "FAILED" | "SKIPPED" | "DRY_RUN") {
  if (status === "SUBMITTED") return IndexingStatus.SUBMITTED;
  if (status === "FAILED") return IndexingStatus.FAILED;
  if (status === "DRY_RUN") return IndexingStatus.DRY_RUN;
  return IndexingStatus.SKIPPED;
}

export function buildTranslatorPublicUrl(slug: string, options?: { requestUrl?: string }) {
  const baseUrl = getAppBaseUrl({ requestUrl: options?.requestUrl });
  return new URL(`/translators/${slug}`, baseUrl).toString();
}

export async function createIndexingLog(input: {
  translatorId?: string | null;
  url: string;
  source: IndexingSource;
  status: IndexingStatus;
  message?: string | null;
  responseJson?: Prisma.InputJsonValue | null;
}) {
  return prisma.indexingLog.create({
    data: {
      translatorId: input.translatorId || null,
      url: input.url,
      source: input.source,
      status: input.status,
      provider: IndexingProvider.GOOGLE_INDEXING_API,
      message: input.message || null,
      responseJson: input.responseJson ?? undefined,
    },
  });
}

export async function submitTranslatorToGoogleIndexing(input: {
  translatorId: string;
  slug: string;
  source: IndexingSource;
  requestUrl?: string;
}) {
  const publicUrl = buildTranslatorPublicUrl(input.slug, { requestUrl: input.requestUrl });
  const result = await submitUrlToGoogleIndexing(publicUrl);

  const logEntry = await createIndexingLog({
    translatorId: input.translatorId,
    url: publicUrl,
    source: input.source,
    status: mapResultStatusToDb(result.status),
    message: result.message || null,
    responseJson: result.response ? (result.response as Prisma.InputJsonValue) : null,
  });

  if (!result.ok) {
    logError(
      "google_indexing_submit_failed",
      "Google Indexing API submission failed.",
      {
        translatorId: input.translatorId,
        url: publicUrl,
        source: input.source,
        status: result.status,
        message: result.message,
      },
    );
  } else {
    logInfo("google_indexing_submit_result", "Google Indexing API submission finished.", {
      translatorId: input.translatorId,
      url: publicUrl,
      source: input.source,
      status: result.status,
      message: result.message,
    });
  }

  return {
    ...result,
    logId: logEntry.id,
  };
}

export async function submitAllActiveTranslatorsToGoogleIndexing(input?: { requestUrl?: string }) {
  const activeTranslators = await prisma.translator.findMany({
    where: {
      isActive: true,
      archivedAt: null,
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const summary: AdminBulkIndexingSummary = {
    total: activeTranslators.length,
    submitted: 0,
    failed: 0,
    skipped: 0,
    dryRun: 0,
  };

  const results: Array<{
    translatorId: string;
    translatorName: string;
    translatorSlug: string;
    url: string;
    status: "SUBMITTED" | "FAILED" | "SKIPPED" | "DRY_RUN";
    message?: string;
    logId: string;
  }> = [];

  for (const translator of activeTranslators) {
    const submission = await submitTranslatorToGoogleIndexing({
      translatorId: translator.id,
      slug: translator.slug,
      source: IndexingSource.MANUAL_BULK,
      requestUrl: input?.requestUrl,
    });

    if (submission.status === "SUBMITTED") summary.submitted += 1;
    if (submission.status === "FAILED") summary.failed += 1;
    if (submission.status === "SKIPPED") summary.skipped += 1;
    if (submission.status === "DRY_RUN") summary.dryRun += 1;

    results.push({
      translatorId: translator.id,
      translatorName: translator.name,
      translatorSlug: translator.slug,
      url: submission.url,
      status: submission.status,
      message: submission.message,
      logId: submission.logId,
    });
  }

  return {
    summary,
    results,
  };
}

export async function listAdminIndexingLogs(filters: AdminIndexingLogFilters = {}): Promise<AdminIndexingLogListItem[]> {
  const where: Prisma.IndexingLogWhereInput = {
    provider: IndexingProvider.GOOGLE_INDEXING_API,
  };

  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }

  if (filters.source && filters.source !== "all") {
    where.source = filters.source;
  }

  if (filters.q?.trim()) {
    where.OR = [
      { url: { contains: filters.q, mode: "insensitive" } },
      { message: { contains: filters.q, mode: "insensitive" } },
      {
        translator: {
          is: {
            name: { contains: filters.q, mode: "insensitive" },
          },
        },
      },
      {
        translator: {
          is: {
            slug: { contains: filters.q, mode: "insensitive" },
          },
        },
      },
    ];
  }

  const rows = await prisma.indexingLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      translatorId: true,
      url: true,
      source: true,
      status: true,
      provider: true,
      message: true,
      responseJson: true,
      createdAt: true,
      updatedAt: true,
      translator: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    translatorId: row.translatorId,
    translatorName: row.translator?.name || null,
    translatorSlug: row.translator?.slug || null,
    url: row.url,
    source: row.source,
    status: row.status,
    provider: row.provider,
    message: row.message,
    responseJson: row.responseJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getLatestIndexingLogByTranslatorId(translatorId: string) {
  const row = await prisma.indexingLog.findFirst({
    where: {
      translatorId,
      provider: IndexingProvider.GOOGLE_INDEXING_API,
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      message: true,
      createdAt: true,
    },
  });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}
