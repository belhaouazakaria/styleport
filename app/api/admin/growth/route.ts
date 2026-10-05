import { apiOk } from "@/lib/api-response";
import { getGrowthFoundationOverview } from "@/lib/growth/admin";
import { adminRouteGuard } from "@/lib/permissions";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const growth = await getGrowthFoundationOverview();
  return apiOk({ growth });
}
