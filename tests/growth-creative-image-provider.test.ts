import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), imageModel: "gpt-image-test" as string | undefined }));
vi.mock("openai", () => ({ default: class { images = { generate: mocks.generate }; } }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ OPENAI_API_KEY: "test-key", GROWTH_OPENAI_IMAGE_MODEL: mocks.imageModel }) }));

import { buildCreativeImagePrompt, OpenAICreativeImageProvider, type CreativeAiImageInput } from "@/lib/growth/creative/ai-image-provider";
import { readPngDimensions } from "@/lib/growth/creative/storage";

const fullCreativeInput: CreativeAiImageInput = {
  topic: "19th Century English Translator",
  direction: "MAGAZINE_FRAME",
  avoidDirections: ["EDITORIAL_SPLIT"],
  brandName: "SayTwist",
  headline: "19th Century English Style Translator",
  beforeLabel: "BEFORE",
  beforeText: "The weather today is sunny and warm.",
  afterLabel: "AFTER",
  afterText: "The day presents itself with sunshine and a genial warmth.",
  cta: "Give it the 19th Century twist",
  domain: "saytwist.com",
};

describe("Creative Lab OpenAI image provider", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.imageModel = "gpt-image-test"; });

  it("makes one configured full-creative request with exact copy and normalizes its result", async () => {
    const source = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#14B8A6" } }).png().toBuffer();
    mocks.generate.mockResolvedValue({ data: [{ b64_json: source.toString("base64") }], created: 1 });
    const result = await new OpenAICreativeImageProvider().generate(fullCreativeInput);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-test", n: 1, size: "1024x1536", output_format: "png", quality: "medium" }));
    const prompt = mocks.generate.mock.calls[0][0].prompt;
    expect(prompt).toContain(JSON.stringify(fullCreativeInput.headline));
    expect(prompt).toContain(JSON.stringify(fullCreativeInput.beforeText));
    expect(prompt).toContain(JSON.stringify(fullCreativeInput.afterText));
    expect(prompt).toContain(JSON.stringify(fullCreativeInput.cta));
    expect(prompt).toContain(JSON.stringify(fullCreativeInput.domain));
    expect(prompt).toContain("Render every required string exactly as supplied");
    expect(prompt).toContain("any extra visible text");
    expect(prompt.toLowerCase()).not.toContain("no text");
    expect(readPngDimensions(result.bytes)).toEqual({ width: 1000, height: 1500 });
    expect(result.metadata).toMatchObject({ provider: "OPENAI", model: "gpt-image-test", imageUnits: 1, estimatedCost: null });
  });

  it("fails after the single provider call when no image is returned", async () => {
    mocks.generate.mockResolvedValue({ data: [], created: 1 });
    await expect(new OpenAICreativeImageProvider().generate({ ...fullCreativeInput, direction: "CHAT_FOCUS" })).rejects.toThrow("no image data");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("defaults to gpt-image-2 without attempting a model fallback", async () => {
    mocks.imageModel = undefined;
    mocks.generate.mockResolvedValue({ data: [], created: 1 });
    await expect(new OpenAICreativeImageProvider().generate({ ...fullCreativeInput, direction: "EDITORIAL_SPLIT" })).rejects.toThrow("no image data");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-image-2" }));
  });

  it("bounds untrusted topic context before adding it to the prompt", () => {
    const marker = "SHOULD_NOT_APPEAR";
    const prompt = buildCreativeImagePrompt({ ...fullCreativeInput, topic: `${"topic ".repeat(40)}${marker}` });
    expect(prompt).toContain("untrusted quoted context data");
    expect(prompt).not.toContain(marker);
  });
});
