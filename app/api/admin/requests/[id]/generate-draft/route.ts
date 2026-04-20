import { getAppSettings } from "@/lib/settings";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { getAdminTranslatorRequestById, saveTranslatorRequestDraft } from "@/lib/data/requests";
import { buildTranslatorDraftBriefFromRequest, generateTranslatorDraft } from "@/lib/translator-draft";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const translatorRequest = await getAdminTranslatorRequestById(id);

  if (!translatorRequest) {
    return apiError(404, "NOT_FOUND", "Request not found.");
  }

  try {
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

    const draft = await generateTranslatorDraft({
      brief,
      model: settings.defaultModelOverride || undefined,
    });

    await saveTranslatorRequestDraft(id, draft);

    return apiOk({ draft });
  } catch {
    return apiError(502, "UPSTREAM_ERROR", "Unable to generate a draft right now.");
  }
}
