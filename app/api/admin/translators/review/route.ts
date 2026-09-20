import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { listEditorialDrafts } from "@/lib/translator-editorial-jobs";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const status = new URL(request.url).searchParams.get("status") || undefined;
  if (status && !["NEEDS_REVIEW", "APPROVED", "DISCARDED", "PUBLISHED"].includes(status)) {
    return apiError(400, "VALIDATION_ERROR", "Invalid review status.");
  }
  return apiOk({ drafts: await listEditorialDrafts(status as "NEEDS_REVIEW" | "APPROVED" | "DISCARDED" | "PUBLISHED" | undefined) });
}
