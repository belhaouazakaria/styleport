import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ADSENSE_AUTHORIZATION = "google.com, pub-7927856375186557, DIRECT, f08c47fec0942fa0";

describe("ads.txt authorization", () => {
  it("preserves the existing SayTwist AdSense publisher authorization", async () => {
    const adsTxt = await readFile(resolve(process.cwd(), "public/ads.txt"), "utf8");
    expect(adsTxt.split(/\r?\n/).map((line) => line.trim())).toContain(ADSENSE_AUTHORIZATION);
  });
});
