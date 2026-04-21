import { apiError, apiOk } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return apiOk({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError("readiness_check_failed", "Readiness check failed while validating database connectivity.", undefined, error);
    return apiError(503, "UPSTREAM_ERROR", "Service is not ready.");
  }
}

