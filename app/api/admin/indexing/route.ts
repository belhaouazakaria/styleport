import { adminRouteGuard } from "@/lib/permissions";
import { apiOk } from "@/lib/api-response";
import { listAdminIndexingLogs } from "@/lib/data/indexing";
import { getGoogleIndexingStatus } from "@/lib/google-indexing";
import { adminIndexingFilterSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const parsed = adminIndexingFilterSchema.safeParse({
    q: searchParams.get("q") || undefined,
    status: searchParams.get("status") || undefined,
    source: searchParams.get("source") || undefined,
  });

  const filters = parsed.success ? parsed.data : { status: "all" as const, source: "all" as const };

  const [status, logs] = await Promise.all([
    getGoogleIndexingStatus(),
    listAdminIndexingLogs(filters),
  ]);

  return apiOk({ status, logs });
}
