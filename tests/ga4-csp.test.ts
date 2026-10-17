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
