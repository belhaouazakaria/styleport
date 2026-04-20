import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { listAdminTranslatorRequests } from "@/lib/data/requests";
import { adminRequestFilterSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const parsed = adminRequestFilterSchema.safeParse({
    q: searchParams.get("q") || undefined,
    status: searchParams.get("status") || undefined,
    category: searchParams.get("category") || undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
  });

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid request filter query.");
  }

  const requests = await listAdminTranslatorRequests(parsed.data);
  return apiOk({ requests });
}
