import { apiError, apiOk } from "@/lib/api-response";
import { learningExperimentActionSchema } from "@/lib/growth/learning/contracts";
import { transitionLearningExperiment } from "@/lib/growth/learning/service";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard, getSessionOrNull } from "@/lib/permissions";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request))
    return apiError(
      403,
      "FORBIDDEN",
      "Cross-origin experiment requests are not allowed.",
    );
  const session = await getSessionOrNull();
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "A valid JSON body is required.");
  }
  const parsed = learningExperimentActionSchema.safeParse(input);
  if (!parsed.success || !session?.user?.id)
    return apiError(
      400,
      "VALIDATION_ERROR",
      "Invalid experiment action request.",
    );
  try {
    const experiment = await transitionLearningExperiment(
      parsed.data,
      session.user.id,
    );
    return apiOk({ experimentId: experiment.id, status: experiment.status });
  } catch (error) {
    return apiError(
      409,
      "CONFLICT",
      error instanceof Error ? error.message : "The experiment action failed.",
    );
  }
}
