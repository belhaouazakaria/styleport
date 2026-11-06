import { apiError, apiOk } from "@/lib/api-response";
import { dailyCadencePolicySchema } from "@/lib/growth/portfolio/daily-cadence";
import { updateGrowthCadencePolicy } from "@/lib/growth/portfolio/cadence-settings";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

/**
 * Configuration-only route: cannot enable Growth, publish Pins or enqueue
 * content jobs. Private admin, authenticated same-origin, exact validated JSON.
 */
export async function PUT(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) {
    return apiError(403, "FORBIDDEN", "Cross-origin Growth cadence updates are not allowed.");
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "BAD_REQUEST", "Invalid JSON payload."); }
  const parsed = dailyCadencePolicySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid daily cadence configuration.");
  }
  const session = await getSessionOrNull();
  if (!session?.user?.id) {
    return apiError(401, "UNAUTHORIZED", "Authentication required.");
  }
  const policy = await updateGrowthCadencePolicy(parsed.data, session.user.id);
  return apiOk({ policy, planningOnly: true, publishingEnabled: false });
}
