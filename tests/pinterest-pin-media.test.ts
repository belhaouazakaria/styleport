import { describe, expect, it } from "vitest";

import { extractPinterestPreviewImageUrl, pinterestPublishedAt } from "@/lib/growth/pinterest/pin-media";
import { pinterestPinsPageSchema, type PinterestPin } from "@/lib/growth/pinterest/schemas";

const image = (name: string) => `https://i.pinimg.com/${name}.jpg`;

const variants: Array<{ name: string; pin: Record<string, unknown>; preview: string | null }> = [
  {
    name: "single image",
    pin: { id: "1", media: { media_type: "image", images: { "600x": { width: 600, height: 900, url: image("single") } } } },
    preview: image("single"),
  },
  { name: "image without optional copy", pin: { id: "2", media: { media_type: "image" } }, preview: null },
  {
    name: "multiple images",
    pin: { id: "3", media: { media_type: "multiple_images", items: [{ item_type: "image", images: { "400x300": { width: 400, height: 300, url: image("multi-image") } } }] } },
    preview: image("multi-image"),
  },
  {
    name: "video with image sizes",
    pin: { id: "4", media: { media_type: "video", images: { "150x150": { width: 150, height: 150, url: image("video-image") } }, cover_image_url: image("video-cover") } },
    preview: image("video-image"),
  },
  {
    name: "video with an unusable official string image reference",
    pin: { id: "40", media: { media_type: "video", images: { "600x": { width: 600, height: 900, url: "pinterest-image-reference" } }, cover_image_url: image("video-cover-fallback") } },
    preview: image("video-cover-fallback"),
  },
  {
    name: "multiple videos",
    pin: { id: "5", media: { media_type: "multiple_videos", items: [{ item_type: "video", cover_image_url: image("multi-video"), video_url: "https://v.pinimg.com/video.mp4" }] } },
    preview: image("multi-video"),
  },
  {
    name: "mixed image and video",
    pin: { id: "6", media: { media_type: "multiple_mixed", items: [{ item_type: "video", cover_image_url: image("mixed-video") }, { item_type: "image", images: { "600x": { width: 600, height: 600, url: image("mixed-image") } } }] } },
    preview: image("mixed-video"),
  },
  {
    name: "future fields",
    pin: { id: "7", media: { media_type: "future_format", future_metadata: { arbitrary: true }, cover_image_url: image("future") }, future_pin_field: [1, 2] },
    preview: image("future"),
  },
  {
    name: "no safe preview",
    pin: { id: "8", media: { media_type: "video", cover_image_url: "https://evil.example/image.jpg", items: [{ cover_image_url: "not-a-url" }] } },
    preview: null,
  },
  {
    name: "null optional fields",
    pin: { id: "9", board_id: null, title: null, description: null, link: null, created_at: null, creative_type: null, media: null },
    preview: null,
  },
];

describe("Pinterest polymorphic Pin media", () => {
  it.each(variants)("accepts $name and extracts only a safe preview", ({ pin, preview }) => {
    const parsed = pinterestPinsPageSchema.parse({ items: [pin] });
    expect(() => extractPinterestPreviewImageUrl(parsed.items[0])).not.toThrow();
    expect(extractPinterestPreviewImageUrl(parsed.items[0])).toBe(preview);
  });

  it("accepts bookmark, null bookmark, and an absent final bookmark", () => {
    expect(pinterestPinsPageSchema.parse({ items: [{ id: "10" }], bookmark: "next" }).bookmark).toBe("next");
    expect(pinterestPinsPageSchema.parse({ items: [{ id: "11" }], bookmark: null }).bookmark).toBeNull();
    expect(pinterestPinsPageSchema.parse({ items: [{ id: "12" }] }).bookmark).toBeUndefined();
  });

  it("rejects missing Pin identity and malformed outer items", () => {
    expect(() => pinterestPinsPageSchema.parse({ items: [{ title: "No ID" }] })).toThrow();
    expect(() => pinterestPinsPageSchema.parse({ items: {} })).toThrow();
  });

  it("never returns an Invalid Date for optional Pinterest timestamps", () => {
    expect(pinterestPublishedAt("2026-10-05T12:34:56Z")?.toISOString()).toBe("2026-10-05T12:34:56.000Z");
    expect(pinterestPublishedAt("not-a-date")).toBeNull();
    expect(pinterestPublishedAt(null)).toBeNull();
  });

  it("does not throw when a typed Pin receives unexpected nested media values", () => {
    const pin = { id: "13", media: { media_type: "image", images: { "600x": { url: { nested: true } } }, items: [null, 1, "bad"] } } as PinterestPin;
    expect(extractPinterestPreviewImageUrl(pin)).toBeNull();
  });
});
