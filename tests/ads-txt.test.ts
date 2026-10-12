import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

const EZOIC_ADS_TXT_URL = "https://srv.adstxtmanager.com/19390/saytwist.com";

describe("ads.txt redirect", () => {
  it("redirects exactly /ads.txt to Ezoic with HTTP 301", async () => {
    const redirects = await nextConfig.redirects!();
    const redirect = redirects.find((item) => item.source === "/ads.txt");

    expect(redirect).toEqual({
      source: "/ads.txt",
      destination: EZOIC_ADS_TXT_URL,
      statusCode: 301,
    });
    expect(redirect).not.toHaveProperty("permanent");
  });

  it("does not redirect unrelated paths to AdsTxtManager", async () => {
    const redirects = await nextConfig.redirects!();
    const ezoicRedirects = redirects.filter(
      (item) => item.destination === EZOIC_ADS_TXT_URL,
    );

    expect(ezoicRedirects).toHaveLength(1);
    expect(ezoicRedirects[0]?.source).toBe("/ads.txt");
  });

  it("preserves both existing domain migration redirect patterns", async () => {
    const redirects = await nextConfig.redirects!();
    const migrationRedirects = redirects.filter((item) =>
      item.has?.some(
        (condition) =>
          condition.type === "host" &&
          ["translator.whattypeof.com", "translators.whattypeof.com"].includes(
            condition.value,
          ),
      ),
    );

    expect(migrationRedirects).toHaveLength(4);
    expect(migrationRedirects.every((item) => item.permanent === true)).toBe(
      true,
    );
  });
});
