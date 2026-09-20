import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { listEditorialJobs } from "@/lib/translator-editorial-jobs";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  try {
    return apiOk({ jobs: await listEditorialJobs() });
  } catch {
    return apiError(500, "UPSTREAM_ERROR", "Unable to load editorial jobs.");
  }
}
