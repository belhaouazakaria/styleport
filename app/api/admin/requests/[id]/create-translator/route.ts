import { TranslatorRequestStatus } from "@prisma/client";

import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { createTranslator } from "@/lib/data/translators";
import {
  getAdminTranslatorRequestById,
  linkRequestToTranslator,
  saveTranslatorRequestDraft,
} from "@/lib/data/requests";
import {
  buildTranslatorDraftBriefFromRequest,
  draftToTranslatorInput,
  generateTranslatorDraft,
} from "@/lib/translator-draft";
import { getCategoryChoices } from "@/lib/data/categories";
import { logError } from "@/lib/logger";
import { getAppSettings } from "@/lib/settings";
import { slugify } from "@/lib/slugify";
import { maybeSendPublishedNotificationForTranslator } from "@/lib/request-publish-notification";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function resolveCategoryId(params: {
  suggestedCategory?: string | null;
  draftCategory?: string | null;
  categories: Array<{ id: string; name: string; slug: string }>;
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

export async function POST(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const [translatorRequest, categories] = await Promise.all([
    getAdminTranslatorRequestById(id),
    getCategoryChoices(),
  ]);

  if (!translatorRequest) {
    return apiError(404, "NOT_FOUND", "Request not found.");
  }

  if (translatorRequest.createdTranslatorId) {
    return apiError(409, "CONFLICT", "A translator was already created for this submission.");
  }

  if (translatorRequest.requesterEmail && !translatorRequest.emailVerifiedAt) {
    return apiError(
      409,
      "CONFLICT",
      "This submission is awaiting email verification and cannot be approved yet.",
    );
  }

  if (!categories.length) {
    return apiError(400, "BAD_REQUEST", "Create at least one category before creating translators.");
  }

  try {
    let draft = translatorRequest.aiDraftJson;

    if (!draft) {
      const settings = await getAppSettings();
      const brief = buildTranslatorDraftBriefFromRequest({
        requestedName: translatorRequest.requestedName,
        description: translatorRequest.description,
        exampleInput: translatorRequest.exampleInput,
        desiredStyle: translatorRequest.desiredStyle,
        suggestedCategory: translatorRequest.suggestedCategory,
        audience: translatorRequest.audience,
        notes: translatorRequest.notes,
      });

      draft = await generateTranslatorDraft({
        brief,
        model: settings.defaultModelOverride || undefined,
      });

      await saveTranslatorRequestDraft(id, draft);
    }

    const categoryId = resolveCategoryId({
      suggestedCategory: translatorRequest.suggestedCategory,
      draftCategory: draft.categorySuggestion,
      categories,
    });

    if (!categoryId) {
      return apiError(400, "BAD_REQUEST", "No category available for this draft.");
    }

    const input = draftToTranslatorInput({
      draft,
      categoryIds: [categoryId],
      primaryCategoryId: categoryId,
    });

    const translator = await createTranslator(input);

    await linkRequestToTranslator(id, {
      translatorId: translator.id,
      status: TranslatorRequestStatus.APPROVED,
    });

    await maybeSendPublishedNotificationForTranslator({
      translator: {
        id: translator.id,
        name: translator.name,
        slug: translator.slug,
        isActive: translator.isActive,
      },
    });

    return apiOk({ translator }, 201);
  } catch (error) {
    logError(
      "create_translator_from_request_failed",
      "Unable to create translator from request submission.",
      { requestId: id },
      error,
    );
    return apiError(500, "BAD_REQUEST", "Unable to create translator from draft right now.");
  }
}
