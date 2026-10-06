import { apiError, apiOk } from "@/lib/api-response";
import { enqueueOpportunityAnalysis } from "@/lib/growth/opportunity/analysis";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard } from "@/lib/permissions";
export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request))
    return apiError(
      403,
      "FORBIDDEN",
      "Cross-origin opportunity analysis requests are not allowed.",
    );
  const result = await enqueueOpportunityAnalysis();
  return apiOk(
    { jobId: result.job.id, created: result.created },
    result.created ? 202 : 200,
  );
}
