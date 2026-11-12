import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

describe("Google Analytics CSP integration", () => {
  it("allows GA4 event collection without widening script permissions", async () => {
    const rules = await nextConfig.headers?.();
    const siteRule = rules?.find((rule) => rule.source === "/:path*");
    const csp = siteRule?.headers.find((header) => header.key === "Content-Security-Policy")?.value;

    expect(csp).toBeDefined();

    const directives = csp?.split("; ") ?? [];
    const connectSrc = directives.find((directive) => directive.startsWith("connect-src "));
    const scriptSrc = directives.find((directive) => directive.startsWith("script-src "));

    expect(connectSrc).toContain("https://www.google-analytics.com");
    expect(connectSrc).toContain("https://*.google-analytics.com");
    expect(connectSrc).toContain("https://www.googletagmanager.com");
    expect(connectSrc).toContain("https://api.openai.com");
    expect(connectSrc).not.toContain("* ");
    expect(scriptSrc).toContain("https://www.googletagmanager.com");
  });
});

describe("AdSense CSP integration", () => {
  it("allows the observed Google advertising requests on public pages", async () => {
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find((rule) => rule.source === "/:path*");
    const csp = globalRule?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;

    expect(csp).toBeDefined();
    const directives = csp?.split("; ") ?? [];
    const scriptSrc = directives.find((value) => value.startsWith("script-src "));
    const connectSrc = directives.find((value) => value.startsWith("connect-src "));
    const frameSrc = directives.find((value) => value.startsWith("frame-src "));

    expect(scriptSrc).toContain("https://fundingchoicesmessages.google.com");
    expect(scriptSrc).toContain("https://*.googlesyndication.com");
    expect(connectSrc).toContain("https://*.adtrafficquality.google");
    expect(connectSrc).toContain("https://*.googlesyndication.com");
    expect(connectSrc).toContain("https://fundingchoicesmessages.google.com");
    expect(frameSrc).toContain("https://*.doubleclick.net");

    // Do not use a blanket HTTPS permission for executable scripts or fetches.
    expect(scriptSrc?.split(" ")).not.toContain("https:");
    expect(connectSrc?.split(" ")).not.toContain("https:");
  });

  it("retains the restrictive baseline CSP on admin, API and login routes", async () => {
    const rules = await nextConfig.headers?.();

    for (const source of ["/admin/:path*", "/api/:path*", "/login"]) {
      const rule = rules?.find((entry) => entry.source === source);
      const csp = rule?.headers.find(
        (header) => header.key === "Content-Security-Policy",
      )?.value;
      expect(csp, source).toBeDefined();
      expect(csp, source).not.toContain("fundingchoicesmessages.google.com");
      expect(csp, source).not.toContain("adtrafficquality.google");
      expect(csp, source).not.toContain("https://*.googlesyndication.com");
      expect(csp, source).toContain("frame-ancestors 'none'");
    }
  });
});
