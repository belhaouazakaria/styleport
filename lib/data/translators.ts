import { Prisma, TranslationStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureUniqueTranslatorSlug } from "@/lib/slug";
import { getAppSettings } from "@/lib/settings";
import type {
  DiscoveryQuery,
  DiscoveryResult,
  PublicTranslator,
  RuntimeTranslator,
  TranslatorListItem,
  TranslatorUpsertInput,
  UsageSeriesPoint,
} from "@/lib/types";

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

export async function getPublicCategories() {
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

export async function getSearchSuggestions(query: string, limit = 8) {
  if (!query.trim()) {
    return [];
  }

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

export async function getFeaturedPublicTranslators(limit = 6): Promise<PublicTranslator[]> {
  const translators = await prisma.translator.findMany({
    where: {
      isActive: true,
      isFeatured: true,
      archivedAt: null,
    },
    include: publicTranslatorInclude,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return translators.map(mapPublicTranslator);
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

export async function getRuntimeTranslatorBySlug(slug: string): Promise<RuntimeTranslator | null> {
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

  return prisma.translator.create({
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
      isFeatured: normalized.isFeatured,
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
}

export async function updateTranslator(id: string, input: TranslatorUpsertInput) {
  const slug = await ensureUniqueTranslatorSlug(input.slug, { excludeId: id });
  const normalized = normalizeTranslatorInput(input);

  return prisma.$transaction(async (tx) => {
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
        isFeatured: normalized.isFeatured,
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

  return prisma.translator.create({
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
}

export async function toggleTranslatorActive(id: string, active?: boolean) {
  const current = await prisma.translator.findUnique({ where: { id } });
  if (!current) {
    return null;
  }

  const next = active ?? !current.isActive;

  return prisma.translator.update({
    where: { id },
    data: {
      isActive: next,
      archivedAt: next ? null : current.archivedAt,
    },
  });
}

export async function archiveTranslator(id: string) {
  return prisma.translator.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      isActive: false,
    },
  });
}

export async function unarchiveTranslator(id: string) {
  return prisma.translator.update({
    where: { id },
    data: {
      archivedAt: null,
      isActive: true,
    },
  });
}

export async function hardDeleteTranslator(id: string) {
  return prisma.translator.delete({ where: { id } });
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
