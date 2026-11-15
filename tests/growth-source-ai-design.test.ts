// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  generate: vi.fn(),
  store: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@/lib/growth/creative/ai-image-provider", () => ({
  OpenAICreativeImageProvider: class {
    constructor(readonly attemptId: string) {}
    generate(input: unknown) {
      return m.generate(this.attemptId, input);
    }
  },
}));
vi.mock("@/lib/growth/creative/storage", () => ({
  creativeAssetChecksum: () => "a".repeat(64),
  persistCreativeAssetFile: m.store,
  releaseCreativeAssetLease: m.release,
  validateCreativePng: vi.fn(),
}));
import { createOriginalSourceAsset } from "@/lib/growth/viral/source-creative";
const url =
  "https://anythingtranslate.com/translators/royal-english-translator/";
beforeEach(() => {
  vi.clearAllMocks();
  m.generate.mockResolvedValue({ bytes: Buffer.from("AI output") });
  m.store.mockResolvedValue({
    checksum: "a".repeat(64),
    publicPath: "/generated/ai.png",
    leasePath: "/private/lease",
  });
});
afterEach(() => vi.unstubAllEnvs());
it("requires AI and never falls back to template art when disabled", async () => {
  vi.stubEnv("GROWTH_AI_IMAGE_ENABLED", "false");
  await expect(
    createOriginalSourceAsset(
      "Royal English Translator",
      url,
      "source-concept1",
    ),
  ).rejects.toThrow("SOURCE_AI_DESIGN_REQUIRED");
  expect(m.generate).not.toHaveBeenCalled();
  expect(m.store).not.toHaveBeenCalled();
});
it("uses the stable attempt identity, selected account direction and credited source", async () => {
  vi.stubEnv("GROWTH_AI_IMAGE_ENABLED", "true");
  const result = await createOriginalSourceAsset(
    "Royal English Translator",
    url,
    "source-concept1",
    "SAYTWIST_IDEAS",
  );
  expect(m.generate).toHaveBeenCalledExactlyOnceWith(
    "source-concept1",
    expect.objectContaining({
      mode: "TOPIC_SPOTLIGHT",
      publicationRole: "SAYTWIST_IDEAS",
      brandName: "SayTwist",
      domain: "saytwist.com",
      beforeLabel: "",
      afterText: "",
    }),
  );
  expect(JSON.stringify(m.generate.mock.calls[0][1])).not.toMatch(/anything\s*translate/i);
  expect(result.title).toContain("SayTwist");
  expect(result.description).toContain("SayTwist");
  expect(m.store).toHaveBeenCalledExactlyOnceWith(Buffer.from("AI output"));
  expect(m.release).toHaveBeenCalledExactlyOnceWith("/private/lease");
});
it("retains the failure without generating or storing fallback artwork", async () => {
  vi.stubEnv("GROWTH_AI_IMAGE_ENABLED", "true");
  m.generate.mockRejectedValueOnce(Error("IMAGE_DAILY_LIMIT"));
  await expect(
    createOriginalSourceAsset(
      "Royal English Translator",
      url,
      "source-concept1",
    ),
  ).rejects.toThrow("IMAGE_DAILY_LIMIT");
  expect(m.generate).toHaveBeenCalledTimes(1);
  expect(m.store).not.toHaveBeenCalled();
});
it("keeps provenance branding out of the AI topic and all visible copy", async () => {
  vi.stubEnv("GROWTH_AI_IMAGE_ENABLED", "true");
  await createOriginalSourceAsset("AnythingTranslate Royal English Translator", url, "source-brand-policy", "SAYTWIST_IDEAS");
  expect(m.generate.mock.calls[0][1].topic).toBe("Royal English Translator");
  expect(JSON.stringify(m.generate.mock.calls[0][1])).not.toMatch(/anything\s*translate/i);
});
