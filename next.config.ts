import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' ${isProduction ? "" : "'unsafe-eval'"} https://pagead2.googlesyndication.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com`,
  "connect-src 'self' https://api.openai.com https://api.brevo.com https://*.sentry.io",
  "frame-src 'self' https://googleads.g.doubleclick.net https://tpc.googlesyndication.com",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  async redirects() {
    // Old domain redirects for SayTwist migration
    // These handle permanent redirects from the old whattypeof.com domains
    const oldHostnames = [
      "translator.whattypeof.com",
      "translators.whattypeof.com",
    ];

    const redirects = oldHostnames.flatMap((hostname) => [
      {
        source: "/",
        has: [{ type: "host" as const, value: hostname }],
        destination: "https://saytwist.com/",
        permanent: true,
      },
      {
        source: "/:path+",
        has: [{ type: "host" as const, value: hostname }],
        destination: "https://saytwist.com/:path+",
        permanent: true,
      },
    ]);

    return redirects;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ].filter((header) => (isProduction ? true : header.key !== "Strict-Transport-Security")),
      },
    ];
  },
};

export default nextConfig;
