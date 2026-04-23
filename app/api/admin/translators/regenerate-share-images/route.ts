import { z } from "zod";

import { apiError, apiOk } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { adminRouteGuard } from "@/lib/permissions";
import { ensureTranslatorShareImageById, getShareImageAbsoluteUrl } from "@/lib/share-images";

const bulkRegenerateSchema = z.object({
  translatorIds: z.array(z.string().min(1)).min(1).max(100),
});

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = bulkRegenerateSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide at least one translator ID.");
  }

  const uniqueIds = Array.from(new Set(parsed.data.translatorIds));
  const results: Array<{
    translatorId: string;
    regenerated: boolean;
    shareImagePath: string | null;
    shareImageUrl: string | null;
    shareImageUpdatedAt: string | null;
    error: string | null;
  }> = [];

  for (const translatorId of uniqueIds) {
    try {
      const result = await ensureTranslatorShareImageById(translatorId, {
        force: true,
        throwOnError: true,
      });

      if (!result || !result.shareImagePath || !result.shareImageUpdatedAt) {
        results.push({
          translatorId,
          regenerated: false,
          shareImagePath: null,
          shareImageUrl: null,
          shareImageUpdatedAt: null,
          error: "Unable to regenerate image for this translator.",
        });
        continue;
      }

      results.push({
        translatorId,
        regenerated: true,
        shareImagePath: result.shareImagePath,
        shareImageUrl: getShareImageAbsoluteUrl(result.shareImagePath),
        shareImageUpdatedAt: result.shareImageUpdatedAt.toISOString(),
        error: null,
      });
    } catch (error) {
      logError(
        "admin_bulk_regenerate_share_image_failed",
        "Bulk share-image regeneration failed for translator.",
        { translatorId },
        error,
      );
      results.push({
        translatorId,
        regenerated: false,
        shareImagePath: null,
        shareImageUrl: null,
        shareImageUpdatedAt: null,
        error: "Unable to regenerate image for this translator.",
      });
    }
  }

  const regeneratedCount = results.filter((item) => item.regenerated).length;
  const failedCount = results.length - regeneratedCount;

  return apiOk({
    regeneratedCount,
    failedCount,
    results,
  });
}

