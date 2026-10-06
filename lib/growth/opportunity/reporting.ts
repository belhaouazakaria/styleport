import { prisma } from "@/lib/prisma";
export async function getOpportunityDashboard() {
  const latestRun = await prisma.growthOpportunityAnalysisRun.findFirst({
    orderBy: { analysisDate: "desc" },
  });
  if (!latestRun)
    return { latestRun: null, opportunities: [], clusters: [], pinSignals: [] };
  const [opportunities, clusters, pinSignals] = await Promise.all([
    prisma.growthOpportunity.findMany({
      where: { analysisRunId: latestRun.id },
      include: { cluster: { select: { clusterKey: true, name: true } } },
      orderBy: [{ score: "desc" }, { createdAt: "asc" }],
      take: 50,
    }),
    prisma.growthContentClusterSnapshot.findMany({
      where: { analysisRunId: latestRun.id },
      include: {
        cluster: { select: { clusterKey: true, name: true, targetRole: true } },
        memberships: {
          select: { pinterestPinId: true, destinationPath: true },
          take: 10,
        },
      },
      orderBy: [{ outboundClicks: "desc" }, { createdAt: "asc" }],
      take: 50,
    }),
    prisma.growthPinSignal.findMany({
      where: { analysisRunId: latestRun.id },
      include: {
        pin: { select: { title: true } },
        cluster: { select: { name: true } },
      },
      orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
      take: 50,
    }),
  ]);
  return { latestRun, opportunities, clusters, pinSignals };
}
