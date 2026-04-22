import { NextResponse } from "next/server";

import { auth } from "@/auth";

function buildCurrentPath(pathname: string, search: string) {
  return `${pathname}${search || ""}`;
}

interface ProxyRequestLike {
  url: string;
  nextUrl: {
    pathname: string;
    search: string;
  };
  auth?: {
    user?: {
      role?: string | null;
    } | null;
  } | null;
}

function redirectWithDiagnostics(request: ProxyRequestLike, targetPath: string, reason: string) {
  const targetUrl = new URL(targetPath, request.url);
  const from = buildCurrentPath(request.nextUrl.pathname, request.nextUrl.search);
  const to = buildCurrentPath(targetUrl.pathname, targetUrl.search);

  if (from === to) {
    console.warn("[proxy_redirect_guard]", JSON.stringify({ reason, from, to }));
    return NextResponse.next();
  }

  console.warn(
    "[proxy_redirect]",
    JSON.stringify({
      reason,
      from,
      to,
      role: request.auth?.user?.role || null,
      hasSession: Boolean(request.auth?.user),
    }),
  );

  return NextResponse.redirect(targetUrl);
}

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const session = request.auth;

  if (pathname.startsWith("/admin")) {
    if (!session?.user) {
      const callbackUrl = encodeURIComponent(pathname + request.nextUrl.search);
      return redirectWithDiagnostics(request, `/login?callbackUrl=${callbackUrl}`, "ADMIN_REQUIRES_LOGIN");
    }

    if (session.user.role !== "ADMIN") {
      return redirectWithDiagnostics(request, "/", "ADMIN_ROLE_REQUIRED");
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
