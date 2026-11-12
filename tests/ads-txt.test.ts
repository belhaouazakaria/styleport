import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

const EXPECTED_ADS_TXT = "google.com, pub-7927856375186557, DIRECT, f08c47fec0942fa0\n";

describe("self-hosted ads.txt", () => {
  it("contains exactly one approved Google publisher record", () => {
    const adsTxt = readFileSync(path.join(import.meta.dirname, "../public/ads.txt"), "utf8");

    expect(adsTxt).toBe(EXPECTED_ADS_TXT);
    expect(adsTxt.trimEnd().split("\n")).toHaveLength(1);
  });

  it("does not redirect /ads.txt to a third party or elsewhere", async () => {
    const redirects = await nextConfig.redirects!();

    expect(redirects.some((redirect) => redirect.source === "/ads.txt")).toBe(false);
    expect(
      redirects.some((redirect) => redirect.destination.includes("adstxtmanager.com")),
    ).toBe(false);
  });

  it("keeps only the plural legacy hostname's permanent redirects", async () => {
    const redirects = await nextConfig.redirects!();
    const migrationRedirects = redirects.filter((item) =>
      item.has?.some(
        (condition) =>
          condition.type === "host" &&
          condition.value === "translators.whattypeof.com",
      ),
    );

    expect(migrationRedirects).toHaveLength(2);
    expect(migrationRedirects.every((item) => item.permanent === true)).toBe(true);
    expect(
      redirects.some((item) =>
        item.has?.some(
          (condition) =>
            condition.type === "host" &&
            condition.value === "translator.whattypeof.com",
        ),
      ),
    ).toBe(false);
  });
});
