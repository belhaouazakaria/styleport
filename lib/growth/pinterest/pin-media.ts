import type { PinterestPin } from "@/lib/growth/pinterest/schemas";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safePinterestImageUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "pinimg.com" || url.hostname.endsWith(".pinimg.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function imageCandidates(images: unknown) {
  if (!isRecord(images)) return [];
  const preferred = ["600x", "400x300", "150x150", "1200x"];
  const entries = [
    ...preferred.map((key) => images[key]),
    ...Object.entries(images).filter(([key]) => !preferred.includes(key)).map(([, value]) => value),
  ];
  return entries.flatMap((entry) => isRecord(entry) ? [entry.url] : []);
}

export function extractPinterestPreviewImageUrl(pin: PinterestPin) {
  const media = pin.media;
  if (!isRecord(media)) return null;

  const candidates: unknown[] = [
    ...imageCandidates(media.images),
    media.cover_image_url,
  ];
  if (Array.isArray(media.items)) {
    for (const item of media.items) {
      if (!isRecord(item)) continue;
      candidates.push(...imageCandidates(item.images), item.cover_image_url);
    }
  }

  for (const candidate of candidates) {
    const safe = safePinterestImageUrl(candidate);
    if (safe) return safe;
  }
  return null;
}

export function pinterestPublishedAt(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}
