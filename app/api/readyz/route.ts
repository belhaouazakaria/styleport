import { apiError, apiOk } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const READY_CHECK_CACHE_TTL_MS = 10_000;
let lastReadyCheckAt = 0;

export async function GET() {
  const now = Date.now();
  if (now - lastReadyCheckAt < READY_CHECK_CACHE_TTL_MS) {
    return apiOk({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    lastReadyCheckAt = now;
    return apiOk({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError("readiness_check_failed", "Readiness check failed while validating database connectivity.", undefined, error);
    return apiError(503, "UPSTREAM_ERROR", "Service is not ready.");
  }
}
