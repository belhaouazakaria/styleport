import { TranslatorRequestStatus } from "@prisma/client";

import { getCategoryChoices } from "@/lib/data/categories";
import {
  getAdminTranslatorRequestById,
  linkRequestToTranslator,
  saveTranslatorRequestDraft,
  updateTranslatorRequestById,
} from "@/lib/data/requests";
import { createTranslator } from "@/lib/data/translators";
import { logError, logWarn } from "@/lib/logger";
import { assessTranslatorRequestForAutoApproval } from "@/lib/moderation";
import { maybeSendPublishedNotificationForTranslator } from "@/lib/request-publish-notification";
import { getAppSettings } from "@/lib/settings";
import { slugify } from "@/lib/slugify";
import {
  buildTranslatorDraftBriefFromRequest,
  draftToTranslatorInput,
  generateTranslatorDraft,
} from "@/lib/translator-draft";
import type { ApiErrorCode, AdminTranslatorRequestDetail } from "@/lib/types";

interface CategoryChoice {
  id: string;
  name: string;
  slug: string;
}

interface BuildTranslatorFromRequestInput {
  requestId: string;
  activateTranslator?: boolean;
  requestUrl?: string;
}

interface BuildTranslatorFromRequestResult {
  translator: {
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
  };
  publishNotificationSent: boolean;
}

interface ProcessVerifiedRequestInput {
  requestId: string;
  requestUrl?: string;
}

type ProcessVerifiedRequestResult =
  | { outcome: "REQUEST_NOT_FOUND" }
  | { outcome: "ALREADY_LINKED"; translatorId: string }
  | { outcome: "NOT_VERIFIED" }
  | {
      outcome: "AUTO_PUBLISHED";
      translatorId: string;
      translatorSlug: string;
      publishNotificationSent: boolean;
    }
  | { outcome: "MANUAL_REVIEW"; reason: string };

export class RequestProcessingError extends Error {
  status: number;
  code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "RequestProcessingError";
    this.status = status;
    this.code = code;
  }
}

function resolveCategoryId(params: {
  suggestedCategory?: string | null;
  draftCategory?: string | null;
  categories: CategoryChoice[];
}) {
  const candidates = [params.suggestedCategory, params.draftCategory]
    .filter(Boolean)
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    const bySlug = params.categories.find((item) => item.slug === slugify(candidate));
    if (bySlug) {
      return bySlug.id;
    }

    const byName = params.categories.find((item) => item.name.toLowerCase() === candidate);
    if (byName) {
      return byName.id;
    }
  }

  return params.categories[0]?.id || null;
}

function appendAdminNote(existing: string | null, note: string) {
  const trimmedExisting = existing?.trim();
  if (!trimmedExisting) {
    return note;
  }

  return `${trimmedExisting}\n\n${note}`;
}

function buildFallbackReviewNote(reason: string) {
  return `[Auto-processing fallback] ${reason}`;
}

async function ensureDraftForRequest(request: AdminTranslatorRequestDetail) {
  if (request.aiDraftJson) {
    return request.aiDraftJson;
  }

  const settings = await getAppSettings();
  const brief = buildTranslatorDraftBriefFromRequest({
    requestedName: request.requestedName,
    description: request.description,
    exampleInput: request.exampleInput,
    desiredStyle: request.desiredStyle,
    suggestedCategory: request.suggestedCategory,
    audience: request.audience,
    notes: request.notes,
  });

  const draft = await generateTranslatorDraft({
    brief,
    model: settings.defaultModelOverride || undefined,
  });

  await saveTranslatorRequestDraft(request.id, draft);
  return draft;
}

export async function buildTranslatorFromRequest(
  input: BuildTranslatorFromRequestInput,
): Promise<BuildTranslatorFromRequestResult> {
  const [request, categories] = await Promise.all([
    getAdminTranslatorRequestById(input.requestId),
    getCategoryChoices(),
  ]);

  if (!request) {
    throw new RequestProcessingError(404, "NOT_FOUND", "Request not found.");
  }

  if (request.createdTranslatorId) {
    throw new RequestProcessingError(409, "CONFLICT", "A translator was already created for this submission.");
  }

  if (request.requesterEmail && !request.emailVerifiedAt) {
    throw new RequestProcessingError(
      409,
      "CONFLICT",
      "This submission is awaiting email verification and cannot be approved yet.",
    );
  }

  if (!categories.length) {
    throw new RequestProcessingError(
      400,
      "BAD_REQUEST",
      "Create at least one category before creating translators.",
    );
  }

  const draft = await ensureDraftForRequest(request);
  const categoryId = resolveCategoryId({
    suggestedCategory: request.suggestedCategory,
    draftCategory: draft.categorySuggestion,
    categories,
  });

  if (!categoryId) {
    throw new RequestProcessingError(400, "BAD_REQUEST", "No category available for this draft.");
  }

  const translatorInput = draftToTranslatorInput({
    draft,
    categoryIds: [categoryId],
    primaryCategoryId: categoryId,
  });
  translatorInput.isActive = Boolean(input.activateTranslator);

  const translator = await createTranslator(translatorInput);

  await linkRequestToTranslator(request.id, {
    translatorId: translator.id,
    status: input.activateTranslator ? TranslatorRequestStatus.PUBLISHED : TranslatorRequestStatus.APPROVED,
  });

  let publishNotificationSent = false;
  try {
    const notification = await maybeSendPublishedNotificationForTranslator({
      translator: {
        id: translator.id,
        name: translator.name,
        slug: translator.slug,
        isActive: translator.isActive,
      },
      requestUrl: input.requestUrl,
    });
    publishNotificationSent = notification.publishNotificationSent;
  } catch (error) {
    logWarn(
      "request_publish_notification_exception",
      "Translator created but publish notification check raised an exception.",
      {
        requestId: request.id,
        translatorId: translator.id,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }

  return {
    translator: {
      id: translator.id,
      slug: translator.slug,
      name: translator.name,
      isActive: translator.isActive,
    },
    publishNotificationSent,
  };
}

export async function processVerifiedTranslatorRequest(
  input: ProcessVerifiedRequestInput,
): Promise<ProcessVerifiedRequestResult> {
  const request = await getAdminTranslatorRequestById(input.requestId);

  if (!request) {
    return { outcome: "REQUEST_NOT_FOUND" };
  }

  if (request.createdTranslatorId) {
    return { outcome: "ALREADY_LINKED", translatorId: request.createdTranslatorId };
  }

  if (request.requesterEmail && !request.emailVerifiedAt) {
    return { outcome: "NOT_VERIFIED" };
  }

  const quality = assessTranslatorRequestForAutoApproval({
    requestedName: request.requestedName,
    description: request.description,
    desiredStyle: request.desiredStyle,
    audience: request.audience,
    notes: request.notes,
  });

  if (quality.verdict === "manual_review") {
    const reason = quality.reason || "Submission requires manual moderation review.";
    await updateTranslatorRequestById(request.id, {
      status: TranslatorRequestStatus.PENDING_REVIEW,
      adminNotes: appendAdminNote(request.adminNotes, buildFallbackReviewNote(reason)),
    });
    return { outcome: "MANUAL_REVIEW", reason };
  }

  try {
    const built = await buildTranslatorFromRequest({
      requestId: request.id,
      activateTranslator: true,
      requestUrl: input.requestUrl,
    });

    return {
      outcome: "AUTO_PUBLISHED",
      translatorId: built.translator.id,
      translatorSlug: built.translator.slug,
      publishNotificationSent: built.publishNotificationSent,
    };
  } catch (error) {
    const reason =
      error instanceof Error
        ? `Automatic translator creation failed (${error.message}).`
        : "Automatic translator creation failed.";

    logWarn("auto_request_create_failed", "Verified submission moved to manual review after auto-create failure.", {
      requestId: request.id,
      reason,
    });

    await updateTranslatorRequestById(request.id, {
      status: TranslatorRequestStatus.PENDING_REVIEW,
      adminNotes: appendAdminNote(request.adminNotes, buildFallbackReviewNote(reason)),
    });

    return {
      outcome: "MANUAL_REVIEW",
      reason,
    };
  }
}

export function toApiErrorResponse(error: unknown): { status: number; code: ApiErrorCode; message: string } {
  if (error instanceof RequestProcessingError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }

  logError("request_processing_failed", "Unexpected request processing error.", undefined, error);
  return {
    status: 500,
    code: "UPSTREAM_ERROR",
    message: "Unable to process this submission right now.",
  };
}
