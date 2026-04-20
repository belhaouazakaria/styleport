import Tesseract from "tesseract.js";

import { normalizeWhitespace } from "@/lib/utils";

export async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  const result = await Tesseract.recognize(buffer, "eng", {
    logger: () => {
      // Keep OCR silent in API route logs.
    },
  });

  return normalizeWhitespace(result.data.text || "");
}
