import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { apiError, apiOk } from "@/lib/api-response";
import { invalidatePublicTranslatorCaches } from "@/lib/data/translators";
import { adminRouteGuard } from "@/lib/permissions";
import { bulkUpdateEditorialDrafts, getEditorialDraftIdsForReviewFilters, type EditorialDraftReviewStatus } from "@/lib/translator-editorial-jobs";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["approve", "approve_publish", "publish", "discard"]),
  draftIds: z.array(z.string().min(1)).max(5000).default([]),
  selectAllMatching: z.boolean().default(false),
  filters: z.object({ status: z.enum(["NEEDS_REVIEW", "APPROVED", "DISCARDED", "PUBLISHED"]).optional(), q: z.string().max(120).optional() }).default({}),
});

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const session = await auth();
  let input: unknown;
  try { input = await request.json(); } catch { return apiError(400, "BAD_REQUEST", "Invalid JSON payload."); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Invalid bulk review request.");
  const draftIds = parsed.data.selectAllMatching
    ? await getEditorialDraftIdsForReviewFilters({ ...parsed.data.filters, status: parsed.data.filters.status as EditorialDraftReviewStatus | undefined })
    : parsed.data.draftIds;
  if (!draftIds.length) return apiError(400, "VALIDATION_ERROR", "Select at least one draft.");
  const result = await bulkUpdateEditorialDrafts({ action: parsed.data.action, draftIds, reviewedById: session!.user!.id! });
  if (parsed.data.action === "publish" || parsed.data.action === "approve_publish") {
    invalidatePublicTranslatorCaches();
    revalidatePath("/admin/translators");
    revalidatePath("/admin/translators/review");
    revalidatePath("/translators", "layout");
  }
  return apiOk({ result });
}
