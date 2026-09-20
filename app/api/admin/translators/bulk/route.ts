import { prisma } from "@/lib/prisma";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { getAdminTranslatorIdsForBulk, type AdminTranslatorFilters } from "@/lib/data/translators";

const GENERATION_ACTIONS = new Set([
  "generate-missing",
  "regenerate-full",
  "regenerate-about",
  "regenerate-examples",
  "regenerate-faq",
  "regenerate-tips",
]);

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  if (!payload || typeof payload !== "object") {
    return apiError(400, "VALIDATION_ERROR", "Invalid bulk action payload.");
  }

  const input = payload as {
    action?: unknown;
    translatorIds?: unknown;
    selectAllMatching?: unknown;
    filters?: AdminTranslatorFilters;
  };
  const action = typeof input.action === "string" ? input.action : "";
  if (!GENERATION_ACTIONS.has(action) && action !== "activate" && action !== "deactivate") {
    return apiError(400, "VALIDATION_ERROR", "Choose a valid bulk action.");
  }

  if (GENERATION_ACTIONS.has(action)) {
    return apiError(501, "UPSTREAM_ERROR", "Background editorial generation is not configured yet. No content was generated.");
  }

  const selectedIds = Array.isArray(input.translatorIds)
    ? input.translatorIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const ids = input.selectAllMatching
    ? await getAdminTranslatorIdsForBulk(input.filters || {})
    : Array.from(new Set(selectedIds));

  if (!ids.length) {
    return apiError(400, "VALIDATION_ERROR", "Select at least one translator.");
  }

  const result = await prisma.translator.updateMany({
    where: { id: { in: ids }, archivedAt: null },
    data: { isActive: action === "activate" },
  });

  return apiOk({ updatedCount: result.count, message: `${result.count} translator${result.count === 1 ? "" : "s"} updated.` });
}
