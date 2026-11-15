// @vitest-environment node
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { GENZ_TYPOGRAPHY, buildGenZHeadline, PIN_DESIGN_STYLES, buildGenZBackgroundPrompt, effectiveGenZStroke, genzTypographySchema, resolvePinDesignStyle } from "@/lib/growth/creative/genz-editorial";
import { loadUprightFont } from "@/lib/growth/creative/genz-font";
import { compositeGenZEditorial, layoutGenZHeadline } from "@/lib/growth/creative/genz-renderer";
import { generateGenZEditorial } from "@/lib/growth/creative/genz-generation";
import { creativeGenerationRequestSchema, creativeGenerationJobPayloadSchema } from "@/lib/growth/creative/contracts";

describe("Main account Gen-Z style and dynamic photographic planning", () => {
  it("defaults only the main account, preserves legacy choices, and rejects other-account overrides", () => {
    expect(PIN_DESIGN_STYLES.find(s => s.id === "genz_editorial")).toMatchObject({ isDefault: true, accountRole: "SAYTWIST" });
    expect(resolvePinDesignStyle("SAYTWIST")).toBe("genz_editorial");
    for (const role of ["SAYTWIST_IDEAS", "SAYTWIST_PLAYGROUND", undefined]) {
      expect(resolvePinDesignStyle(role)).toBe("legacy");
      expect(() => resolvePinDesignStyle(role, "genz_editorial")).toThrow("main SayTwist");
    }
    expect(resolvePinDesignStyle("SAYTWIST", "legacy")).toBe("legacy");
    expect(resolvePinDesignStyle("SAYTWIST", undefined, "legacy")).toBe("legacy");
    expect(resolvePinDesignStyle("SAYTWIST", "genz_editorial", "legacy")).toBe("genz_editorial");
  });
  it("uses richer metadata and distinct concept instructions without hardcoded scene mappings", () => {
    const cat = buildGenZBackgroundPrompt({ name: "Cat Translator", description: "Transforms everyday messages into curious feline expressions", category: "Animals", purpose: "Playful cat-like speech", tone: "Curious" });
    const history = buildGenZBackgroundPrompt({ name: "Shakespeare Translator", description: "Rewrites modern messages in theatrical Elizabethan English", category: "Historical", purpose: "Dramatic old English", tone: "Romantic" });
    expect(cat).not.toBe(history);
    expect(cat).toContain("curious feline"); expect(cat).toContain("Animals");
    expect(history).toContain("Elizabethan"); expect(history).toContain("Historical");
    for (const prompt of [cat, history]) {
      expect(prompt).toContain("STAGE A"); expect(prompt).toContain("STAGE B");
      expect(prompt).toContain("No text, letters, typography"); expect(prompt).toContain("application adds all typography later");
      expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(7000);
    }
  });
  it("creates an invitation while retaining the Translator identity", () => {
    expect(buildGenZHeadline("Cat Translator")).toBe("Click to translate your text with Cat Translator");
    expect(buildGenZHeadline("Shakespeare Translator")).toBe("Click to translate your text with Shakespeare Translator");
    expect(buildGenZHeadline("Cat — Translator")).not.toContain("—");
  });
  it("bounds quoted metadata while preserving the subject identity", () => {
    const prompt = buildGenZBackgroundPrompt({ name: "Robot Translator", description: "Robotic phrasing ".repeat(1000), purpose: "Mechanical expression ".repeat(1000) });
    expect(Buffer.byteLength(prompt)).toBeLessThan(7000);
    expect(prompt).toContain("untrusted quoted JSON");
    expect(Buffer.byteLength(buildGenZBackgroundPrompt({ name: "Robot Translator", description: "你好🌍".repeat(1000), purpose: "你好🌍".repeat(1000) }))).toBeLessThan(7000);
  });
  it("validates the 250% baseline conversion and quality settings", () => {
    expect(GENZ_TYPOGRAPHY.fillColor).toBe("#FFFFFF"); expect(GENZ_TYPOGRAPHY.strokeColor).toBe("#000000");
    expect(genzTypographySchema.parse({})).toEqual({ strokeWidthPercent: 250, webpQuality: 92 });
    expect(effectiveGenZStroke(160)).toBeCloseTo(12);
    for (const n of [179, 301]) expect(() => genzTypographySchema.parse({ strokeWidthPercent: n })).toThrow();
    for (const n of [89, 96]) expect(() => genzTypographySchema.parse({ webpQuality: n })).toThrow();
    expect(creativeGenerationJobPayloadSchema.safeParse({ targetKind: "TRANSLATOR", targetId: "cat", creativeModelVersion: "creative_lab_v1" }).success).toBe(false);
    expect(creativeGenerationRequestSchema.parse({ targetKind: "TRANSLATOR", targetId: "cat", creativeModelVersion: "creative_lab_v1", designStyle: "genz_editorial" })).toMatchObject({ archetype: "MINIMAL_STATEMENT" });
  });
  it("blocks before paid dispatch when the font or permission is unavailable", async () => {
    const generate = vi.fn();
    vi.stubEnv("GROWTH_UPRIGHT_FONT_PERMISSION_PATH", "/nonexistent/saytwist-unit-permission.json");
    await expect(generateGenZEditorial({ name: "Cat Translator", description: "Feline speech" }, { generate })).rejects.toThrow(/Upright/);
    expect(generate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    await expect(loadUprightFont({ filePath: "/nonexistent/upright.otf" })).rejects.toThrow("missing");
  });
});

// Font binaries are operator-owned and are not redistributed with this repository.
// These tests run locally against the real, SHA-verified Upright font. CI skips
// them until the licensed asset is supplied at the private configured path.
const fontPath = process.env.GROWTH_UPRIGHT_FONT_PATH ?? path.join(process.cwd(), "storage/fonts/upright/Upright.otf");
describe.skipIf(!existsSync(fontPath))("Actual Upright glyph geometry and output", () => {
  it("loads the exact Upright Regular reference, without substitution", async () => {
    const f = await loadUprightFont({ forPreview: true });
    expect(f.font.familyName).toBe("Upright"); expect(f.font.subfamilyName).toBe("Regular");
    expect(f.checksum).toBe("b4a4e229e398cee333082204aedcfc5a2f7cff1537420381983fd7c439c95824");
  });
  it.each(["Cat Translator", "Shakespearean English Translator for Everyday Messages", "The Unnecessarily Dramatic Medieval English Translator for Entirely Ordinary Conversations", "Café Translator"])("wraps %s with all words and stroke inside safe margins", async title => {
    const font = await loadUprightFont({ forPreview: true });
    for (const strokeWidthPercent of [180, 190, 250, 300]) {
      const headline = buildGenZHeadline(title);
      const layout = layoutGenZHeadline(headline, font, { strokeWidthPercent });
      expect(layout.lines.join(" ")).toBe(headline);
      expect(layout.lines.length).toBeLessThanOrEqual(4);
      expect(layout.bounds.left).toBeGreaterThanOrEqual(70); expect(layout.bounds.right).toBeLessThanOrEqual(930);
      expect(layout.bounds.top).toBeGreaterThanOrEqual(700); expect(layout.bounds.bottom).toBeLessThanOrEqual(1410);
      expect(layout.svg.indexOf('stroke="#000000"')).toBeLessThan(layout.svg.indexOf('fill="#FFFFFF"'));
      expect(layout.svg).toContain('stroke-linejoin="round"'); expect(layout.svg).not.toContain("font-family");
    }
  });
  it("fails explicitly on unsupported glyphs instead of drawing a substitute", async () => {
    const font = await loadUprightFont({ forPreview: true });
    expect(() => layoutGenZHeadline("猫 Translator", font)).toThrow("UPRIGHT_GLYPH_UNSUPPORTED");
  });
  it("exports real 1000x1500 WebP and PNG, retaining white fill and black outline pixels", async () => {
    const font = await loadUprightFont({ forPreview: true });
    const bg = await sharp({ create: { width: 1200, height: 1800, channels: 3, background: "#795f50" } }).png().toBuffer();
    const result = await compositeGenZEditorial(bg, "Cat Translator", font);
    for (const [format, bytes] of [["png", result.png], ["webp", result.webp]] as const) expect(await sharp(bytes).metadata()).toMatchObject({ format, width: 1000, height: 1500 });
    const { data } = await sharp(result.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let white = 0, black = 0;
    for (let i = 0; i < data.length; i += 3) { if (data[i] === 255 && data[i+1] === 255 && data[i+2] === 255) white++; if (data[i] === 0 && data[i+1] === 0 && data[i+2] === 0) black++; }
    expect(white).toBeGreaterThan(1000); expect(black).toBeGreaterThan(1000);
  });
  it("adds SayTwist branding to source photographs while preserving the native headline layout", async () => {
    const font = await loadUprightFont({ forPreview: true });
    const bg = await sharp({ create: { width: 1000, height: 1500, channels: 3, background: "#795f50" } }).png().toBuffer();
    const headline = buildGenZHeadline("Cat Translator");
    const native = await compositeGenZEditorial(bg, headline, font);
    const source = await compositeGenZEditorial(bg, headline, font, {}, true);
    const top = { left: 55, top: 50, width: 300, height: 120 };
    expect((await sharp(await sharp(native.png).extract(top).toBuffer()).stats()).channels[0].stdev).toBe(0);
    expect((await sharp(await sharp(source.png).extract(top).toBuffer()).stats()).channels[0].stdev).toBeGreaterThan(20);
    const lower = { left: 0, top: 700, width: 1000, height: 800 };
    const sourcePixels = await sharp(source.png).extract(lower).raw().toBuffer();
    const nativePixels = await sharp(native.png).extract(lower).raw().toBuffer();
    expect(sourcePixels.equals(nativePixels)).toBe(true);
    expect(source.layout).toEqual(native.layout);
    expect(await sharp(source.webp).metadata()).toMatchObject({ format: "webp", width: 1000, height: 1500 });
  });
});
