import { TranslatorRequestStatus } from "@prisma/client";

import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { createTranslator } from "@/lib/data/translators";
import { getAdminTranslatorRequestById, linkRequestToTranslator } from "@/lib/data/requests";
import { draftToTranslatorInput } from "@/lib/translator-draft";
import { getCategoryChoices } from "@/lib/data/categories";
import { slugify } from "@/lib/slugify";

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

  if (!translatorRequest.aiDraftJson) {
    return apiError(400, "BAD_REQUEST", "No AI draft found for this request.");
  }

  if (!categories.length) {
    return apiError(400, "BAD_REQUEST", "Create at least one category before creating translators.");
  }

  try {
    const categoryId = resolveCategoryId({
      suggestedCategory: translatorRequest.suggestedCategory,
      draftCategory: translatorRequest.aiDraftJson.categorySuggestion,
      categories,
    });

    if (!categoryId) {
      return apiError(400, "BAD_REQUEST", "No category available for this draft.");
    }

    const input = draftToTranslatorInput({
      draft: translatorRequest.aiDraftJson,
      categoryIds: [categoryId],
      primaryCategoryId: categoryId,
    });

    const translator = await createTranslator(input);

    await linkRequestToTranslator(id, {
      translatorId: translator.id,
      status: TranslatorRequestStatus.COMPLETED,
    });

    return apiOk({ translator }, 201);
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to create translator from draft right now.");
  }
}
