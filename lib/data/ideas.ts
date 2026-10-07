import { GrowthIdeaStatus } from "@prisma/client";

import { ideaBlockSchema, type IdeaBlock } from "@/lib/growth/ideas/contracts";
import { prisma } from "@/lib/prisma";

const PUBLIC_PAGE_SIZE = 12;

const publicWhere = {
  status: GrowthIdeaStatus.PUBLISHED,
  archivedAt: null,
  currentVersionId: { not: null },
} as const;

function parseBlocks(value: unknown): IdeaBlock[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ideaBlockSchema.safeParse(item)).filter((item) => item.success).map((item) => item.data);
}

export async function getPublicIdeaCategories() {
  return prisma.growthIdeaCategory.findMany({
    where: { isActive: true, archivedAt: null, ideas: { some: publicWhere } },
    select: { id: true, slug: true, name: true, description: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 50,
  });
}

export async function getPublicIdeasPage(params: { category?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(24, Math.max(1, params.pageSize || PUBLIC_PAGE_SIZE));
  const where = { ...publicWhere, ...(params.category ? { category: { slug: params.category, isActive: true, archivedAt: null } } : {}) };
  const [ideas, total] = await Promise.all([
    prisma.growthIdea.findMany({
      where,
      select: { id: true, slug: true, publishedAt: true, updatedAt: true, category: { select: { slug: true, name: true } }, currentVersion: { select: { title: true, excerpt: true } } },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.growthIdea.count({ where }),
  ]);
  return { ideas: ideas.filter((item) => item.currentVersion), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getPublicIdeaBySlug(slug: string) {
  const idea = await prisma.growthIdea.findFirst({
    where: { ...publicWhere, slug },
    include: {
      category: { select: { id: true, slug: true, name: true, description: true } },
      currentVersion: { include: { translatorReferences: { include: { translator: { select: { id: true, slug: true, name: true, shortDescription: true, isActive: true, archivedAt: true } } }, orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!idea?.currentVersion || !idea.currentVersion.publishedAt) return null;
  const translators = idea.currentVersion.translatorReferences.map((item) => item.translator).filter((item) => item.isActive && !item.archivedAt);
  const related = await prisma.growthIdea.findMany({
    where: { ...publicWhere, id: { not: idea.id }, OR: [{ categoryId: idea.categoryId }, ...(idea.clusterId ? [{ clusterId: idea.clusterId }] : [])] },
    select: { id: true, slug: true, category: { select: { name: true, slug: true } }, currentVersion: { select: { title: true, excerpt: true } } },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: 4,
  });
  return { ...idea, blocks: parseBlocks(idea.currentVersion.blocks), translators, related: related.filter((item) => item.currentVersion) };
}

export async function getIndexableIdeaSlugsForSitemap(limit = 5000) {
  return prisma.growthIdea.findMany({ where: publicWhere, select: { slug: true, updatedAt: true }, orderBy: [{ updatedAt: "desc" }, { slug: "asc" }], take: Math.min(5000, Math.max(1, limit)) });
}

export async function getAdminIdeasOverview() {
  const [categories, ideas, opportunities, decisions] = await Promise.all([
    prisma.growthIdeaCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 100 }),
    prisma.growthIdea.findMany({ include: { category: true, currentVersion: { include: { translatorReferences: { include: { translator: { select: { name: true, slug: true } } }, orderBy: { sortOrder: "asc" } } } }, decisions: { include: { opportunity: { select: { id: true, type: true } } }, orderBy: { createdAt: "desc" }, take: 1 }, versions: { orderBy: { version: "desc" }, take: 20 } }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.growthOpportunity.findMany({ where: { status: "OPEN" }, include: { cluster: true }, orderBy: [{ score: "desc" }, { createdAt: "desc" }], take: 50 }),
    prisma.growthDecision.findMany({ where: { type: { in: ["CREATE_IDEA", "IMPROVE_IDEA"] } }, include: { idea: { select: { slug: true } }, opportunity: { include: { cluster: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { categories, ideas, opportunities, decisions };
}
