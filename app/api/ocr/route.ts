import { NextResponse } from "next/server";

import { ALLOWED_IMAGE_TYPES, OCR_MAX_FILE_SIZE_MB } from "@/lib/constants";
import { extractTextFromImageBuffer, OcrBusyError } from "@/lib/ocr";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ApiErrorCode, OcrResponse } from "@/lib/types";
import { extractClientIp } from "@/lib/utils";

export const runtime = "nodejs";

function errorResponse(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json<OcrResponse>(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}

export async function POST(request: Request) {
  const identifier = extractClientIp(request);
  const limit = checkRateLimit(`ocr:${identifier}`);

  if (!limit.allowed) {
    return errorResponse(429, "RATE_LIMITED", "Too many OCR requests. Please try again shortly.");
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return errorResponse(400, "VALIDATION_ERROR", "Please upload an image file first.");
  }

  if (!ALLOWED_IMAGE_TYPES.includes(image.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return errorResponse(415, "UNSUPPORTED_FILE", "Only png, jpg, jpeg, and webp are supported.");
  }

  if (image.size > OCR_MAX_FILE_SIZE_MB * 1024 * 1024) {
    return errorResponse(413, "TOO_LONG", `Image must be smaller than ${OCR_MAX_FILE_SIZE_MB}MB.`);
  }

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const text = await extractTextFromImageBuffer(buffer);

    if (!text) {
      return errorResponse(422, "OCR_ERROR", "No readable text was detected in that image.");
    }

    return NextResponse.json<OcrResponse>({ ok: true, text });
  } catch (error) {
    if (error instanceof OcrBusyError) {
      return errorResponse(503, "UPSTREAM_ERROR", "OCR is busy right now. Please try again in a moment.");
    }

    return errorResponse(500, "OCR_ERROR", "OCR failed while reading that image.");
  }
}
