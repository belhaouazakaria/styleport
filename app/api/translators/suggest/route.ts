import { DISCOVERY_SUGGESTION_LIMIT } from "@/lib/constants";
import { apiError, apiOk } from "@/lib/api-response";
import { getSearchSuggestions } from "@/lib/data/translators";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q) {
    return apiOk({ suggestions: [] });
  }

  if (q.length > 120) {
    return apiError(400, "VALIDATION_ERROR", "Search query is too long.");
  }

  const suggestions = await getSearchSuggestions(q, DISCOVERY_SUGGESTION_LIMIT);
  return apiOk({ suggestions });
}
