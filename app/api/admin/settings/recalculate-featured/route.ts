import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { getAppSettings } from "@/lib/settings";
import { recalculateAutoFeaturedTranslators } from "@/lib/data/translators";

export async function POST() {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const settings = await getAppSettings();

  try {
    const result = await recalculateAutoFeaturedTranslators({
      force: true,
      windowDays: settings.autoFeaturedWindowDays,
      source: "manual",
    });

    return apiOk({
      recalculated: true,
      windowDays: result.windowDays,
      featured: result.featured,
    });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to recalculate featured translators right now.");
  }
}
