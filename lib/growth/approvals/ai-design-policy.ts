import { prisma } from "@/lib/prisma";

/** Retire only unapproved reviews with legacy template art. Never alter an
 * approved publication, immutable review evidence, or owner rejection. */
export async function retirePendingTemplateReviews(now = new Date()) {
  if (process.env.NODE_ENV !== "production") return 0;
  const reviews = await prisma.growthApprovalRequest.findMany({
    where: { status: "PENDING", kind: { in: ["NATIVE_PIN", "SOURCE_PIN"] } },
    select: { id: true },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  let retired = 0;
  for (const row of reviews) {
    retired += await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GrowthApprovalRequest" WHERE "id" = ${row.id} FOR UPDATE`;
      const review = await tx.growthApprovalRequest.findUniqueOrThrow({
        where: { id: row.id },
      });
      if (review.status !== "PENDING") return 0;
      if (review.kind === "NATIVE_PIN") {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pin-approval:" + review.subjectId}))`;
        const candidate = await tx.growthPinCandidate.findUnique({
          where: { id: review.subjectId },
          include: { asset: true, approvals: true },
        });
        if (
          !candidate ||
          candidate.asset.generationKind === "AI" ||
          candidate.approvals.length
        )
          return 0;
        if (candidate.status === "READY")
          await tx.growthPinCandidate.update({
            where: { id: candidate.id },
            data: { status: "DEFERRED" },
          });
      } else {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('growth-viral-portfolio-approval-v1'))`;
        const draft = await tx.growthViralPinTest.findUnique({
          where: { id: review.subjectId },
        });
        if (
          !draft ||
          draft.status !== "PLANNED" ||
          draft.designGenerationKind === "AI" ||
          draft.approvedAt
        )
          return 0;
        await tx.growthViralPinTest.update({
          where: { id: draft.id },
          data: {
            status: "CANCELLED",
            lastErrorCode: "REPLACED_BY_AI_DESIGN_POLICY",
          },
        });
      }
      await tx.growthApprovalRequest.update({
        where: { id: review.id },
        data: {
          status: "STALE",
          decidedAt: now,
          result: { reason: "AI_DESIGN_REQUIRED" },
        },
      });
      await tx.growthActivity.create({
        data: {
          actorKind: "SYSTEM",
          entityType: "GrowthApprovalRequest",
          entityId: review.id,
          action: "TEMPLATE_REVIEW_RETIRED",
          summary: {
            reason: "Owner requires new AI designs",
            pinApproved: false,
            paidRequests: 0,
            historyPreserved: true,
          },
        },
      });
      return 1;
    });
  }
  return retired;
}
