import { apiError, apiOk } from "@/lib/api-response";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import { requestDailyPinGapFill } from "@/lib/growth/portfolio/request-daily-pin-gap-fill";
import { adminRouteGuard } from "@/lib/permissions";

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
    return apiOk(result, result.queued ? 202 : 200);
  } catch {
    return apiError(
      409,
      "CONFLICT",
      "Could not request Pin drafts. Check Growth status and try again.",
    );
  }
}
