import { NextResponse } from "next/server";

import { auth } from "@/auth";

const AUTH_SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
] as const;

function buildCurrentPath(pathname: string, search: string) {
  return `${pathname}${search || ""}`;
}

interface ProxyRequestLike {
  url: string;
  nextUrl: {
    pathname: string;
    search: string;
  };
  cookies?: {
    get: (name: string) => { value?: string } | undefined;
  };
  auth?: {
    user?: {
      role?: string | null;
    } | null;
  } | null;
}

function hasAuthSessionCookie(request: ProxyRequestLike) {
  if (!request.cookies?.get) {
    return false;
  }

  return AUTH_SESSION_COOKIE_NAMES.some((name) => {
    const value = request.cookies?.get(name)?.value;
    return typeof value === "string" && value.length > 0;
  });
}

function redirectWithDiagnostics(request: ProxyRequestLike, targetPath: string, reason: string) {
  const targetUrl = new URL(targetPath, request.url);
  const from = buildCurrentPath(request.nextUrl.pathname, request.nextUrl.search);
  const to = buildCurrentPath(targetUrl.pathname, targetUrl.search);
  const hasSessionCookie = hasAuthSessionCookie(request);

  if (from === to) {
    console.warn("[proxy_redirect_guard]", JSON.stringify({ reason, from, to, hasSessionCookie }));
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
      hasSessionCookie,
    }),
  );

  return NextResponse.redirect(targetUrl);
}

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const session = request.auth;
  const hasSessionCookie = hasAuthSessionCookie(request);

  if (pathname.startsWith("/admin")) {
    if (!session?.user) {
      if (hasSessionCookie) {
        console.warn(
          "[proxy_session_fallback]",
          JSON.stringify({
            reason: "ADMIN_COOKIE_PRESENT_BUT_SESSION_MISSING",
            from: buildCurrentPath(request.nextUrl.pathname, request.nextUrl.search),
          }),
        );
        return NextResponse.next();
      }

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
