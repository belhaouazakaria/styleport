import { prisma } from "@/lib/prisma";
import { getAppSettings, updateAppSettings } from "@/lib/settings";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { settingsSchema } from "@/lib/validators";
import { getAutoFeaturedSummary, recalculateAutoFeaturedTranslators } from "@/lib/data/translators";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const [settings, translators, autoFeatured] = await Promise.all([
    getAppSettings(),
    prisma.translator.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    }),
    getAutoFeaturedSummary(),
  ]);

  return apiOk({ settings, translators, autoFeatured });
}

export async function PUT(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid settings.");
  }

  await updateAppSettings({
    ...parsed.data,
    defaultModelOverride: parsed.data.defaultModelOverride || "",
    adSenseClientId: parsed.data.adSenseClientId || "",
    customHeadCode: parsed.data.customHeadCode || "",
    autoFeaturedLastRecalculatedAt: parsed.data.autoFeaturedEnabled
      ? new Date().toISOString()
      : "",
  });

  if (parsed.data.autoFeaturedEnabled) {
    await recalculateAutoFeaturedTranslators({
      force: true,
      windowDays: parsed.data.autoFeaturedWindowDays,
      source: "manual",
    });
  }

  return apiOk({ saved: true });
}
