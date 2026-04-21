import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { regenerateTranslatorShareImage } from "@/lib/data/translators";
import { getShareImageAbsoluteUrl } from "@/lib/share-images";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;

  try {
    const result = await regenerateTranslatorShareImage(id);
    if (!result) {
      return apiError(404, "NOT_FOUND", "Translator not found.");
    }

    return apiOk({
      regenerated: true,
      shareImagePath: result.shareImagePath,
      shareImageUrl: getShareImageAbsoluteUrl(result.shareImagePath),
      shareImageUpdatedAt: result.shareImageUpdatedAt?.toISOString() || null,
    });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to regenerate share image right now.");
  }
}
