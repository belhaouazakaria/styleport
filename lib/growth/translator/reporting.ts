import {
  GrowthDecisionStatus,
  GrowthOpportunityStatus,
} from "@prisma/client";

import { TRANSLATOR_AUTOPILOT_VERSION } from "@/lib/growth/translator/constants";
import { prisma } from "@/lib/prisma";
import { readTranslatorSnapshot } from "@/lib/growth/translator/snapshot";

export async function getTranslatorAutopilotDashboard() {
  const [latestDecision, decisions, versions, actionableOpportunities, statusCounts] = await Promise.all([
    prisma.growthDecision.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    prisma.growthDecision.findMany({
      include: {
        opportunity: { include: { cluster: { select: { name: true } } } },
        translator: { select: { id: true, name: true, slug: true, isActive: true, shareImagePath: true } },
        contentVersions: { select: { id: true, sideEffectStatus: true }, orderBy: { version: "desc" }, take: 1 },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
    prisma.growthContentVersion.findMany({
      include: {
        translator: { select: { id: true, name: true, slug: true, isActive: true, shareImagePath: true } },
        decision: { select: { id: true, type: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
    prisma.growthOpportunity.findMany({
      where: {
        status: GrowthOpportunityStatus.OPEN,
        evidenceQuality: "KNOWN",
        decisions: { none: { decisionModelVersion: TRANSLATOR_AUTOPILOT_VERSION } },
      },
      include: { cluster: { select: { name: true } } },
      orderBy: [{ score: "desc" }, { confidence: "desc" }, { createdAt: "asc" }],
      take: 50,
    }),
    prisma.growthDecision.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(statusCounts.map((item) => [item.status, item._count._all]));
  const translatorIds = [...new Set(versions.map((item) => item.translatorId))];
  const checksumEntries = await Promise.all(translatorIds.map(async (id) => [id, (await readTranslatorSnapshot(id))?.checksum || null] as const));
  const currentChecksums = new Map(checksumEntries);
  return {
    modelVersion: TRANSLATOR_AUTOPILOT_VERSION,
    latestDecision,
    decisions,
    versions: versions.map((item) => ({ ...item, currentChecksum: currentChecksums.get(item.translatorId) || null })),
    actionableOpportunities,
    counts: {
      completed: counts[GrowthDecisionStatus.COMPLETED] || 0,
      waiting: counts[GrowthDecisionStatus.WAITING_DATA] || 0,
      rejected: counts[GrowthDecisionStatus.REJECTED] || 0,
    },
  };
}
