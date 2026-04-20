import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const session = request.auth;

  if (pathname.startsWith("/admin")) {
    if (!session?.user) {
      const callbackUrl = encodeURIComponent(pathname + request.nextUrl.search);
      return NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, request.url));
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (pathname === "/login" && session?.user?.role === "ADMIN") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
