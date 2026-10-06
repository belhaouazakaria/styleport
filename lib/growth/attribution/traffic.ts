import { checkRateLimit } from "@/lib/rate-limit";
import { extractClientIp, hashIp } from "@/lib/utils";
import {
  ATTRIBUTION_PUBLIC_BODY_MAX_BYTES,
  ATTRIBUTION_PUBLIC_RATE_LIMIT,
  ATTRIBUTION_PUBLIC_RATE_WINDOW_MS,
} from "@/lib/growth/attribution/constants";
import { isSameOriginMutation } from "@/lib/growth/request-security";

const KNOWN_BOT_PATTERN = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|pinterestbot|headless|lighthouse|preview/i;

export function isAttributionPrefetch(request: Request) {
  return request.method === "HEAD" || [
    request.headers.get("purpose"),
    request.headers.get("sec-purpose"),
    request.headers.get("x-purpose"),
  ].some((value) => value?.toLowerCase().includes("prefetch")) || request.headers.has("next-router-prefetch");
}

export function isKnownAttributionBot(request: Request) {
  return KNOWN_BOT_PATTERN.test(request.headers.get("user-agent") || "");
}

export function attributionRequestAllowed(request: Request) {
  if (!isSameOriginMutation(request) || isAttributionPrefetch(request) || isKnownAttributionBot(request)) return false;
  const transientRateKey = hashIp(extractClientIp(request));
  return checkRateLimit(`growth-attribution:${transientRateKey}`, {
    maxRequests: ATTRIBUTION_PUBLIC_RATE_LIMIT,
    windowMs: ATTRIBUTION_PUBLIC_RATE_WINDOW_MS,
  }).allowed;
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new Error("JSON_REQUIRED");
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > ATTRIBUTION_PUBLIC_BODY_MAX_BYTES) throw new Error("BODY_TOO_LARGE");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > ATTRIBUTION_PUBLIC_BODY_MAX_BYTES) throw new Error("BODY_TOO_LARGE");
  return JSON.parse(text);
}
