import { z } from "zod";

import { apiError, apiOk } from "@/lib/api-response";
import { transitionGrowthBudgetWarning, GrowthBudgetWarningError } from "@/lib/growth/economics/warnings";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

const requestSchema = z.object({
  warningId: z.string().regex(/^[A-Za-z0-9_-]{1,191}$/),
  transition: z.enum(["ACKNOWLEDGE", "RESOLVE"]),
}).strict();

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) {
    return apiError(403, "FORBIDDEN", "Cross-origin Growth warning mutations are not allowed.");
  }
  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return apiError(400, "BAD_REQUEST", "Invalid budget warning transition.");
  const session = await getSessionOrNull();
  if (!session?.user?.id) return apiError(401, "UNAUTHORIZED", "Authentication required.");
  try {
    const result = await transitionGrowthBudgetWarning({ ...parsed.data, actorUserId: session.user.id });
    return apiOk(result);
  } catch (error) {
    if (error instanceof GrowthBudgetWarningError) {
      return apiError(409, "CONFLICT", error.message);
    }
    throw error;
  }
}
