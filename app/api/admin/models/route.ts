import { adminRouteGuard } from "@/lib/permissions";
import { apiOk } from "@/lib/api-response";
import { getAvailableModels } from "@/lib/model-catalog";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  const models = await getAvailableModels(forceRefresh);
  return apiOk({ models });
}
