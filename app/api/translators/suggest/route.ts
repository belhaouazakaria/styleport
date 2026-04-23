import { DISCOVERY_SUGGESTION_LIMIT } from "@/lib/constants";
import { apiError, apiOk } from "@/lib/api-response";
import { getSearchSuggestions } from "@/lib/data/translators";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/utils";

export async function GET(request: Request) {
  const identifier = extractClientIp(request);
  const limit = checkRateLimit(`translator-suggest:${identifier}`, {
    maxRequests: 90,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return apiOk({ suggestions: [] });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q) {
    return apiOk({ suggestions: [] });
  }

  if (q.length < 2) {
    return apiOk({ suggestions: [] });
  }

  if (q.length > 120) {
    return apiError(400, "VALIDATION_ERROR", "Search query is too long.");
  }

  const suggestions = await getSearchSuggestions(q, DISCOVERY_SUGGESTION_LIMIT);
  return apiOk({ suggestions });
}
