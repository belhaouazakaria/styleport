import { apiError, apiOk } from "@/lib/api-response";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { enqueueAccountStrategyReview } from "@/lib/growth/strategy/review";
import { adminRouteGuard } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) {
    return apiError(
      403,
      "FORBIDDEN",
      "Cross-origin strategy review requests are not allowed.",
    );
  }
  const result = await enqueueAccountStrategyReview();
  return apiOk(
    { jobId: result.job.id, created: result.created },
    result.created ? 202 : 200,
  );
}
