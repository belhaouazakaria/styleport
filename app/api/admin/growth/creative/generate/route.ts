import { apiError, apiOk } from "@/lib/api-response";
import { enqueueCreativeGeneration } from "@/lib/growth/creative/candidates";
import { creativeGenerationRequestSchema } from "@/lib/growth/creative/contracts";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin Creative Lab requests are not allowed.");
  let input: unknown;
  try { input = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  const parsed = creativeGenerationRequestSchema.safeParse(input);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Invalid Creative Lab generation request.");
  try {
    const result = await enqueueCreativeGeneration(parsed.data);
    return apiOk({ jobId: result.job.id, created: result.created }, result.created ? 202 : 200);
  } catch (error) {
    return apiError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Creative target is unavailable.");
  }
}
