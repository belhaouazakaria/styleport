import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectStoredCreativeAsset } from "@/lib/growth/creative/stored-visual-evidence";

const route = readFileSync("app/api/admin/growth/creative/visual-evidence/route.ts", "utf8");
const service = readFileSync("lib/growth/creative/stored-visual-evidence.ts", "utf8");

describe("stored Creative Lab image evidence is read-only and admin-scoped", () => {
  it("rejects arbitrary paths, wrong checksum and non-managed URLs before filesystem reads", async () => {
    const checksum = "a".repeat(64);
    for (const path of [
      "/etc/passwd",
      "https://example.com/creative-" + checksum + ".png",
      "/generated/growth-creatives/creative-" + "b".repeat(64) + ".png",
      "/generated/growth-creatives/../creative-" + checksum + ".png",
    ]) {
      await expect(inspectStoredCreativeAsset(path, checksum)).rejects.toThrow("INVALID_ASSET_REFERENCE");
    }
    await expect(inspectStoredCreativeAsset("/generated/growth-creatives/creative-" + checksum + ".png", "bad"))
      .rejects.toThrow("INVALID_ASSET_REFERENCE");
  });
  it("authenticates before DB lookup and never allows writes or publication approval", () => {
    expect(route.indexOf("await adminRouteGuard()")).toBeLessThan(route.indexOf("prisma.growthPinCandidate.findUnique"));
    expect(route).toContain("inspectStoredCreativeAsset");
    expect(route).toContain("ASSET_UNAVAILABLE");
    expect(route).not.toContain("approvePinCandidate");
    expect(route).not.toContain("submitTelegram");
    expect(route).not.toContain("PINTEREST_PIN_PUBLISH");
    expect(service).toContain("MAX_CREATIVE_BYTES");
    expect(service).toContain("CHECKSUM_MISMATCH");
    expect(service).toContain('createHash("sha256")');
    expect(service).not.toContain("writeFile");
  });
});
