import { apiError, apiOk } from "@/lib/api-response";
import { adminRouteGuard } from "@/lib/permissions";
import { isSameOriginMutation } from "@/lib/growth/request-security";
import {
  fetchAuthorizedPinterestMarketTrends, MarketResearchUnavailable,
} from "@/lib/growth/market-research/pinterest-trends";
import { evaluateAndArchiveMarketTrends } from "@/lib/growth/market-research/gaps";

/**
 * Owner-triggered read-only market scan. Source access and rolling quota are
 * independently disabled by default; never queues AI/content/Pin jobs.
 */
export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  if (!isSameOriginMutation(request)) {
    return apiError(403, "FORBIDDEN", "Cross-origin research is not permitted.");
  }
  // Accept no client-side URL, account, query or provider payload.
  let parsed: unknown;
  try { parsed = await request.json(); }
  catch { return apiError(400, "BAD_REQUEST", "Invalid JSON."); }
  if (!parsed || typeof parsed !== "object" ||
      Array.isArray(parsed) || Object.keys(parsed).length !== 0) {
    return apiError(400, "VALIDATION_ERROR", "No research parameters are accepted.");
  }
  try {
    const trends = await fetchAuthorizedPinterestMarketTrends();
    const report = await evaluateAndArchiveMarketTrends(trends);
    return apiOk({ report });
  } catch (error) {
    if (error instanceof MarketResearchUnavailable) {
      const code = error.reason;
      if (code === "DISABLED" || code === "PROVIDER_ACCESS_NOT_CONFIRMED") {
        return apiError(409, "CONFLICT",
          "Market discovery is not enabled or Pinterest Trends access has not been approved.");
      }
      return apiError(code === "ALREADY_RESEARCHED" ? 429 : 503,
        code === "ALREADY_RESEARCHED" ? "RATE_LIMITED" : "UPSTREAM_ERROR",
        "Research source unavailable. Existing intelligence remains active.");
    }
    return apiError(503, "UPSTREAM_ERROR",
      "Research source unavailable. No content was published.");
  }
}
