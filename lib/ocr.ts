import Tesseract from "tesseract.js";

import { normalizeWhitespace } from "@/lib/utils";

const OCR_MAX_CONCURRENCY = Math.max(1, Number(process.env.OCR_MAX_CONCURRENCY || 1));
const OCR_MAX_QUEUE = Math.max(0, Number(process.env.OCR_MAX_QUEUE || 6));
const OCR_QUEUE_WAIT_TIMEOUT_MS = Math.max(1_000, Number(process.env.OCR_QUEUE_WAIT_TIMEOUT_MS || 15_000));

interface OcrWaiter {
  id: number;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

let activeOcrJobs = 0;
let waiterSeq = 0;
const ocrWaitQueue: OcrWaiter[] = [];

export class OcrBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrBusyError";
  }
}

function dequeueWaiterById(id: number) {
  const index = ocrWaitQueue.findIndex((waiter) => waiter.id === id);
  if (index >= 0) {
    ocrWaitQueue.splice(index, 1);
  }
}

function releaseOcrSlot() {
  activeOcrJobs = Math.max(0, activeOcrJobs - 1);

  const nextWaiter = ocrWaitQueue.shift();
  if (!nextWaiter) {
    return;
  }

  clearTimeout(nextWaiter.timeoutId);
  activeOcrJobs += 1;
  nextWaiter.resolve(createReleaseHandle());
}

function createReleaseHandle() {
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    releaseOcrSlot();
  };
}

async function acquireOcrSlot() {
  if (activeOcrJobs < OCR_MAX_CONCURRENCY) {
    activeOcrJobs += 1;
    return createReleaseHandle();
  }

  if (ocrWaitQueue.length >= OCR_MAX_QUEUE) {
    throw new OcrBusyError("OCR queue is full.");
  }

  return new Promise<() => void>((resolve, reject) => {
    waiterSeq += 1;
    const id = waiterSeq;
    const timeoutId = setTimeout(() => {
      dequeueWaiterById(id);
      reject(new OcrBusyError("OCR queue timed out."));
    }, OCR_QUEUE_WAIT_TIMEOUT_MS);

    ocrWaitQueue.push({ id, resolve, reject, timeoutId });
  });
}

export async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  const release = await acquireOcrSlot();

  try {
    const result = await Tesseract.recognize(buffer, "eng", {
      logger: () => {
        // Keep OCR silent in API route logs.
      },
    });

    return normalizeWhitespace(result.data.text || "");
  } finally {
    release();
  }
}
