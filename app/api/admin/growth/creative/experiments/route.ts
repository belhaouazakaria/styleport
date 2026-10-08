import { z } from "zod";

import { apiError, apiOk } from "@/lib/api-response";
import { ATTRIBUTION_MODEL_VERSION } from "@/lib/growth/attribution/constants";
import { CREATIVE_EXPERIMENT_VERSION } from "@/lib/growth/creative/constants";
import { createExperimentSchema } from "@/lib/growth/creative/contracts";
import { createDraftCreativeExperiment } from "@/lib/growth/creative/experiments";
import { OPPORTUNITY_SCORING_VERSION } from "@/lib/growth/opportunity/constants";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { adminRouteGuard } from "@/lib/permissions";

const requestSchema = createExperimentSchema.omit({ attributionModelVersion: true, scoringModelVersion: true, experimentModelVersion: true }).strict();

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin Creative Lab requests are not allowed.");
  let input: unknown;
  try { input = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "Invalid Creative Lab experiment request.");
  try {
    const experiment = await createDraftCreativeExperiment({ ...parsed.data, attributionModelVersion: ATTRIBUTION_MODEL_VERSION, scoringModelVersion: OPPORTUNITY_SCORING_VERSION, experimentModelVersion: CREATIVE_EXPERIMENT_VERSION });
    return apiOk({ experimentId: experiment.id, status: experiment.status }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return apiError(400, "VALIDATION_ERROR", "Invalid Creative Lab experiment request.");
    return apiError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Creative experiment could not be created.");
  }
}
