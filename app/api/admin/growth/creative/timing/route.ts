import { apiError, apiOk } from "@/lib/api-response";
import { recommendPublicationTiming } from "@/lib/growth/publishing/service";
import { adminRouteGuard } from "@/lib/permissions";

export async function GET(request: Request) {
  const guard = await adminRouteGuard(); if (guard) return guard;
  const url = new URL(request.url); const candidateId = url.searchParams.get("candidateId"); const accountId = url.searchParams.get("accountId");
  if (!candidateId || !accountId || candidateId.length > 191 || accountId.length > 191) return apiError(400, "VALIDATION_ERROR", "Candidate and account are required.");
  const result = await recommendPublicationTiming(accountId, candidateId);
  return apiOk({ scheduledAt: result.scheduledAt.toISOString(), mode: result.mode, timeZone: "America/New_York" });
}
