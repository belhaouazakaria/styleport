import { NextResponse } from "next/server";
import path from "node:path";

const PINS_STORAGE_DIR = path.join(process.cwd(), "storage", "generated", "pins");

function isValidFilename(filename: string): boolean {
  if (!filename || filename.length > 255) return false;
  if (filename !== path.normalize(filename)) return false;
  if (filename.startsWith(".") || filename.includes("..")) return false;
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) return false;
  return true;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;

  if (!isValidFilename(filename)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const filePath = path.join(PINS_STORAGE_DIR, filename);

  try {
    const fs = await import("node:fs/promises");
    await fs.access(filePath);
    const fileBuffer = await fs.readFile(filePath);

    const extension = path.extname(filename).toLowerCase();
    let contentType = "application/octet-stream";
    if (extension === ".png") contentType = "image/png";
    else if (extension === ".jpg" || extension === ".jpeg") contentType = "image/jpeg";
    else if (extension === ".webp") contentType = "image/webp";
    else if (extension === ".svg") contentType = "image/svg+xml";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;

  if (!isValidFilename(filename)) {
    return new NextResponse(null, { status: 404 });
  }

  const filePath = path.join(PINS_STORAGE_DIR, filename);

  try {
    const fs = await import("node:fs/promises");
    await fs.access(filePath);
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}