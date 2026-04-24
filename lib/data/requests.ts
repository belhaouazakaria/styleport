import crypto from "node:crypto";
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

const REQUEST_VERIFICATION_TOKEN_BYTES = 32;
const REQUEST_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_VERIFICATION_RESEND_MIN_INTERVAL_MS = 60 * 1000;

function normalizeOptional(value?: string | null) {
  return value?.trim() || null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function mapDraft(value: Prisma.JsonValue | null): TranslatorDraft | null {
  if (!value) {
    return null;
  }

  const parsed = translatorDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isEligibleForReview(input: { requesterEmail: string | null; emailVerifiedAt: Date | null }) {
  if (!input.requesterEmail) {
    return true;
  }

  return Boolean(input.emailVerifiedAt);
}

function hashVerificationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildVerificationTokenPayload() {
  const token = crypto.randomBytes(REQUEST_VERIFICATION_TOKEN_BYTES).toString("hex");
  const tokenHash = hashVerificationToken(token);
  const expiresAt = new Date(Date.now() + REQUEST_VERIFICATION_TTL_MS);

  return {
    token,
    tokenHash,
    expiresAt,
  };
}

export async function createPublicTranslatorRequest(input: TranslatorRequestInput) {
  const requesterEmail = normalizeEmail(input.requesterEmail);
  const previouslyVerified = await prisma.translatorRequest.findFirst({
    where: {
      requesterEmail,
      emailVerifiedAt: { not: null },
    },
    select: { id: true },
  });
  const verificationRequired = !previouslyVerified;
  const verification = verificationRequired ? buildVerificationTokenPayload() : null;

  const created = await prisma.translatorRequest.create({
    data: {
      requesterEmail,
      requestedName: input.requestedName.trim(),
      description: input.description.trim(),
      exampleInput: normalizeOptional(input.exampleInput),
      desiredStyle: normalizeOptional(input.desiredStyle),
      suggestedCategory: normalizeOptional(input.suggestedCategory),
      audience: normalizeOptional(input.audience),
      notes: normalizeOptional(input.notes),
      status: verificationRequired
        ? TranslatorRequestStatus.PENDING_EMAIL_VERIFICATION
        : TranslatorRequestStatus.VERIFIED,
      emailVerifiedAt: verificationRequired ? null : new Date(),
      verificationTokenHash: verification?.tokenHash || null,
      verificationTokenExpiresAt: verification?.expiresAt || null,
    },
    select: {
      id: true,
      requesterEmail: true,
      requestedName: true,
    },
  });

  return {
    id: created.id,
    requesterEmail: created.requesterEmail || requesterEmail,
    requestedName: created.requestedName,
    verificationRequired,
    verificationToken: verification?.token || null,
  };
}

export async function markTranslatorRequestVerificationEmailSent(id: string) {
  await prisma.translatorRequest.update({
    where: { id },
    data: {
      verificationEmailSentAt: new Date(),
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
      emailVerifiedAt: true,
      requestedName: true,
      suggestedCategory: true,
      status: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    emailVerifiedAt: row.emailVerifiedAt ? row.emailVerifiedAt.toISOString() : null,
    isEligibleForReview: isEligibleForReview(row),
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
    emailVerifiedAt: row.emailVerifiedAt ? row.emailVerifiedAt.toISOString() : null,
    verificationEmailSentAt: row.verificationEmailSentAt ? row.verificationEmailSentAt.toISOString() : null,
    publishedNotificationSentAt: row.publishedNotificationSentAt
      ? row.publishedNotificationSentAt.toISOString()
      : null,
    isEligibleForReview: isEligibleForReview(row),
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

export async function deleteTranslatorRequestById(id: string) {
  return prisma.translatorRequest.delete({
    where: { id },
    select: { id: true },
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
      status: payload.status || TranslatorRequestStatus.APPROVED,
    },
  });
}

export type RequestEmailVerificationResult =
  | { outcome: "VERIFIED"; requestId: string; requesterEmail: string | null; requestedName: string }
  | { outcome: "ALREADY_VERIFIED"; requestId: string; requesterEmail: string | null; requestedName: string }
  | { outcome: "EXPIRED"; requestId: string; requesterEmail: string | null; requestedName: string }
  | { outcome: "INVALID" };

export async function verifyTranslatorRequestEmailToken(token: string): Promise<RequestEmailVerificationResult> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return { outcome: "INVALID" };
  }

  const tokenHash = hashVerificationToken(normalizedToken);
  const row = await prisma.translatorRequest.findFirst({
    where: {
      verificationTokenHash: tokenHash,
    },
    select: {
      id: true,
      requesterEmail: true,
      requestedName: true,
      emailVerifiedAt: true,
      verificationTokenExpiresAt: true,
    },
  });

  if (!row) {
    return { outcome: "INVALID" };
  }

  if (row.emailVerifiedAt) {
    return {
      outcome: "ALREADY_VERIFIED",
      requestId: row.id,
      requesterEmail: row.requesterEmail,
      requestedName: row.requestedName,
    };
  }

  if (!row.verificationTokenExpiresAt || row.verificationTokenExpiresAt.getTime() < Date.now()) {
    return {
      outcome: "EXPIRED",
      requestId: row.id,
      requesterEmail: row.requesterEmail,
      requestedName: row.requestedName,
    };
  }

  const result = await prisma.translatorRequest.updateMany({
    where: {
      id: row.id,
      verificationTokenHash: tokenHash,
      emailVerifiedAt: null,
    },
    data: {
      emailVerifiedAt: new Date(),
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      status: TranslatorRequestStatus.VERIFIED,
    },
  });

  if (result.count === 0) {
    return {
      outcome: "ALREADY_VERIFIED",
      requestId: row.id,
      requesterEmail: row.requesterEmail,
      requestedName: row.requestedName,
    };
  }

  return {
    outcome: "VERIFIED",
    requestId: row.id,
    requesterEmail: row.requesterEmail,
    requestedName: row.requestedName,
  };
}

export type ResendRequestVerificationResult =
  | {
      outcome: "SENT";
      requestId: string;
      requesterEmail: string;
      requestedName: string;
      verificationToken: string;
    }
  | { outcome: "NOT_FOUND" }
  | { outcome: "ALREADY_VERIFIED" }
  | { outcome: "TOO_MANY_REQUESTS" };

export async function resendTranslatorRequestVerificationToken(input: {
  requestId: string;
  requesterEmail: string;
}): Promise<ResendRequestVerificationResult> {
  const requestId = input.requestId.trim();
  const requesterEmail = normalizeEmail(input.requesterEmail);

  const row = await prisma.translatorRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      requesterEmail: true,
      requestedName: true,
      emailVerifiedAt: true,
      status: true,
      verificationEmailSentAt: true,
    },
  });

  if (!row || !row.requesterEmail || normalizeEmail(row.requesterEmail) !== requesterEmail) {
    return { outcome: "NOT_FOUND" };
  }

  if (row.emailVerifiedAt || row.status !== TranslatorRequestStatus.PENDING_EMAIL_VERIFICATION) {
    return { outcome: "ALREADY_VERIFIED" };
  }

  if (
    row.verificationEmailSentAt &&
    Date.now() - row.verificationEmailSentAt.getTime() < REQUEST_VERIFICATION_RESEND_MIN_INTERVAL_MS
  ) {
    return { outcome: "TOO_MANY_REQUESTS" };
  }

  const verification = buildVerificationTokenPayload();

  await prisma.translatorRequest.update({
    where: { id: row.id },
    data: {
      verificationTokenHash: verification.tokenHash,
      verificationTokenExpiresAt: verification.expiresAt,
    },
  });

  return {
    outcome: "SENT",
    requestId: row.id,
    requesterEmail: row.requesterEmail,
    requestedName: row.requestedName,
    verificationToken: verification.token,
  };
}

export async function getTranslatorRequestByCreatedTranslatorId(translatorId: string) {
  return prisma.translatorRequest.findFirst({
    where: { createdTranslatorId: translatorId },
    select: {
      id: true,
      requesterEmail: true,
      requestedName: true,
      emailVerifiedAt: true,
      publishedNotificationSentAt: true,
      status: true,
    },
  });
}

export async function markTranslatorRequestPublished(id: string) {
  await prisma.translatorRequest.update({
    where: { id },
    data: {
      status: TranslatorRequestStatus.PUBLISHED,
    },
  });
}

export async function markTranslatorRequestPublishedByTranslatorId(translatorId: string) {
  const result = await prisma.translatorRequest.updateMany({
    where: {
      createdTranslatorId: translatorId,
      status: {
        not: TranslatorRequestStatus.PUBLISHED,
      },
    },
    data: {
      status: TranslatorRequestStatus.PUBLISHED,
    },
  });

  return result.count > 0;
}

export async function markTranslatorRequestPublishedNotificationSent(id: string) {
  await prisma.translatorRequest.update({
    where: { id },
    data: {
      status: TranslatorRequestStatus.PUBLISHED,
      publishedNotificationSentAt: new Date(),
    },
  });
}

export async function countPendingAdminTranslatorRequests() {
  return prisma.translatorRequest.count({
    where: {
      status: {
        in: [TranslatorRequestStatus.PENDING_REVIEW, TranslatorRequestStatus.NEW],
      },
    },
  });
}
