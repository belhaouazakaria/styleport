import { FeaturedSource, Prisma, TranslationStatus } from "@prisma/client";

import {
  AUTO_FEATURED_LIMIT,
  AUTO_FEATURED_RECALC_MIN_INTERVAL_MS,
  DEFAULT_AUTO_FEATURED_WINDOW_DAYS,
  APP_SETTING_KEYS,
} from "@/lib/constants";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { deleteStoredShareImage, ensureTranslatorShareImageById } from "@/lib/share-images";
import { ensureUniqueTranslatorSlug } from "@/lib/slug";
import { getAppSettings } from "@/lib/settings";
import type {
  AutoFeaturedTranslatorSummary,
  DiscoveryQuery,
  DiscoveryResult,
  PublicTranslator,
  RuntimeTranslator,
  TranslatorListItem,
  TranslatorUpsertInput,
  UsageSeriesPoint,
} from "@/lib/types";

const TRANSLATION_SUCCESS_RECALC_THROTTLE_MS = 60_000;
const PUBLIC_CATEGORY_CACHE_TTL_MS = 60_000;
const FEATURED_TRANSLATOR_CACHE_TTL_MS = 30_000;
const SEARCH_SUGGESTION_CACHE_TTL_MS = 15_000;
const SEARCH_SUGGESTION_CACHE_MAX_ENTRIES = 120;
const RUNTIME_TRANSLATOR_CACHE_TTL_MS = 20_000;

let autoFeaturedRecalcInFlight: Promise<void> | null = null;
let lastTranslationSuccessRecalcAttemptAt = 0;
let canUseFeaturedRankOrder = true;
let publicCategoriesCache:
  | {
      expiresAt: number;
      value: Awaited<ReturnType<typeof fetchPublicCategoriesFromDb>>;
    }
  | null = null;
let publicCategoriesInFlight: Promise<Awaited<ReturnType<typeof fetchPublicCategoriesFromDb>>> | null = null;
const featuredTranslatorCache = new Map<
  string,
  {
    expiresAt: number;
    value: PublicTranslator[];
  }
>();
const featuredTranslatorInFlight = new Map<string, Promise<PublicTranslator[]>>();
const searchSuggestionCache = new Map<
  string,
  {
    expiresAt: number;
    value: Awaited<ReturnType<typeof querySearchSuggestionsFromDb>>;
  }
>();
const searchSuggestionInFlight = new Map<
  string,
  Promise<Awaited<ReturnType<typeof querySearchSuggestionsFromDb>>>
>();
const runtimeTranslatorCache = new Map<
  string,
  {
    expiresAt: number;
    value: RuntimeTranslator | null;
  }
>();
const runtimeTranslatorInFlight = new Map<string, Promise<RuntimeTranslator | null>>();

function invalidatePublicTranslatorCaches() {
  publicCategoriesCache = null;
  publicCategoriesInFlight = null;
  featuredTranslatorCache.clear();
  featuredTranslatorInFlight.clear();
  searchSuggestionCache.clear();
  searchSuggestionInFlight.clear();
  runtimeTranslatorCache.clear();
  runtimeTranslatorInFlight.clear();
}

function pruneExpiringMap<T>(map: Map<string, { expiresAt: number; value: T }>, now: number) {
  for (const [key, entry] of map.entries()) {
    if (entry.expiresAt <= now) {
      map.delete(key);
    }
  }
}

function pruneSuggestionCacheSize() {
  while (searchSuggestionCache.size > SEARCH_SUGGESTION_CACHE_MAX_ENTRIES) {
    const oldestKey = searchSuggestionCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    searchSuggestionCache.delete(oldestKey);
  }
}

const publicTranslatorInclude = {
  modes: {
    select: {
      id: true,
      key: true,
      label: true,
      description: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
  examples: {
    select: {
      id: true,
      label: true,
      value: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
  primaryCategory: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  categories: {
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" as const }, { category: { sortOrder: "asc" as const } }],
  },
};

function mapPublicTranslator(
  translator: Prisma.TranslatorGetPayload<{ include: typeof publicTranslatorInclude }>,
): PublicTranslator {
  return {
    id: translator.id,
    name: translator.name,
    slug: translator.slug,
    title: translator.title,
    subtitle: translator.subtitle,
    shortDescription: translator.shortDescription,
    sourceLabel: translator.sourceLabel,
    targetLabel: translator.targetLabel,
    seoTitle: translator.seoTitle,
    seoDescription: translator.seoDescription,
    isFeatured: translator.isFeatured,
    iconName: translator.iconName,
    showModeSelector: translator.showModeSelector,
    showSwap: translator.showSwap,
    showExamples: translator.showExamples,
    shareImagePath: translator.shareImagePath,
    shareImageUpdatedAt: translator.shareImageUpdatedAt
      ? translator.shareImageUpdatedAt.toISOString()
      : null,
    primaryCategory: translator.primaryCategory,
    categories: translator.categories.map((item) => item.category),
    modes: translator.modes,
    examples: translator.examples,
  };
}

function discoveryWhere(query: Pick<DiscoveryQuery, "q" | "category">): Prisma.TranslatorWhereInput {
  const where: Prisma.TranslatorWhereInput = {
    isActive: true,
    archivedAt: null,
  };

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { slug: { contains: query.q, mode: "insensitive" } },
      { shortDescription: { contains: query.q, mode: "insensitive" } },
      {
        categories: {
          some: {
            category: {
              name: { contains: query.q, mode: "insensitive" },
            },
          },
        },
      },
    ];
  }

  if (query.category) {
    where.categories = {
      some: {
        category: {
          slug: query.category,
          isActive: true,
          archivedAt: null,
        },
      },
    };
  }

  return where;
}

interface AutoFeaturedCandidate {
  translatorId: string;
  name: string;
  slug: string;
  sortOrder: number;
  successCount: number;
  recentSuccessCount: number;
  totalTokens: number;
  lastSuccessAt: Date | null;
}

function isMissingFeaturedRankError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /featuredrank/i.test(error.message) && /(does not exist|unknown column|P2022)/i.test(error.message);
}

async function getAutoFeaturedCandidates(
  windowDays: number,
  limit = AUTO_FEATURED_LIMIT,
): Promise<AutoFeaturedCandidate[]> {
  const now = Date.now();
  const from = new Date(now - windowDays * 24 * 60 * 60 * 1000);
  const recentDays = Math.min(7, Math.max(1, windowDays));
  const recentFrom = new Date(now - recentDays * 24 * 60 * 60 * 1000);

  const [translators, successUsage, recentUsage] = await Promise.all([
    prisma.translator.findMany({
      where: {
        isActive: true,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        sortOrder: true,
      },
    }),
    prisma.translationLog.groupBy({
      by: ["translatorId"],
      where: {
        status: TranslationStatus.SUCCESS,
        createdAt: { gte: from },
      },
      _count: { _all: true },
      _sum: { totalTokens: true },
      _max: { createdAt: true },
    }),
    prisma.translationLog.groupBy({
      by: ["translatorId"],
      where: {
        status: TranslationStatus.SUCCESS,
        createdAt: { gte: recentFrom },
      },
      _count: { _all: true },
    }),
  ]);

  const usageMap = new Map(
    successUsage.map((item) => [
      item.translatorId,
      {
        successCount: item._count._all,
        totalTokens: item._sum.totalTokens || 0,
        lastSuccessAt: item._max.createdAt || null,
      },
    ]),
  );

  const recentMap = new Map(recentUsage.map((item) => [item.translatorId, item._count._all]));

  const ranked = translators
    .map((translator) => {
      const usage = usageMap.get(translator.id);
      return {
        translatorId: translator.id,
        name: translator.name,
        slug: translator.slug,
        sortOrder: translator.sortOrder,
        successCount: usage?.successCount || 0,
        recentSuccessCount: recentMap.get(translator.id) || 0,
        totalTokens: usage?.totalTokens || 0,
        lastSuccessAt: usage?.lastSuccessAt || null,
      };
    })
    .sort((a, b) => {
      if (b.successCount !== a.successCount) return b.successCount - a.successCount;
      if (b.recentSuccessCount !== a.recentSuccessCount) return b.recentSuccessCount - a.recentSuccessCount;
      if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
      if (a.lastSuccessAt && b.lastSuccessAt) {
        const diff = b.lastSuccessAt.getTime() - a.lastSuccessAt.getTime();
        if (diff !== 0) return diff;
      } else if (a.lastSuccessAt || b.lastSuccessAt) {
        return a.lastSuccessAt ? -1 : 1;
      }
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.slug.localeCompare(b.slug);
    });

  return ranked.slice(0, limit);
}

export async function recalculateAutoFeaturedTranslators(options?: {
  windowDays?: number;
  force?: boolean;
  source?: "manual" | "automatic";
}) {
  const settings = await getAppSettings();
  const autoEnabled = settings.autoFeaturedEnabled;

  if (!autoEnabled && !options?.force) {
    return {
      updated: false,
      reason: "AUTO_DISABLED",
      windowDays: settings.autoFeaturedWindowDays,
      featured: [] as AutoFeaturedTranslatorSummary[],
    };
  }

  const windowDays = Math.max(1, options?.windowDays || settings.autoFeaturedWindowDays);
  const candidates = await getAutoFeaturedCandidates(windowDays, AUTO_FEATURED_LIMIT);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.translator.updateMany({
      where: {
        archivedAt: null,
      },
      data: {
        isFeatured: false,
        featuredRank: null,
      },
    });

    for (const [index, candidate] of candidates.entries()) {
      await tx.translator.update({
        where: { id: candidate.translatorId },
        data: {
          isFeatured: true,
          featuredRank: index + 1,
          featuredSource: FeaturedSource.AUTO,
        },
      });
    }

    await tx.appSetting.upsert({
      where: { key: APP_SETTING_KEYS.AUTO_FEATURED_LAST_RECALCULATED_AT },
      update: { value: now.toISOString() },
      create: { key: APP_SETTING_KEYS.AUTO_FEATURED_LAST_RECALCULATED_AT, value: now.toISOString() },
    });
  });

  invalidatePublicTranslatorCaches();

  return {
    updated: true,
    windowDays,
    featured: candidates.map((candidate, index) => ({
      translatorId: candidate.translatorId,
      name: candidate.name,
      slug: candidate.slug,
      rank: index + 1,
      successCount: candidate.successCount,
      recentSuccessCount: candidate.recentSuccessCount,
      totalTokens: candidate.totalTokens,
    })),
  };
}

export async function maybeRecalculateAutoFeaturedTranslators(source: "translation-success" | "settings-save") {
  const now = Date.now();
  if (
    source === "translation-success" &&
    now - lastTranslationSuccessRecalcAttemptAt < TRANSLATION_SUCCESS_RECALC_THROTTLE_MS
  ) {
    return;
  }

  if (source === "translation-success") {
    lastTranslationSuccessRecalcAttemptAt = now;
  }

  if (autoFeaturedRecalcInFlight) {
    await autoFeaturedRecalcInFlight;
    return;
  }

  autoFeaturedRecalcInFlight = (async () => {
    const settings = await getAppSettings();
    if (!settings.autoFeaturedEnabled) {
      return;
    }

    const lastTimestamp = settings.autoFeaturedLastRecalculatedAt
      ? Date.parse(settings.autoFeaturedLastRecalculatedAt)
      : NaN;

    if (Number.isFinite(lastTimestamp) && Date.now() - lastTimestamp < AUTO_FEATURED_RECALC_MIN_INTERVAL_MS) {
      return;
    }

    try {
      await recalculateAutoFeaturedTranslators({
        source: source === "settings-save" ? "manual" : "automatic",
        windowDays: settings.autoFeaturedWindowDays || DEFAULT_AUTO_FEATURED_WINDOW_DAYS,
        force: true,
      });
    } catch (error) {
      logWarn("auto_featured_recalc_failed", "Auto-featured recalculation failed.", {
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  try {
    await autoFeaturedRecalcInFlight;
  } finally {
    autoFeaturedRecalcInFlight = null;
  }
}

export async function getAutoFeaturedSummary(windowDays?: number): Promise<AutoFeaturedTranslatorSummary[]> {
  const settings = await getAppSettings();
  const effectiveWindow = Math.max(1, windowDays || settings.autoFeaturedWindowDays);
  let current: Array<{
    id: string;
    name: string;
    slug: string;
    featuredRank: number | null;
  }> = [];

  try {
    current = await prisma.translator.findMany({
      where: {
        archivedAt: null,
        isActive: true,
        isFeatured: true,
        featuredSource: FeaturedSource.AUTO,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        featuredRank: true,
      },
      orderBy: [{ featuredRank: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
      take: AUTO_FEATURED_LIMIT,
    });
  } catch (error) {
    if (isMissingFeaturedRankError(error)) {
      canUseFeaturedRankOrder = false;
      logWarn("auto_featured_summary_disabled", "Falling back because featuredRank is unavailable.", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
    throw error;
  }

  if (!current.length) {
    return [];
  }

  const from = new Date(Date.now() - effectiveWindow * 24 * 60 * 60 * 1000);
  const recentFrom = new Date(Date.now() - Math.min(7, effectiveWindow) * 24 * 60 * 60 * 1000);
  const ids = current.map((item) => item.id);

  const [usage, recent] = await Promise.all([
    prisma.translationLog.groupBy({
      by: ["translatorId"],
      where: {
        translatorId: { in: ids },
        status: TranslationStatus.SUCCESS,
        createdAt: { gte: from },
      },
      _count: { _all: true },
      _sum: { totalTokens: true },
    }),
    prisma.translationLog.groupBy({
      by: ["translatorId"],
      where: {
        translatorId: { in: ids },
        status: TranslationStatus.SUCCESS,
        createdAt: { gte: recentFrom },
      },
      _count: { _all: true },
    }),
  ]);

  const usageMap = new Map(
    usage.map((item) => [item.translatorId, { count: item._count._all, tokens: item._sum.totalTokens || 0 }]),
  );
  const recentMap = new Map(recent.map((item) => [item.translatorId, item._count._all]));

  return current.map((item, index) => ({
    translatorId: item.id,
    name: item.name,
    slug: item.slug,
    rank: item.featuredRank || index + 1,
    successCount: usageMap.get(item.id)?.count || 0,
    recentSuccessCount: recentMap.get(item.id) || 0,
    totalTokens: usageMap.get(item.id)?.tokens || 0,
  }));
}

async function fetchPublicCategoriesFromDb() {
  return prisma.category.findMany({
    where: {
      isActive: true,
      archivedAt: null,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      sortOrder: true,
      iconKey: true,
      seoTitle: true,
      seoDescription: true,
    },
  });
}

export async function getPublicCategories() {
  const now = Date.now();
  if (publicCategoriesCache && publicCategoriesCache.expiresAt > now) {
    return publicCategoriesCache.value;
  }

  if (publicCategoriesInFlight) {
    return publicCategoriesInFlight;
  }

  const task = fetchPublicCategoriesFromDb()
    .then((rows) => {
      publicCategoriesCache = {
        value: rows,
        expiresAt: Date.now() + PUBLIC_CATEGORY_CACHE_TTL_MS,
      };
      return rows;
    })
    .finally(() => {
      if (publicCategoriesInFlight === task) {
        publicCategoriesInFlight = null;
      }
    });

  publicCategoriesInFlight = task;
  return task;
}

export async function getDiscoveryResult(query: DiscoveryQuery): Promise<DiscoveryResult> {
  const where = discoveryWhere(query);

  const [total, translators, categories] = await Promise.all([
    prisma.translator.count({ where }),
    prisma.translator.findMany({
      where,
      include: publicTranslatorInclude,
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    getPublicCategories(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    translators: translators.map(mapPublicTranslator),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages,
    categories,
    q: query.q,
    category: query.category,
  };
}

async function querySearchSuggestionsFromDb(query: string, limit: number) {
  const rows = await prisma.translator.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
        { shortDescription: { contains: query, mode: "insensitive" } },
        {
          categories: {
            some: {
              category: {
                name: { contains: query, mode: "insensitive" },
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      shortDescription: true,
      primaryCategory: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return rows.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    shortDescription: item.shortDescription,
    categoryName: item.primaryCategory?.name || null,
    categorySlug: item.primaryCategory?.slug || null,
  }));
}

export async function getSearchSuggestions(query: string, limit = 8) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const cacheKey = `${limit}:${normalizedQuery}`;
  const now = Date.now();

  pruneExpiringMap(searchSuggestionCache, now);
  const cached = searchSuggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = searchSuggestionInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const task = querySearchSuggestionsFromDb(normalizedQuery, limit)
    .then((rows) => {
      searchSuggestionCache.set(cacheKey, {
        value: rows,
        expiresAt: Date.now() + SEARCH_SUGGESTION_CACHE_TTL_MS,
      });
      pruneSuggestionCacheSize();
      return rows;
    })
    .finally(() => {
      searchSuggestionInFlight.delete(cacheKey);
    });

  searchSuggestionInFlight.set(cacheKey, task);
  return task;
}

export async function getFeaturedPublicTranslators(limit = 6): Promise<PublicTranslator[]> {
  const settings = await getAppSettings();
  const cacheKey = `${limit}:${settings.autoFeaturedEnabled ? "auto" : "manual"}:${canUseFeaturedRankOrder ? "rank" : "fallback"}`;
  const now = Date.now();
  const cached = featuredTranslatorCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const existingTask = featuredTranslatorInFlight.get(cacheKey);
  if (existingTask) {
    return existingTask;
  }

  const task = (async () => {
  const fallbackOrder: Prisma.TranslatorOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { updatedAt: "desc" }];
  const preferredOrder: Prisma.TranslatorOrderByWithRelationInput[] =
    settings.autoFeaturedEnabled && canUseFeaturedRankOrder
      ? [{ featuredRank: "asc" }, ...fallbackOrder]
      : fallbackOrder;

  let translators: Prisma.TranslatorGetPayload<{ include: typeof publicTranslatorInclude }>[] = [];
  try {
    translators = await prisma.translator.findMany({
      where: {
        isActive: true,
        isFeatured: true,
        archivedAt: null,
      },
      include: publicTranslatorInclude,
      orderBy: preferredOrder,
      take: limit,
    });
  } catch (error) {
    if (settings.autoFeaturedEnabled && canUseFeaturedRankOrder && isMissingFeaturedRankError(error)) {
      canUseFeaturedRankOrder = false;
      logWarn(
        "featured_rank_order_unavailable",
        "Public featured ordering fallback activated because featuredRank is unavailable.",
        { error: error instanceof Error ? error.message : String(error) },
      );
      translators = await prisma.translator.findMany({
        where: {
          isActive: true,
          isFeatured: true,
          archivedAt: null,
        },
        include: publicTranslatorInclude,
        orderBy: fallbackOrder,
        take: limit,
      });
    } else {
      throw error;
    }
  }

    const mapped = translators.map(mapPublicTranslator);
    featuredTranslatorCache.set(cacheKey, {
      value: mapped,
      expiresAt: Date.now() + FEATURED_TRANSLATOR_CACHE_TTL_MS,
    });
    return mapped;
  })().finally(() => {
    featuredTranslatorInFlight.delete(cacheKey);
  });

  featuredTranslatorInFlight.set(cacheKey, task);
  return task;
}

export async function getNewestPublicTranslators(limit = 3): Promise<PublicTranslator[]> {
  const rows = await prisma.translator.findMany({
    where: {
      isActive: true,
      archivedAt: null,
    },
    include: publicTranslatorInclude,
    orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
    take: Math.max(1, limit),
  });

  return rows.map(mapPublicTranslator);
}

export async function getIndexableTranslatorSlugsForSitemap() {
  return prisma.translator.findMany({
    where: {
      isActive: true,
      archivedAt: null,
    },
    select: {
      slug: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function getRelatedPublicTranslators(params: {
  currentTranslatorId: string;
  categorySlug?: string | null;
  limit?: number;
}): Promise<PublicTranslator[]> {
  const limit = Math.max(1, params.limit || 3);
  const where: Prisma.TranslatorWhereInput = {
    id: { not: params.currentTranslatorId },
    isActive: true,
    archivedAt: null,
  };

  if (params.categorySlug) {
    where.categories = {
      some: {
        category: {
          slug: params.categorySlug,
          isActive: true,
          archivedAt: null,
        },
      },
    };
  }

  const relatedRows = await prisma.translator.findMany({
    where,
    include: publicTranslatorInclude,
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  if (relatedRows.length >= limit) {
    return relatedRows.map(mapPublicTranslator);
  }

  const existingIds = new Set<string>([params.currentTranslatorId, ...relatedRows.map((item) => item.id)]);
  const fallbackRows = await prisma.translator.findMany({
    where: {
      id: { notIn: Array.from(existingIds) },
      isActive: true,
      archivedAt: null,
    },
    include: publicTranslatorInclude,
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    take: limit - relatedRows.length,
  });

  return [...relatedRows, ...fallbackRows].map(mapPublicTranslator);
}

export async function getPublicTranslatorBySlug(slug: string): Promise<PublicTranslator | null> {
  const translator = await prisma.translator.findFirst({
    where: {
      slug,
      archivedAt: null,
      isActive: true,
    },
    include: publicTranslatorInclude,
  });

  return translator ? mapPublicTranslator(translator) : null;
}

export async function getDefaultPublicTranslator(): Promise<PublicTranslator | null> {
  const settings = await getAppSettings();

  const bySlug = await getPublicTranslatorBySlug(settings.defaultTranslatorSlug);
  if (bySlug) {
    return bySlug;
  }

  const fallback = await prisma.translator.findFirst({
    where: {
      isActive: true,
      archivedAt: null,
    },
    include: publicTranslatorInclude,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });

  return fallback ? mapPublicTranslator(fallback) : null;
}

async function queryRuntimeTranslatorBySlug(slug: string): Promise<RuntimeTranslator | null> {
  const translator = await prisma.translator.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      promptSystem: true,
      promptInstructions: true,
      modelOverride: true,
      showModeSelector: true,
      isActive: true,
      archivedAt: true,
      modes: {
        select: {
          key: true,
          label: true,
          instruction: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!translator || !translator.isActive || translator.archivedAt) {
    return null;
  }

  return {
    id: translator.id,
    slug: translator.slug,
    promptSystem: translator.promptSystem,
    promptInstructions: translator.promptInstructions,
    modelOverride: translator.modelOverride,
    showModeSelector: translator.showModeSelector,
    modes: translator.modes,
  };
}

export async function getRuntimeTranslatorBySlug(slug: string): Promise<RuntimeTranslator | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) {
    return null;
  }

  const now = Date.now();
  const cached = runtimeTranslatorCache.get(normalizedSlug);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const existingTask = runtimeTranslatorInFlight.get(normalizedSlug);
  if (existingTask) {
    return existingTask;
  }

  const task = queryRuntimeTranslatorBySlug(normalizedSlug)
    .then((translator) => {
      runtimeTranslatorCache.set(normalizedSlug, {
        value: translator,
        expiresAt: Date.now() + RUNTIME_TRANSLATOR_CACHE_TTL_MS,
      });
      return translator;
    })
    .finally(() => {
      runtimeTranslatorInFlight.delete(normalizedSlug);
    });

  runtimeTranslatorInFlight.set(normalizedSlug, task);
  return task;
}

export async function getDefaultRuntimeTranslator(): Promise<RuntimeTranslator | null> {
  const settings = await getAppSettings();
  const preferred = await getRuntimeTranslatorBySlug(settings.defaultTranslatorSlug);
  if (preferred) {
    return preferred;
  }

  const translator = await prisma.translator.findFirst({
    where: {
      isActive: true,
      archivedAt: null,
    },
    select: {
      id: true,
      slug: true,
      promptSystem: true,
      promptInstructions: true,
      modelOverride: true,
      showModeSelector: true,
      modes: {
        select: {
          key: true,
          label: true,
          instruction: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });

  if (!translator) {
    return null;
  }

  return translator;
}

export async function getAdminTranslatorById(id: string) {
  return prisma.translator.findUnique({
    where: { id },
    include: {
      modes: {
        orderBy: { sortOrder: "asc" },
      },
      examples: {
        orderBy: { sortOrder: "asc" },
      },
      categories: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { category: { sortOrder: "asc" } }],
      },
    },
  });
}

export async function regenerateTranslatorShareImage(id: string) {
  const translator = await prisma.translator.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!translator) {
    return null;
  }

  return ensureTranslatorShareImageById(id, { force: true });
}

export async function listAdminTranslators(filters: {
  q?: string;
  status?: "all" | "active" | "inactive" | "archived";
  featured?: "all" | "featured" | "non-featured";
  category?: string;
}): Promise<TranslatorListItem[]> {
  const where: Prisma.TranslatorWhereInput = {};

  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { slug: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.status === "archived") {
    where.archivedAt = { not: null };
  } else if (filters.status === "active") {
    where.archivedAt = null;
    where.isActive = true;
  } else if (filters.status === "inactive") {
    where.archivedAt = null;
    where.isActive = false;
  }

  if (filters.featured === "featured") {
    where.isFeatured = true;
  } else if (filters.featured === "non-featured") {
    where.isFeatured = false;
  }

  if (filters.category) {
    where.categories = {
      some: {
        category: {
          slug: filters.category,
        },
      },
    };
  }

  const rows = await prisma.translator.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      isFeatured: true,
      featuredRank: true,
      featuredSource: true,
      shareImagePath: true,
      shareImageUpdatedAt: true,
      archivedAt: true,
      updatedAt: true,
      sortOrder: true,
      categories: {
        select: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { sortOrder: "asc" }],
  });

  return rows.map((row) => ({
    ...row,
    categories: row.categories.map((item) => item.category),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    shareImageUpdatedAt: row.shareImageUpdatedAt ? row.shareImageUpdatedAt.toISOString() : null,
  }));
}

function normalizeTranslatorInput(input: TranslatorUpsertInput) {
  const modeRows = input.modes || [];
  const exampleRows = input.examples || [];

  const categoryIds = Array.from(new Set(input.categoryIds.filter(Boolean)));
  const primaryCategoryId =
    input.primaryCategoryId && categoryIds.includes(input.primaryCategoryId)
      ? input.primaryCategoryId
      : categoryIds[0] || null;

  return {
    ...input,
    iconName: input.iconName || null,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
    modelOverride: input.modelOverride || null,
    primaryCategoryId,
    categoryIds,
    modeRows,
    exampleRows,
  };
}

export async function createTranslator(input: TranslatorUpsertInput) {
  const slug = await ensureUniqueTranslatorSlug(input.slug);
  const normalized = normalizeTranslatorInput(input);
  const settings = await getAppSettings();
  const allowManualFeatured = !settings.autoFeaturedEnabled;

  const created = await prisma.translator.create({
    data: {
      name: normalized.name,
      slug,
      title: normalized.title,
      subtitle: normalized.subtitle,
      shortDescription: normalized.shortDescription,
      sourceLabel: normalized.sourceLabel,
      targetLabel: normalized.targetLabel,
      iconName: normalized.iconName,
      promptSystem: normalized.promptSystem,
      promptInstructions: normalized.promptInstructions,
      seoTitle: normalized.seoTitle,
      seoDescription: normalized.seoDescription,
      modelOverride: normalized.modelOverride,
      isActive: normalized.isActive,
      isFeatured: allowManualFeatured ? normalized.isFeatured : false,
      featuredRank: null,
      featuredSource: FeaturedSource.MANUAL,
      shareImagePath: null,
      shareImageHash: null,
      shareImageUpdatedAt: null,
      showModeSelector: normalized.showModeSelector,
      showSwap: normalized.showSwap,
      showExamples: normalized.showExamples,
      sortOrder: normalized.sortOrder,
      primaryCategoryId: normalized.primaryCategoryId,
      modes: {
        createMany: {
          data: normalized.modeRows,
        },
      },
      examples: {
        createMany: {
          data: normalized.exampleRows,
        },
      },
      categories: {
        create: normalized.categoryIds.map((categoryId, index) => ({
          categoryId,
          sortOrder: index + 1,
        })),
      },
    },
    include: {
      modes: { orderBy: { sortOrder: "asc" } },
      examples: { orderBy: { sortOrder: "asc" } },
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  await ensureTranslatorShareImageById(created.id);

  if (settings.autoFeaturedEnabled) {
    await maybeRecalculateAutoFeaturedTranslators("settings-save");
  }

  invalidatePublicTranslatorCaches();
  return created;
}

export async function updateTranslator(id: string, input: TranslatorUpsertInput) {
  const slug = await ensureUniqueTranslatorSlug(input.slug, { excludeId: id });
  const normalized = normalizeTranslatorInput(input);
  const settings = await getAppSettings();
  const allowManualFeatured = !settings.autoFeaturedEnabled;
  const existing = await prisma.translator.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      subtitle: true,
      shortDescription: true,
      sourceLabel: true,
      targetLabel: true,
    },
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.translationMode.deleteMany({ where: { translatorId: id } });
    await tx.translatorExample.deleteMany({ where: { translatorId: id } });
    await tx.translatorCategory.deleteMany({ where: { translatorId: id } });

    return tx.translator.update({
      where: { id },
      data: {
        name: normalized.name,
        slug,
        title: normalized.title,
        subtitle: normalized.subtitle,
        shortDescription: normalized.shortDescription,
        sourceLabel: normalized.sourceLabel,
        targetLabel: normalized.targetLabel,
        iconName: normalized.iconName,
        promptSystem: normalized.promptSystem,
        promptInstructions: normalized.promptInstructions,
        seoTitle: normalized.seoTitle,
        seoDescription: normalized.seoDescription,
        modelOverride: normalized.modelOverride,
        isActive: normalized.isActive,
        isFeatured: allowManualFeatured ? normalized.isFeatured : false,
        featuredRank: allowManualFeatured ? null : undefined,
        featuredSource: FeaturedSource.MANUAL,
        showModeSelector: normalized.showModeSelector,
        showSwap: normalized.showSwap,
        showExamples: normalized.showExamples,
        sortOrder: normalized.sortOrder,
        archivedAt: normalized.isActive ? null : undefined,
        primaryCategoryId: normalized.primaryCategoryId,
        modes: {
          createMany: {
            data: normalized.modeRows,
          },
        },
        examples: {
          createMany: {
            data: normalized.exampleRows,
          },
        },
        categories: {
          create: normalized.categoryIds.map((categoryId, index) => ({
            categoryId,
            sortOrder: index + 1,
          })),
        },
      },
      include: {
        modes: { orderBy: { sortOrder: "asc" } },
        examples: { orderBy: { sortOrder: "asc" } },
        categories: {
          include: {
            category: true,
          },
        },
      },
    });
  });

  const shareFieldsChanged =
    !existing ||
    existing.name !== updated.name ||
    existing.subtitle !== updated.subtitle ||
    existing.shortDescription !== updated.shortDescription ||
    existing.sourceLabel !== updated.sourceLabel ||
    existing.targetLabel !== updated.targetLabel;

  if (shareFieldsChanged || !updated.shareImagePath) {
    await ensureTranslatorShareImageById(updated.id, { force: shareFieldsChanged });
  }

  if (settings.autoFeaturedEnabled) {
    await maybeRecalculateAutoFeaturedTranslators("settings-save");
  }

  invalidatePublicTranslatorCaches();
  return updated;
}

export async function duplicateTranslator(id: string) {
  const translator = await prisma.translator.findUnique({
    where: { id },
    include: {
      modes: { orderBy: { sortOrder: "asc" } },
      examples: { orderBy: { sortOrder: "asc" } },
      categories: { orderBy: [{ sortOrder: "asc" }] },
    },
  });

  if (!translator) {
    return null;
  }

  const slug = await ensureUniqueTranslatorSlug(`${translator.slug}-copy`);

  const duplicated = await prisma.translator.create({
    data: {
      name: `${translator.name} Copy`,
      slug,
      title: translator.title,
      subtitle: translator.subtitle,
      shortDescription: translator.shortDescription,
      sourceLabel: translator.sourceLabel,
      targetLabel: translator.targetLabel,
      iconName: translator.iconName,
      promptSystem: translator.promptSystem,
      promptInstructions: translator.promptInstructions,
      modelOverride: translator.modelOverride,
      seoTitle: translator.seoTitle,
      seoDescription: translator.seoDescription,
      showModeSelector: translator.showModeSelector,
      showSwap: translator.showSwap,
      showExamples: translator.showExamples,
      isActive: false,
      isFeatured: false,
      featuredRank: null,
      featuredSource: FeaturedSource.MANUAL,
      shareImagePath: null,
      shareImageHash: null,
      shareImageUpdatedAt: null,
      sortOrder: translator.sortOrder + 1,
      primaryCategoryId: translator.primaryCategoryId,
      modes: {
        createMany: {
          data: translator.modes.map((mode) => ({
            key: mode.key,
            label: mode.label,
            description: mode.description,
            instruction: mode.instruction,
            sortOrder: mode.sortOrder,
          })),
        },
      },
      examples: {
        createMany: {
          data: translator.examples.map((example) => ({
            label: example.label,
            value: example.value,
            sortOrder: example.sortOrder,
          })),
        },
      },
      categories: {
        create: translator.categories.map((item) => ({
          categoryId: item.categoryId,
          sortOrder: item.sortOrder,
        })),
      },
    },
  });

  await ensureTranslatorShareImageById(duplicated.id);

  invalidatePublicTranslatorCaches();
  return duplicated;
}

export async function toggleTranslatorActive(id: string, active?: boolean) {
  const current = await prisma.translator.findUnique({ where: { id } });
  if (!current) {
    return null;
  }

  const next = active ?? !current.isActive;

  const updated = await prisma.translator.update({
    where: { id },
    data: {
      isActive: next,
      archivedAt: next ? null : current.archivedAt,
    },
  });

  await maybeRecalculateAutoFeaturedTranslators("settings-save");
  invalidatePublicTranslatorCaches();
  return updated;
}

export async function archiveTranslator(id: string) {
  const updated = await prisma.translator.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      isActive: false,
      isFeatured: false,
      featuredRank: null,
    },
  });

  await maybeRecalculateAutoFeaturedTranslators("settings-save");
  invalidatePublicTranslatorCaches();
  return updated;
}

export async function unarchiveTranslator(id: string) {
  const updated = await prisma.translator.update({
    where: { id },
    data: {
      archivedAt: null,
      isActive: true,
    },
  });

  await maybeRecalculateAutoFeaturedTranslators("settings-save");
  invalidatePublicTranslatorCaches();
  return updated;
}

export async function hardDeleteTranslator(id: string) {
  const existing = await prisma.translator.findUnique({
    where: { id },
    select: { shareImagePath: true },
  });
  const deleted = await prisma.translator.delete({ where: { id } });

  await deleteStoredShareImage(existing?.shareImagePath || null);

  await maybeRecalculateAutoFeaturedTranslators("settings-save");
  invalidatePublicTranslatorCaches();
  return deleted;
}

export async function createTranslationLog(data: {
  translatorId: string;
  inputText: string;
  outputText?: string;
  modeUsed?: string;
  status: TranslationStatus;
  inputLength: number;
  outputLength: number;
  model?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  errorCode?: string;
  latencyMs?: number;
  ipHash?: string;
  userAgent?: string;
}) {
  return prisma.translationLog.create({
    data: {
      ...data,
      outputText: data.outputText || null,
      modeUsed: data.modeUsed || null,
      model: data.model || null,
      promptTokens: data.promptTokens ?? null,
      completionTokens: data.completionTokens ?? null,
      totalTokens: data.totalTokens ?? null,
      estimatedCost: data.estimatedCost ?? null,
      errorCode: data.errorCode || null,
      latencyMs: data.latencyMs ?? null,
      ipHash: data.ipHash || null,
      userAgent: data.userAgent || null,
    },
  });
}

export async function getRecentTranslationLogs(limit = 100) {
  return prisma.translationLog.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      translator: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}

export async function getAdminOverviewStats(days = 30) {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    totalTranslators,
    activeTranslators,
    featuredTranslators,
    categoriesCount,
    adsCount,
    totalTranslations,
    sums,
    topTranslators,
    recent,
    groupedUsage,
  ] = await Promise.all([
    prisma.translator.count(),
    prisma.translator.count({ where: { isActive: true, archivedAt: null } }),
    prisma.translator.count({ where: { isFeatured: true, archivedAt: null } }),
    prisma.category.count({ where: { archivedAt: null } }),
    prisma.adPlacement.count({ where: { archivedAt: null } }),
    prisma.translationLog.count({ where: { createdAt: { gte: from } } }),
    prisma.translationLog.aggregate({
      where: { createdAt: { gte: from }, status: TranslationStatus.SUCCESS },
      _sum: {
        totalTokens: true,
        estimatedCost: true,
      },
    }),
    prisma.translationLog.groupBy({
      by: ["translatorId"],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
      _sum: {
        totalTokens: true,
        estimatedCost: true,
      },
      orderBy: {
        _count: {
          translatorId: "desc",
        },
      },
      take: 8,
    }),
    prisma.translationLog.findMany({
      where: { createdAt: { gte: from } },
      take: 12,
      orderBy: { createdAt: "desc" },
      include: {
        translator: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    }),
    prisma.translationLog.groupBy({
      by: ["createdAt"],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
      _sum: { totalTokens: true, estimatedCost: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const translatorIds = topTranslators.map((item) => item.translatorId);
  const translatorMap = new Map(
    (
      await prisma.translator.findMany({
        where: { id: { in: translatorIds } },
        select: { id: true, name: true, slug: true },
      })
    ).map((item) => [item.id, item]),
  );

  const dailyMap = new Map<string, UsageSeriesPoint>();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(from);
    date.setDate(date.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    dailyMap.set(key, {
      date: key,
      translations: 0,
      totalTokens: 0,
      estimatedCost: 0,
    });
  }

  for (const row of groupedUsage) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const current = dailyMap.get(key);
    if (!current) continue;
    current.translations += row._count._all;
    current.totalTokens += row._sum.totalTokens || 0;
    current.estimatedCost += Number(row._sum.estimatedCost || 0);
  }

  return {
    kpis: {
      totalTranslators,
      activeTranslators,
      featuredTranslators,
      categoriesCount,
      adsCount,
      totalTranslations,
      totalTokens: sums._sum.totalTokens || 0,
      estimatedSpend: Number(sums._sum.estimatedCost || 0),
    },
    topTranslators: topTranslators.map((row) => ({
      translatorId: row.translatorId,
      name: translatorMap.get(row.translatorId)?.name || "Unknown translator",
      slug: translatorMap.get(row.translatorId)?.slug || "unknown",
      usageCount: row._count._all,
      totalTokens: row._sum.totalTokens || 0,
      estimatedSpend: Number(row._sum.estimatedCost || 0),
    })),
    series: Array.from(dailyMap.values()),
    recent: recent.map((item) => ({
      id: item.id,
      translator: item.translator,
      status: item.status,
      model: item.model,
      totalTokens: item.totalTokens || 0,
      estimatedCost: Number(item.estimatedCost || 0),
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
