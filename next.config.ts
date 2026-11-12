import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// Google ad resources can change over time. This targeted compatibility list
// addresses known AdSense/Auto ads requests without relaxing admin or API CSP.
// Google's durable recommendation is a nonce-based strict CSP (separate migration).
const adSenseScriptSources = [
  "https://fundingchoicesmessages.google.com",
  "https://*.googlesyndication.com",
  "https://*.doubleclick.net",
  "https://*.googleadservices.com",
];
const adSenseConnectSources = [
  "https://*.adtrafficquality.google",
  "https://fundingchoicesmessages.google.com",
  "https://*.googlesyndication.com",
  "https://*.doubleclick.net",
  "https://*.googleadservices.com",
  "https://www.google.com",
];
const adSenseFrameSources = [
  "https://fundingchoicesmessages.google.com",
  "https://*.googlesyndication.com",
  "https://*.doubleclick.net",
  "https://www.google.com",
];

function buildContentSecurityPolicy(publicPage: boolean) {
  const adSources = (sources: string[]) => publicPage ? ` ${sources.join(" ")}` : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline' ${isProduction ? "" : "'unsafe-eval'"} https://pagead2.googlesyndication.com https://www.googletagmanager.com https://www.google.com https://www.gstatic.com${adSources(adSenseScriptSources)}`,
    `connect-src 'self' https://api.openai.com https://api.brevo.com https://*.sentry.io https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com${adSources(adSenseConnectSources)}`,
    `frame-src 'self' https://googleads.g.doubleclick.net https://tpc.googlesyndication.com${adSources(adSenseFrameSources)}`,
  ].join("; ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  async redirects() {
    // Keep the unused plural alias redirected to the canonical SayTwist site.
    // The singular translator.whattypeof.com host serves the app directly.
    // Canonical metadata and sitemap URLs remain on saytwist.com.
    const oldHostnames = ["translators.whattypeof.com"];

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
            value: buildContentSecurityPolicy(true),
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
        ].filter((header) =>
          isProduction ? true : header.key !== "Strict-Transport-Security",
        ),
      },
      // Keep authenticated and authentication-related routes on the original
      // tighter policy. Next.js applies the later matching header last.
      ...["/admin/:path*", "/api/:path*", "/login"].map((source) => ({
        source,
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildContentSecurityPolicy(false),
          },
        ],
      })),
    ];
  },
};

export default nextConfig;
