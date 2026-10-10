import { createHash } from "node:crypto";
import { getAppBaseUrl } from "@/lib/env";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function pinApprovalSnapshotChecksum(snapshot: unknown) { return createHash("sha256").update(canonical(snapshot)).digest("hex"); }
export function buildPublicCreativeAssetUrl(publicPath: string, baseUrl = getAppBaseUrl()) {
  if (!/^\/generated\/growth-creatives\/creative-[a-f0-9]{64}\.png$/.test(publicPath)) throw new Error("Creative asset path is not publishable.");
  const url = new URL(publicPath, baseUrl);
  if (url.origin !== baseUrl.origin || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) throw new Error("Creative asset URL must use the canonical HTTPS SayTwist origin.");
  return url.toString();
}
