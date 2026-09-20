import { prisma } from "@/lib/prisma";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { getAdminTranslatorIdsForBulk, type AdminTranslatorFilters } from "@/lib/data/translators";
import { auth } from "@/auth";
import { createEditorialJob } from "@/lib/translator-editorial-jobs";

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

  const selectedIds = Array.isArray(input.translatorIds)
    ? input.translatorIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const ids = input.selectAllMatching
    ? await getAdminTranslatorIdsForBulk(input.filters || {})
    : Array.from(new Set(selectedIds));

  if (!ids.length) {
    return apiError(400, "VALIDATION_ERROR", "Select at least one translator.");
  }

  if (GENERATION_ACTIONS.has(action)) {
    const session = await auth();
    try {
      const job = await createEditorialJob({
        operation: action,
        translatorIds: selectedIds,
        selectAllMatching: Boolean(input.selectAllMatching),
        filters: input.filters,
        requestedById: session?.user?.id || null,
      });
      return apiOk({
        job,
        message: `${job.type.replaceAll("_", " ")} queued for ${job.totalItems} translator${job.totalItems === 1 ? "" : "s"}.`,
      }, 202);
    } catch (error) {
      return apiError(409, "CONFLICT", error instanceof Error ? error.message : "Unable to create editorial job.");
    }
  }

  const result = await prisma.translator.updateMany({
    where: { id: { in: ids }, archivedAt: null },
    data: { isActive: action === "activate" },
  });

  return apiOk({ updatedCount: result.count, message: `${result.count} translator${result.count === 1 ? "" : "s"} updated.` });
}
