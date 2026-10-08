import { z } from "zod";

import { apiError, apiOk } from "@/lib/api-response";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { enqueueIdeaAutopilotDecision } from "@/lib/growth/ideas/service";
import { adminRouteGuard } from "@/lib/permissions";

const schema = z.object({ opportunityId: z.string().min(1).max(64) }).strict();

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) return apiError(403, "FORBIDDEN", "Cross-origin Idea Autopilot requests are not allowed.");
  let payload: unknown;
  try { payload = await request.json(); } catch { return apiError(400, "VALIDATION_ERROR", "A valid JSON payload is required."); }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return apiError(400, "VALIDATION_ERROR", "A valid opportunityId is required.");
  const result = await enqueueIdeaAutopilotDecision(parsed.data.opportunityId);
  return apiOk({ jobId: result.job.id, created: result.created }, result.created ? 202 : 200);
}

