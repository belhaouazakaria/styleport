import { loadGrowthWorkerEnvironment } from "./growth-worker-bootstrap";

async function main() {
  loadGrowthWorkerEnvironment();
  const [{ runPinterestQuotaProbe, QuotaProbeBlocked }, { prisma }] = await Promise.all([
    import("@/lib/growth/operations/quota-probe"),
    import("@/lib/prisma"),
  ]);
  try {
    const result = await runPinterestQuotaProbe();
    // Fixed, sanitized schema only. Never print token, account identity or provider body.
    console.log("GROWTH_QUOTA_PROBE_RESULT=" + JSON.stringify(result));
  } catch (error) {
    const code = error instanceof QuotaProbeBlocked ? error.code : "INTERNAL_ERROR";
    console.error("GROWTH_QUOTA_PROBE_FAILED=" + code);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
