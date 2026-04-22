import { NextResponse } from "next/server";

import { verifyTranslatorRequestEmailToken } from "@/lib/data/requests";

function buildRedirectUrl(requestUrl: string, status: string, requestId?: string) {
  const url = new URL("/create-translator/verify", requestUrl);
  url.searchParams.set("status", status);

  if (requestId) {
    url.searchParams.set("requestId", requestId);
  }

  return url;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || "";
  const requestId = searchParams.get("requestId") || undefined;

  const result = await verifyTranslatorRequestEmailToken(token);

  if (result.outcome === "VERIFIED") {
    return NextResponse.redirect(buildRedirectUrl(request.url, "verified", result.requestId));
  }

  if (result.outcome === "ALREADY_VERIFIED") {
    return NextResponse.redirect(buildRedirectUrl(request.url, "already-verified", result.requestId));
  }

  if (result.outcome === "EXPIRED") {
    return NextResponse.redirect(buildRedirectUrl(request.url, "expired", result.requestId));
  }

  return NextResponse.redirect(buildRedirectUrl(request.url, "invalid", requestId));
}
