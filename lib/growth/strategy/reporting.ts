import { accountStrategyEvidenceSchema } from "@/lib/growth/strategy/contracts";
import { evaluateAccountStrategy } from "@/lib/growth/strategy/review";
import { prisma } from "@/lib/prisma";

export async function getAccountStrategyDashboard(now = new Date()) {
  const [current, latest] = await Promise.all([
    evaluateAccountStrategy({ now }),
    prisma.growthAccountStrategyReview.findFirst({
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        reviewMonth: true,
        evidenceWindowStart: true,
        evidenceWindowEnd: true,
        modelVersion: true,
        recommendation: true,
        plannedAccountCount: true,
        connectedAccountCount: true,
        recommendedAccountCount: true,
        confidence: true,
        evidenceQuality: true,
        evidence: true,
        reasonCodes: true,
        recommendationSummary: true,
        completedAt: true,
      },
    }),
  ]);
  const parsedLatest = latest
    ? accountStrategyEvidenceSchema.safeParse(latest.evidence)
    : null;
  return {
    current,
    latestReview: latest
      ? {
          ...latest,
          evidence: parsedLatest?.success ? parsedLatest.data : null,
        }
      : null,
  };
}
