import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getAppBaseUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const TEMP_FILE_TTL_MS = 1000 * 60 * 60 * 6;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 15;
const MAX_TEMP_FILES = 300;
const PUBLIC_PREFIX = "/generated/result-pins-temp";
const STORAGE_DIR =
  process.env.RESULT_PIN_TEMP_DIR ||
  path.join(process.cwd(), "public", PUBLIC_PREFIX.replace(/^\//, ""));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const globalState = globalThis as typeof globalThis & {
  __resultPinCleanupAt?: number;
  __resultPinCleanupPromise?: Promise<void> | null;
};

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isPng(buffer: Buffer) {
  if (buffer.length < PNG_SIGNATURE.length) {
    return false;
  }

  return buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

function generateFileName() {
  const nonce = randomBytes(6).toString("hex");
  return `rp-${Date.now().toString(36)}-${nonce}.png`;
}

async function cleanupTempPins() {
  try {
    const entries = await readdir(STORAGE_DIR, { withFileTypes: true });
    const now = Date.now();
    const files: Array<{ filePath: string; mtimeMs: number }> = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".png")) {
        continue;
      }

      const filePath = path.join(STORAGE_DIR, entry.name);
      try {
        const fileStat = await stat(filePath);
        if (now - fileStat.mtimeMs > TEMP_FILE_TTL_MS) {
          await rm(filePath, { force: true });
          continue;
        }
        files.push({ filePath, mtimeMs: fileStat.mtimeMs });
      } catch {
        await rm(filePath, { force: true });
      }
    }

    if (files.length <= MAX_TEMP_FILES) {
      return;
    }

    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const overflow = files.slice(0, files.length - MAX_TEMP_FILES);
    await Promise.all(overflow.map((file) => rm(file.filePath, { force: true })));
  } catch (error) {
    logWarn("result_pin_cleanup_failed", "Failed to cleanup temporary result pin files.", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runCleanupIfNeeded() {
  const now = Date.now();
  if (globalState.__resultPinCleanupPromise) {
    return;
  }

  if (globalState.__resultPinCleanupAt && now - globalState.__resultPinCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  globalState.__resultPinCleanupAt = now;
  globalState.__resultPinCleanupPromise = cleanupTempPins().finally(() => {
    globalState.__resultPinCleanupPromise = null;
  });
  await globalState.__resultPinCleanupPromise;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return jsonError(400, "VALIDATION_ERROR", "Missing image file.");
    }

    if (image.size <= 0) {
      return jsonError(400, "VALIDATION_ERROR", "Image file is empty.");
    }

    if (image.size > MAX_UPLOAD_BYTES) {
      return jsonError(413, "PAYLOAD_TOO_LARGE", "Image file is too large.");
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    if (!isPng(buffer)) {
      return jsonError(415, "UNSUPPORTED_MEDIA_TYPE", "Only PNG images are supported.");
    }

    await mkdir(STORAGE_DIR, { recursive: true });
    await runCleanupIfNeeded();

    const fileName = generateFileName();
    const filePath = path.join(STORAGE_DIR, fileName);
    await writeFile(filePath, buffer);

    const mediaPath = `${PUBLIC_PREFIX}/${fileName}`;
    const mediaUrl = new URL(mediaPath, getAppBaseUrl({ requestUrl: request.url })).toString();

    return NextResponse.json(
      {
        ok: true,
        mediaPath,
        mediaUrl,
        expiresAt: new Date(Date.now() + TEMP_FILE_TTL_MS).toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return jsonError(500, "RESULT_PIN_UPLOAD_FAILED", "Unable to prepare Pinterest image right now.");
  }
}

export function GET() {
  return jsonError(410, "RESULT_PIN_CLIENT_ONLY", "Use POST to upload prepared result pins.");
}

export function HEAD() {
  return new Response(null, {
    status: 410,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
