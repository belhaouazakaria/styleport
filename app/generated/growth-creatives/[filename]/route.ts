import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import { resolveCreativeAssetFile } from "@/lib/growth/creative/storage";

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const filePath = resolveCreativeAssetFile(filename);
  if (!filePath) return new NextResponse("Not Found", { status: 404 });
  try {
    const bytes = await readFile(filePath);
    return new NextResponse(bytes, { headers: { "Content-Type": "image/png", "Content-Length": String(bytes.length), "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}

export async function HEAD(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const filePath = resolveCreativeAssetFile(filename);
  if (!filePath) return new NextResponse(null, { status: 404 });
  try {
    const bytes = await readFile(filePath);
    return new NextResponse(null, { headers: { "Content-Type": "image/png", "Content-Length": String(bytes.length), "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
