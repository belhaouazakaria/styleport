import { apiError, apiOk } from "@/lib/api-response";
import { prepareEvergreenRecommendationSchema } from "@/lib/growth/learning/contracts";
import { prepareEvergreenRecommendation } from "@/lib/growth/learning/service";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request))
    return apiError(
      403,
      "FORBIDDEN",
      "Cross-origin preparation requests are not allowed.",
    );
  const session = await getSessionOrNull();
  if (!session?.user?.id)
    return apiError(401, "UNAUTHORIZED", "Admin authentication is required.");
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "A valid JSON body is required.");
  }
  const parsed = prepareEvergreenRecommendationSchema.safeParse(input);
  if (!parsed.success)
    return apiError(
      400,
      "VALIDATION_ERROR",
      "Invalid recommendation preparation request.",
    );
  try {
    const result = await prepareEvergreenRecommendation(
      parsed.data,
      session.user.id,
    );
    return apiOk(
      { jobId: result.job.id, created: result.created },
      result.created ? 202 : 200,
    );
  } catch (error) {
    return apiError(
      409,
      "CONFLICT",
      error instanceof Error
        ? error.message
        : "The recommendation could not be prepared.",
    );
  }
}
