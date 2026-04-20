import { AdDeviceType, AdPageType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureUniqueSlug } from "@/lib/slug";
import { getAppSettings } from "@/lib/settings";
import type { AdPlacementUpsertInput } from "@/lib/types";

export interface AdRenderContext {
  pageType: AdPageType;
  deviceType: AdDeviceType;
  categorySlug?: string;
}

export async function listAdminAds() {
  const rows = await prisma.adPlacement.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() || null,
  }));
}

export async function getAdById(id: string) {
  return prisma.adPlacement.findUnique({
    where: { id },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}

export async function createAdPlacement(input: AdPlacementUpsertInput) {
  const key = await ensureUniqueSlug({
    desiredSlug: input.key,
    table: "adPlacement",
    field: "key",
  });

  return prisma.adPlacement.create({
    data: {
      name: input.name,
      key,
      description: input.description || null,
      pageType: input.pageType,
      deviceType: input.deviceType,
      placementType: input.placementType,
      providerType: input.providerType,
      adSenseSlot: input.adSenseSlot || null,
      codeSnippet: input.codeSnippet || null,
      categoryId: input.categoryId || null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    },
  });
}

export async function updateAdPlacement(id: string, input: AdPlacementUpsertInput) {
  const key = await ensureUniqueSlug({
    desiredSlug: input.key,
    table: "adPlacement",
    field: "key",
    excludeId: id,
  });

  return prisma.adPlacement.update({
    where: { id },
    data: {
      name: input.name,
      key,
      description: input.description || null,
      pageType: input.pageType,
      deviceType: input.deviceType,
      placementType: input.placementType,
      providerType: input.providerType,
      adSenseSlot: input.adSenseSlot || null,
      codeSnippet: input.codeSnippet || null,
      categoryId: input.categoryId || null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
      archivedAt: input.isActive ? null : undefined,
    },
  });
}

export async function archiveAdPlacement(id: string) {
  return prisma.adPlacement.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      isActive: false,
    },
  });
}

export async function unarchiveAdPlacement(id: string) {
  return prisma.adPlacement.update({
    where: { id },
    data: {
      archivedAt: null,
      isActive: true,
    },
  });
}

export async function hardDeleteAdPlacement(id: string) {
  return prisma.adPlacement.delete({ where: { id } });
}

export async function getRenderableAdPlacements(context: AdRenderContext) {
  const settings = await getAppSettings();
  if (!settings.adsEnabled) {
    return [];
  }

  const where: Prisma.AdPlacementWhereInput = {
    isActive: true,
    archivedAt: null,
    OR: [
      { pageType: "ALL" },
      { pageType: context.pageType },
      ...(context.categorySlug ? [{ pageType: "CATEGORY" as const }] : []),
    ],
    AND: [
      {
        OR: [{ deviceType: "ALL" }, { deviceType: context.deviceType }],
      },
    ],
  };

  const rows = await prisma.adPlacement.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      category: {
        select: { slug: true },
      },
    },
  });

  return rows.filter((item) => {
    if (item.pageType !== "CATEGORY") return true;
    if (!context.categorySlug) return false;
    return !item.category || item.category.slug === context.categorySlug;
  });
}
