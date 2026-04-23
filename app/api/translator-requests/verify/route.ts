import { NextResponse } from "next/server";

import { verifyTranslatorRequestEmailToken } from "@/lib/data/requests";
import { getAppBaseUrl } from "@/lib/env";
import { processVerifiedTranslatorRequest } from "@/lib/request-processing";

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
    const processing = await processVerifiedTranslatorRequest({
      requestId: result.requestId,
      requestUrl: request.url,
    });
    const redirectUrl = buildRedirectUrl(baseUrl, "verified", result.requestId);

    if (processing.outcome === "AUTO_PUBLISHED") {
      redirectUrl.searchParams.set("mode", "live");
      redirectUrl.searchParams.set("translatorSlug", processing.translatorSlug);
    } else {
      redirectUrl.searchParams.set("mode", "review");
    }

    return NextResponse.redirect(redirectUrl);
  }

  if (result.outcome === "ALREADY_VERIFIED") {
    return NextResponse.redirect(buildRedirectUrl(baseUrl, "already-verified", result.requestId));
  }

  if (result.outcome === "EXPIRED") {
    return NextResponse.redirect(buildRedirectUrl(baseUrl, "expired", result.requestId));
  }

  return NextResponse.redirect(buildRedirectUrl(baseUrl, "invalid", requestId));
}
