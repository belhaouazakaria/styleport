import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ensureTranslatorShareImageById, getShareImageAbsoluteUrl } from "@/lib/share-images";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;

  try {
    const existing = await prisma.translator.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return apiError(404, "NOT_FOUND", "Translator not found.");
    }

    const result = await ensureTranslatorShareImageById(id, {
      force: true,
      throwOnError: true,
    });
    if (!result) {
      return apiError(404, "NOT_FOUND", "Translator not found.");
    }

    const shareImageUrl = getShareImageAbsoluteUrl(result.shareImagePath);
    if (!result.shareImagePath || !shareImageUrl || !result.shareImageUpdatedAt) {
      logError("admin_regenerate_share_image_invalid_result", "Regeneration returned incomplete image metadata.", {
        translatorId: id,
        shareImagePath: result.shareImagePath,
        shareImageUrl,
        shareImageUpdatedAt: result.shareImageUpdatedAt?.toISOString() || null,
      });
      return apiError(500, "UPSTREAM_ERROR", "Unable to regenerate share image right now.");
    }

    return apiOk({
      regenerated: true,
      shareImagePath: result.shareImagePath,
      shareImageUrl,
      shareImageUpdatedAt: result.shareImageUpdatedAt.toISOString(),
    });
  } catch (error) {
    logError(
      "admin_regenerate_share_image_failed",
      "Admin regenerate-share-image request failed.",
      { translatorId: id },
      error,
    );
    return apiError(500, "UPSTREAM_ERROR", "Unable to regenerate share image right now.");
  }
}
