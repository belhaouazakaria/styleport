import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { inspectCreativeVisualEvidence } from "@/lib/growth/creative/visual-evidence";
import { MAX_CREATIVE_BYTES } from "@/lib/growth/creative/constants";

async function png(width = 1000, height = 1500, rgba = { r: 255, g: 255, b: 255, alpha: 1 }) {
  return sharp({ create: { width, height, channels: 4, background: rgba } }).png().toBuffer();
}

describe("offline creative visual evidence", () => {
  it("rejects invalid, empty, oversized and non-PNG input without provider calls", async () => {
    for (const input of [Buffer.alloc(0), Buffer.from("bad"), Buffer.alloc(MAX_CREATIVE_BYTES + 1)]) {
      const result = await inspectCreativeVisualEvidence(input);
      expect(result.status).toBe("REJECTED");
      expect(result.flags.length).toBeGreaterThan(0);
      expect(result.mandatoryHumanChecks).toContain("PER_PIN_APPROVAL");
    }
    const jpeg = await sharp({ create: { width: 1000, height: 1500, channels: 3, background: "red" } }).jpeg().toBuffer();
    expect((await inspectCreativeVisualEvidence(jpeg)).status).toBe("REJECTED");
  });
  it("rejects incorrect dimensions and transparency", async () => {
    const wrong = await inspectCreativeVisualEvidence(await png(900, 1500));
    expect(wrong.flags).toContain("UNEXPECTED_DIMENSIONS");
    expect(wrong.status).toBe("REJECTED");
    const transparent = await inspectCreativeVisualEvidence(await png(1000, 1500, { r: 0, g: 0, b: 0, alpha: 0 }));
    expect(transparent.flags).toContain("TRANSPARENCY");
    expect(transparent.status).toBe("REJECTED");
  });
  it("flags flat artwork but never auto-approves or claims to verify text", async () => {
    const image = await png();
    const evidence = await inspectCreativeVisualEvidence(image);
    expect(evidence.status).toBe("REVIEW_REQUIRED");
    expect(evidence.opaque).toBe(true);
    expect(evidence.flags).toContain("NEAR_UNIFORM");
    expect(evidence.flags).toContain("LOW_DETAIL");
    expect(evidence.width).toBe(1000);
    expect(evidence.height).toBe(1500);
    expect(evidence.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.mandatoryHumanChecks).toContain("EXACT_COPY_AND_SPELLING");
    expect(evidence.mandatoryHumanChecks).toContain("MOBILE_READABILITY");
    expect(evidence.mandatoryHumanChecks).toContain("PER_PIN_APPROVAL");
    expect(evidence).not.toHaveProperty("approved");
  });
  it("is deterministic for identical bytes", async () => {
    const image = await png();
    expect(await inspectCreativeVisualEvidence(image)).toEqual(await inspectCreativeVisualEvidence(image));
  });
});
