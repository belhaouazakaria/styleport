import { apiError, apiOk } from "@/lib/api-response";
import { growthSettingsSchema } from "@/lib/growth/contracts";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { updateGrowthSettings } from "@/lib/growth/settings";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

export async function PUT(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) {
    return apiError(403, "FORBIDDEN", "Cross-origin Growth settings updates are not allowed.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = growthSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid Growth settings.");
  }

  const session = await getSessionOrNull();
  if (!session?.user?.id) return apiError(401, "UNAUTHORIZED", "Authentication required.");

  const settings = await updateGrowthSettings(parsed.data, session.user.id);
  return apiOk({ settings });
}
