import { getAppBaseUrl } from "@/lib/env";

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || fetchSite === "cross-site") return false;
  try {
    const requestOrigin = new URL(origin);
    if (requestOrigin.origin !== origin) return false;
    return requestOrigin.origin === getAppBaseUrl().origin;
  } catch {
    return false;
  }
}
