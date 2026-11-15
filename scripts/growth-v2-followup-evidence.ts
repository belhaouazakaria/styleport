import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";

/** Read-only release evidence. A reservation, pending read or approval is never executed here. */
export async function readV2FollowupEvidence() {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const settings = await tx.growthSettings.findUniqueOrThrow({
        where: { id: "global" },
      });
      if (
        settings.enabled ||
        settings.attributionEnabled ||
        settings.workerActivationExpiresAt ||
        (await countBlockingGrowthJobs(tx)) ||
        (await tx.growthViralPinTest.count({ where: { status: "PUBLISHING" } }))
      )
        throw Error("FOLLOWUP_QUEUE_BUSY");
      const rows = await tx.$queryRaw<{ evidence: Prisma.JsonValue }[]>`
      SELECT jsonb_build_object(
        'jobs', (SELECT COALESCE(jsonb_agg(to_jsonb(j) ORDER BY j.id),'[]') FROM "GrowthJob" j WHERE j.status IN ('PENDING','CLAIMED','RUNNING','FAILED_RETRYABLE')),
        'settings', (SELECT to_jsonb(g) FROM "GrowthSettings" g WHERE g.id='global'),
        'policy', (SELECT to_jsonb(v) FROM "GrowthViralProgramSettings" v WHERE v.id='global'),
        'publications', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM "GrowthPinPublication" p),
        'approvals', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM "GrowthPinApproval" a),
        'candidates', (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM "GrowthPinCandidate" c),
        'sources', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') FROM "GrowthViralPinTest" s)
      ) AS evidence`;
      return {
        safe: true,
        fingerprint: createHash("sha256")
          .update(JSON.stringify(rows[0].evidence))
          .digest("hex"),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 15000,
    },
  );
}
if (process.env.GROWTH_V2_FOLLOWUP_EVIDENCE === "true") {
  readV2FollowupEvidence()
    .then((r) => console.log(JSON.stringify(r)))
    .catch(() => {
      console.error("FOLLOWUP_QUEUE_EVIDENCE=BLOCKED");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
