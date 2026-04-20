import { adminRouteGuard } from "@/lib/permissions";
import { apiOk } from "@/lib/api-response";
import { getAdminOverviewStats } from "@/lib/data/translators";
import { getUsageProtectionDashboardData } from "@/lib/usage-protection";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") || 30);

  const [analytics, usageProtection] = await Promise.all([
    getAdminOverviewStats(days),
    getUsageProtectionDashboardData(),
  ]);

  return apiOk({ analytics, usageProtection });
}
