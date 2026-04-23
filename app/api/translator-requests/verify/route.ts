import { NextResponse } from "next/server";

import { verifyTranslatorRequestEmailToken } from "@/lib/data/requests";
import { getAppBaseUrl } from "@/lib/env";

function buildRedirectUrl(baseUrl: URL, status: string, requestId?: string) {
  const url = new URL("/create-translator/verify", baseUrl);
  url.searchParams.set("status", status);

  if (requestId) {
    url.searchParams.set("requestId", requestId);
  }

  return url;
}

export async function GET(request: Request) {
  const baseUrl = getAppBaseUrl({ requestUrl: request.url });
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || "";
  const requestId = searchParams.get("requestId") || undefined;

  const result = await verifyTranslatorRequestEmailToken(token);

  if (result.outcome === "VERIFIED") {
    return NextResponse.redirect(buildRedirectUrl(baseUrl, "verified", result.requestId));
  }

  if (result.outcome === "ALREADY_VERIFIED") {
    return NextResponse.redirect(buildRedirectUrl(baseUrl, "already-verified", result.requestId));
  }

  if (result.outcome === "EXPIRED") {
    return NextResponse.redirect(buildRedirectUrl(baseUrl, "expired", result.requestId));
  }

  return NextResponse.redirect(buildRedirectUrl(baseUrl, "invalid", requestId));
}
