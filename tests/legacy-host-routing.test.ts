import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

describe("legacy hostname routing", () => {
  it("serves the singular translator hostname without a Next.js redirect", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(
      redirects.some((redirect) =>
        redirect.has?.some(
          (condition) =>
            condition.type === "host" &&
            condition.value === "translator.whattypeof.com",
        ),
      ),
    ).toBe(false);
  });

  it("retains the plural alias redirect to the canonical SayTwist site", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const pluralRules = redirects.filter((redirect) =>
      redirect.has?.some(
        (condition) =>
          condition.type === "host" &&
          condition.value === "translators.whattypeof.com",
      ),
    );

    expect(pluralRules).toHaveLength(2);
    expect(pluralRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/",
          destination: "https://saytwist.com/",
          permanent: true,
        }),
        expect.objectContaining({
          source: "/:path+",
          destination: "https://saytwist.com/:path+",
          permanent: true,
        }),
      ]),
    );
  });

  it("keeps the existing managed ads.txt redirect", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual(
      expect.objectContaining({
        source: "/ads.txt",
        destination: "https://srv.adstxtmanager.com/19390/saytwist.com",
        statusCode: 301,
      }),
    );
  });
});
