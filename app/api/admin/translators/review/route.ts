import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { listEditorialDrafts, listFailedEditorialItems } from "@/lib/translator-editorial-jobs";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const searchParams = new URL(request.url).searchParams;
  const status = searchParams.get("status") || undefined;
  if (status && !["NEEDS_REVIEW", "APPROVED", "DISCARDED", "PUBLISHED", "FAILED"].includes(status)) {
    return apiError(400, "VALIDATION_ERROR", "Invalid review status.");
  }
  const paging = {
    q: searchParams.get("q") || undefined,
    page: Number(searchParams.get("page") || 1),
    pageSize: Number(searchParams.get("pageSize") || 25),
  };
  const result = status === "FAILED" ? await listFailedEditorialItems(paging) : await listEditorialDrafts({
    status: status as "NEEDS_REVIEW" | "APPROVED" | "DISCARDED" | "PUBLISHED" | undefined,
    ...paging,
  });
  return apiOk(result);
}
