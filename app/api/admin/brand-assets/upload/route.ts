import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { adminRouteGuard } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const FAVICON_MAX_BYTES = 2 * 1024 * 1024;

const LOGO_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/webp",
  "image/jpeg",
]);

const FAVICON_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/webp",
  "image/jpeg",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const LOGO_EXTENSIONS: Record<string, string> = {
  "image/svg+xml": ".svg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
};

const FAVICON_EXTENSIONS: Record<string, string> = {
  "image/svg+xml": ".svg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

const STORAGE_DIR = path.join(process.cwd(), "public", "generated", "brand-assets");
const PUBLIC_PREFIX = "/generated/brand-assets";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function sanitizeSvg(buffer: Buffer): Buffer {
  const content = buffer.toString("utf-8");
  const dangerous = /<script[\s>]/i.test(content) ||
    /on\w+\s*=/i.test(content) ||
    /javascript:/i.test(content) ||
    /data:text\/html/i.test(content);
  if (dangerous) {
    throw new Error("SVG contains potentially dangerous content");
  }
  return buffer;
}

function getExtension(mimeType: string, fileName: string, isLogo: boolean): string {
  const extMap = isLogo ? LOGO_EXTENSIONS : FAVICON_EXTENSIONS;
  if (extMap[mimeType]) return extMap[mimeType];
  const fromName = path.extname(fileName).toLowerCase();
  if (fromName) return fromName;
  return isLogo ? ".png" : ".png";
}

function generateFileName(prefix: string, ext: string): string {
  const nonce = randomBytes(6).toString("hex");
  return `${prefix}-${Date.now().toString(36)}-${nonce}${ext}`;
}

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  try {
    const formData = await request.formData();
    const assetType = formData.get("assetType");

    if (assetType !== "logo" && assetType !== "favicon") {
      return jsonError(400, "VALIDATION_ERROR", "assetType must be 'logo' or 'favicon'.");
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, "VALIDATION_ERROR", "Missing file.");
    }

    if (file.size <= 0) {
      return jsonError(400, "VALIDATION_ERROR", "File is empty.");
    }

    const isLogo = assetType === "logo";
    const maxBytes = isLogo ? LOGO_MAX_BYTES : FAVICON_MAX_BYTES;
    const allowedTypes = isLogo ? LOGO_MIME_TYPES : FAVICON_MIME_TYPES;

    if (file.size > maxBytes) {
      const maxMB = Math.round(maxBytes / (1024 * 1024));
      return jsonError(413, "PAYLOAD_TOO_LARGE", `File exceeds ${maxMB}MB limit.`);
    }

    const mimeType = file.type;
    if (!mimeType || !allowedTypes.has(mimeType)) {
      return jsonError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        `Unsupported file type. Allowed: ${[...allowedTypes].join(", ")}`,
      );
    }

    let buffer = Buffer.from(await file.arrayBuffer());

    if (mimeType === "image/svg+xml") {
      try {
        buffer = Buffer.from(sanitizeSvg(buffer));
      } catch {
        return jsonError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "SVG file contains potentially dangerous content and cannot be uploaded.",
        );
      }
    }

    await mkdir(STORAGE_DIR, { recursive: true });

    const ext = getExtension(mimeType, file.name, isLogo);
    const prefix = isLogo ? "logo" : "favicon";
    const fileName = generateFileName(prefix, ext);
    const filePath = path.join(STORAGE_DIR, fileName);
    await writeFile(filePath, buffer);

    const assetPath = `${PUBLIC_PREFIX}/${fileName}`;

    return NextResponse.json(
      { ok: true, assetPath },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError(500, "UPLOAD_FAILED", "Unable to upload file right now.");
  }
}
