import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import {
  getUsageProtectionDashboardData,
  updateUsageProtectionSettings,
} from "@/lib/usage-protection";
import { usageProtectionSettingsSchema } from "@/lib/validators";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const data = await getUsageProtectionDashboardData();
  return apiOk({ usageProtection: data });
}

export async function PUT(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = usageProtectionSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid usage protection settings.");
  }

  const state = await updateUsageProtectionSettings({
    ...parsed.data,
    alertEmail: parsed.data.alertEmail || "",
  });

  const usageProtection = await getUsageProtectionDashboardData();
  return apiOk({ state, usageProtection });
}
