import { Prisma, TranslatorRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  AdminTranslatorRequestDetail,
  AdminTranslatorRequestListItem,
  RequestFilters,
  TranslatorDraft,
  TranslatorRequestInput,
} from "@/lib/types";
import { translatorDraftSchema } from "@/lib/validators";

function normalizeOptional(value?: string | null) {
  return value?.trim() || null;
}

function mapDraft(value: Prisma.JsonValue | null): TranslatorDraft | null {
  if (!value) {
    return null;
  }

  const parsed = translatorDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function createPublicTranslatorRequest(input: TranslatorRequestInput) {
  return prisma.translatorRequest.create({
    data: {
      requesterEmail: normalizeOptional(input.requesterEmail),
      requestedName: input.requestedName.trim(),
      description: input.description.trim(),
      exampleInput: normalizeOptional(input.exampleInput),
      desiredStyle: normalizeOptional(input.desiredStyle),
      suggestedCategory: normalizeOptional(input.suggestedCategory),
      audience: normalizeOptional(input.audience),
      notes: normalizeOptional(input.notes),
      status: TranslatorRequestStatus.NEW,
    },
    select: {
      id: true,
    },
  });
}

export async function listAdminTranslatorRequests(
  filters: RequestFilters,
): Promise<AdminTranslatorRequestListItem[]> {
  const where: Prisma.TranslatorRequestWhereInput = {};

  if (filters.q?.trim()) {
    where.OR = [
      { requestedName: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
      { suggestedCategory: { contains: filters.q, mode: "insensitive" } },
      { requesterEmail: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }

  if (filters.category?.trim()) {
    where.suggestedCategory = {
      contains: filters.category,
      mode: "insensitive",
    };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) {
      where.createdAt.gte = new Date(`${filters.dateFrom}T00:00:00.000Z`);
    }
    if (filters.dateTo) {
      where.createdAt.lte = new Date(`${filters.dateTo}T23:59:59.999Z`);
    }
  }

  const rows = await prisma.translatorRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      requesterEmail: true,
      requestedName: true,
      suggestedCategory: true,
      status: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getAdminTranslatorRequestById(id: string): Promise<AdminTranslatorRequestDetail | null> {
  const row = await prisma.translatorRequest.findUnique({
    where: { id },
    include: {
      createdTranslator: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    requesterEmail: row.requesterEmail,
    requestedName: row.requestedName,
    description: row.description,
    exampleInput: row.exampleInput,
    desiredStyle: row.desiredStyle,
    suggestedCategory: row.suggestedCategory,
    audience: row.audience,
    notes: row.notes,
    adminNotes: row.adminNotes,
    status: row.status,
    aiDraftJson: mapDraft(row.aiDraftJson),
    aiDraftGeneratedAt: row.aiDraftGeneratedAt ? row.aiDraftGeneratedAt.toISOString() : null,
    createdTranslatorId: row.createdTranslatorId,
    createdTranslator: row.createdTranslator,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateTranslatorRequestById(
  id: string,
  input: { status?: TranslatorRequestStatus; adminNotes?: string | null },
) {
  return prisma.translatorRequest.update({
    where: { id },
    data: {
      status: input.status,
      adminNotes: normalizeOptional(input.adminNotes),
    },
  });
}

export async function saveTranslatorRequestDraft(id: string, draft: TranslatorDraft) {
  return prisma.translatorRequest.update({
    where: { id },
    data: {
      aiDraftJson: JSON.parse(JSON.stringify(draft)) as Prisma.InputJsonValue,
      aiDraftGeneratedAt: new Date(),
      status: TranslatorRequestStatus.DRAFT_GENERATED,
    },
  });
}

export async function linkRequestToTranslator(
  id: string,
  payload: { translatorId: string; status?: TranslatorRequestStatus },
) {
  return prisma.translatorRequest.update({
    where: { id },
    data: {
      createdTranslatorId: payload.translatorId,
      status: payload.status || TranslatorRequestStatus.COMPLETED,
    },
  });
}
