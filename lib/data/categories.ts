import { prisma } from "@/lib/prisma";
import { ensureUniqueSlug } from "@/lib/slug";
import type { CategoryUpsertInput } from "@/lib/types";

export async function listAdminCategories() {
  const rows = await prisma.category.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { translators: true, adPlacements: true },
      },
    },
  });

  return rows.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    archivedAt: item.archivedAt?.toISOString() || null,
  }));
}

export async function getAdminCategoryById(id: string) {
  return prisma.category.findUnique({
    where: { id },
    include: {
      _count: {
        select: { translators: true, adPlacements: true },
      },
    },
  });
}

export async function createCategory(input: CategoryUpsertInput) {
  const slug = await ensureUniqueSlug({
    desiredSlug: input.slug,
    table: "category",
    field: "slug",
  });

  return prisma.category.create({
    data: {
      name: input.name,
      slug,
      description: input.description || null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      iconKey: input.iconKey || null,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
    },
  });
}

export async function updateCategory(id: string, input: CategoryUpsertInput) {
  const slug = await ensureUniqueSlug({
    desiredSlug: input.slug,
    table: "category",
    field: "slug",
    excludeId: id,
  });

  return prisma.category.update({
    where: { id },
    data: {
      name: input.name,
      slug,
      description: input.description || null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      iconKey: input.iconKey || null,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      archivedAt: input.isActive ? null : undefined,
    },
  });
}

export async function archiveCategory(id: string) {
  return prisma.category.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      isActive: false,
    },
  });
}

export async function unarchiveCategory(id: string) {
  return prisma.category.update({
    where: { id },
    data: {
      archivedAt: null,
      isActive: true,
    },
  });
}

export async function hardDeleteCategory(id: string) {
  await prisma.translator.updateMany({
    where: { primaryCategoryId: id },
    data: { primaryCategoryId: null },
  });

  return prisma.category.delete({ where: { id } });
}

export async function getCategoryChoices() {
  return prisma.category.findMany({
    where: { isActive: true, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });
}
