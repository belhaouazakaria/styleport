import { Prisma } from "@prisma/client";

import {
  MAX_GROWTH_ACTIVITY_SUMMARY_BYTES,
  MAX_GROWTH_JOB_PAYLOAD_BYTES,
} from "@/lib/growth/contracts";

const SENSITIVE_KEY = /(?:password|secret|token|authorization|cookie|database_url|api[_-]?key)/i;
const MAX_DEPTH = 5;

function normalize(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH || value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((entry) => normalize(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === "object") {
    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, entry] of Object.entries(value).slice(0, 50)) {
      if (SENSITIVE_KEY.test(key)) continue;
      const normalized = normalize(entry, depth + 1);
      if (normalized !== undefined) result[key] = normalized as Prisma.InputJsonValue;
    }
    return result;
  }

  return undefined;
}

export function toBoundedGrowthJson(value: unknown, maximumBytes: number): Prisma.InputJsonValue | undefined {
  const normalized = normalize(value, 0);
  if (normalized === undefined) return undefined;
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > maximumBytes) {
    throw new Error("Growth structured data exceeds the allowed size.");
  }
  return normalized as Prisma.InputJsonValue;
}

export function toSafeGrowthPayload(value: unknown) {
  return toBoundedGrowthJson(value, MAX_GROWTH_JOB_PAYLOAD_BYTES);
}

export function toSafeGrowthSummary(value: unknown) {
  return toBoundedGrowthJson(value, MAX_GROWTH_ACTIVITY_SUMMARY_BYTES);
}

export function toSafeGrowthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, "$1[redacted]")
    .replace(/(authorization\s*[:=]\s*)(?:basic|bearer)?\s*[^\s,;]+/gi, "$1[redacted]")
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/((?:set-)?cookie\s*[:=]\s*)[^\r\n;]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|database_url)\s*[:=]\s*([^\s&,;}]+)/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_000);
}
