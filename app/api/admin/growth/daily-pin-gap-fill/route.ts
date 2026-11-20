import { apiError, apiOk } from "@/lib/api-response";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { requestDailyPinGapFill } from "@/lib/growth/portfolio/request-daily-pin-gap-fill";
import { adminRouteGuard } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const JOB_ID = /^[A-Za-z0-9_-]{1,191}$/;
const REQUEST_ID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId") || "";
  const ids = (url.searchParams.get("jobIds") || "").split(",").filter(Boolean);
  if (
    !REQUEST_ID.test(requestId) ||
    !ids.length ||
    ids.length > 3 ||
    ids.some((id) => !JOB_ID.test(id))
  ) {
    return apiError(400, "BAD_REQUEST", "Invalid gap-fill request reference.");
  }
  try {
    const jobs = await prisma.growthJob.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, payload: true },
    });
    const scopedJobs = jobs.filter((job) => {
      const payload = job.payload as {
        manualGapFillRequestId?: unknown;
      } | null;
      return payload?.manualGapFillRequestId === requestId;
    });
    if (scopedJobs.length !== ids.length) {
      return apiError(404, "NOT_FOUND", "Gap-fill request was not found.");
    }
    const candidates = await prisma.growthPinCandidate.findMany({
      where: { generationJobId: { in: ids } },
      select: { generationJobId: true, status: true },
    });
    return apiOk({
      jobs: scopedJobs.map((job) => ({
        id: job.id,
        status: job.status,
        candidateStatus:
          candidates.find((candidate) => candidate.generationJobId === job.id)
            ?.status ?? null,
      })),
    });
  } catch {
    return apiError(
      500,
      "CONFLICT",
      "Could not check Pin draft generation status.",
    );
  }
}

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) {
    return apiError(
      403,
      "FORBIDDEN",
      "Cross-origin Growth requests are not allowed.",
    );
  }
  try {
    const result = await requestDailyPinGapFill();
    if (result.status === "NO_NATIVE_ALLOCATION") {
      return apiError(
        409,
        "CONFLICT",
        "There is no active SayTwist allocation for today.",
      );
    }
    return apiOk(result, result.status === "PROCESSING" ? 202 : 200);
  } catch {
    return apiError(
      409,
      "CONFLICT",
      "Could not request Pin drafts. Check Growth status and try again.",
    );
  }
}
