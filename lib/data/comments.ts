import { CommentModerationStatus, Prisma } from "@prisma/client";

import { assessTranslatorCommentModeration } from "@/lib/moderation";
import { prisma } from "@/lib/prisma";
import type {
  AdminTranslatorCommentListItem,
  PublicTranslatorCommentItem,
  TranslatorCommentInput,
} from "@/lib/types";

interface AdminCommentFilters {
  q?: string;
  status?: "all" | CommentModerationStatus;
}

export async function listPublicTranslatorComments(translatorId: string): Promise<PublicTranslatorCommentItem[]> {
  const rows = await prisma.translatorComment.findMany({
    where: {
      translatorId,
      status: CommentModerationStatus.VISIBLE,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 30,
    select: {
      id: true,
      name: true,
      content: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getPublicTranslatorCommentTargetBySlug(slug: string) {
  return prisma.translator.findFirst({
    where: {
      slug,
      isActive: true,
      archivedAt: null,
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });
}

export async function createTranslatorComment(input: TranslatorCommentInput) {
  const moderation = assessTranslatorCommentModeration({
    name: input.name,
    email: input.email,
    comment: input.comment,
  });

  const created = await prisma.translatorComment.create({
    data: {
      translatorId: input.translatorId,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      content: input.comment.trim(),
      status: moderation.status,
      moderationReason: moderation.reason,
    },
    select: {
      id: true,
      status: true,
      moderationReason: true,
      createdAt: true,
    },
  });

  return {
    id: created.id,
    status: created.status,
    moderationReason: created.moderationReason,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function listAdminTranslatorComments(
  filters: AdminCommentFilters = {},
): Promise<AdminTranslatorCommentListItem[]> {
  const where: Prisma.TranslatorCommentWhereInput = {};

  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }

  if (filters.q?.trim()) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { content: { contains: filters.q, mode: "insensitive" } },
      {
        translator: {
          name: { contains: filters.q, mode: "insensitive" },
        },
      },
      {
        translator: {
          slug: { contains: filters.q, mode: "insensitive" },
        },
      },
    ];
  }

  const rows = await prisma.translatorComment.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      content: true,
      status: true,
      moderationReason: true,
      createdAt: true,
      reviewedAt: true,
      translator: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    take: 250,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    content: row.content,
    status: row.status,
    moderationReason: row.moderationReason,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    translator: row.translator,
  }));
}

export async function updateTranslatorCommentStatus(input: {
  id: string;
  status: CommentModerationStatus;
  moderationReason?: string | null;
}) {
  return prisma.translatorComment.update({
    where: { id: input.id },
    data: {
      status: input.status,
      moderationReason: input.moderationReason?.trim() || null,
      reviewedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      moderationReason: true,
      reviewedAt: true,
    },
  });
}

export async function countPendingAdminTranslatorComments() {
  return prisma.translatorComment.count({
    where: {
      status: CommentModerationStatus.PENDING_REVIEW,
    },
  });
}
