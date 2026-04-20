import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { getAppSettings } from "@/lib/settings";
import { generateTranslatorDraft } from "@/lib/translator-draft";
import { aiDraftInputSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = aiDraftInputSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide a clear brief for AI draft generation.");
  }

  try {
    const settings = await getAppSettings();
    const draft = await generateTranslatorDraft({
      brief: parsed.data.brief,
      model: settings.defaultModelOverride || undefined,
    });

    return apiOk({ draft });
  } catch {
    return apiError(502, "UPSTREAM_ERROR", "Unable to generate AI draft right now.");
  }
}
