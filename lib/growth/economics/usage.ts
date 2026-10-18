import { prisma } from "@/lib/prisma";

export type GrowthUsageKind = "TEXT_DECISION" | "IDEA_VERSION" | "AI_IMAGE";

export interface GrowthUsageEvent {
  key: string;
  kind: GrowthUsageKind;
  provider: string;
  model: string;
  responseId: string | null;
  decisionId: string | null;
  createdAt: Date;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  imageUnits: number | null;
  estimatedUsd: number | null;
}

export function summarizeGrowthUsage(events: GrowthUsageEvent[], truncated: boolean) {
  // A successful Idea execution may persist the same model response on its
  // decision and immutable version. Count it once without erasing provenance.
  const versionsWithDecision = new Set(
    events.filter((event) => event.kind === "IDEA_VERSION" && event.decisionId)
      .map((event) => event.decisionId),
  );
  const seenResponses = new Set<string>();
  const unique = events
    .filter((event) => event.kind !== "TEXT_DECISION" || !versionsWithDecision.has(event.key))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .filter((event) => {
      if (!event.responseId) return true;
      const key = `${event.provider}:${event.responseId}`;
      if (seenResponses.has(key)) return false;
      seenResponses.add(key);
      return true;
    });

  const text = unique.filter((event) => event.kind !== "AI_IMAGE");
  const images = unique.filter((event) => event.kind === "AI_IMAGE");
  const knownEstimates = images.filter((event) => event.estimatedUsd !== null);
  return {
    eventCount: unique.length,
    textRequests: text.length,
    imageRequests: images.length,
    inputTokens: text.reduce((sum, event) => sum + (event.inputTokens ?? 0), 0),
    outputTokens: text.reduce((sum, event) => sum + (event.outputTokens ?? 0), 0),
    imageUnits: images.reduce((sum, event) => sum + (event.imageUnits ?? 0), 0),
    unknownTokenRecords: text.filter((event) => event.totalTokens === null).length,
    unpricedRecords: unique.filter((event) => event.estimatedUsd === null).length,
    // This is NOT actual spend: the source stores only estimates for AI images
    // and planned cost on GrowthDecision. Never label it as a paid amount.
    knownImageEstimatesUsd: knownEstimates.reduce((sum, event) => sum + (event.estimatedUsd ?? 0), 0),
    truncated,
    recent: unique.slice(0, 30),
  };
}

const RECORD_CAP = 2000;

export async function getGrowthUsageInventory(days: 7 | 30 = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [decisions, versions, assets] = await Promise.all([
    prisma.growthDecision.findMany({
      where: { createdAt: { gte: since }, aiProvider: { not: null } },
      orderBy: { createdAt: "desc" },
      take: RECORD_CAP + 1,
      select: { id: true, createdAt: true, aiProvider: true, aiModel: true, aiResponseId: true,
        aiPromptTokens: true, aiCompletionTokens: true, aiTotalTokens: true },
    }),
    prisma.growthIdeaVersion.findMany({
      where: { createdAt: { gte: since }, aiProvider: { not: null } },
      orderBy: { createdAt: "desc" },
      take: RECORD_CAP + 1,
      select: { id: true, decisionId: true, createdAt: true, aiProvider: true, aiModel: true,
        aiResponseId: true, aiPromptTokens: true, aiCompletionTokens: true, aiTotalTokens: true },
    }),
    prisma.growthAsset.findMany({
      where: { createdAt: { gte: since }, generationKind: "AI" },
      orderBy: { createdAt: "desc" },
      take: RECORD_CAP + 1,
      select: { id: true, createdAt: true, aiProvider: true, aiModel: true, aiResponseId: true,
        aiImageUnits: true, estimatedCost: true },
    }),
  ]);
  const truncated = [decisions, versions, assets].some((rows) => rows.length > RECORD_CAP);
  const events: GrowthUsageEvent[] = [
    ...decisions.slice(0, RECORD_CAP).map((row) => ({
      key: row.id, kind: "TEXT_DECISION" as const, decisionId: null, createdAt: row.createdAt,
      provider: row.aiProvider || "UNKNOWN", model: row.aiModel || "UNKNOWN",
      responseId: row.aiResponseId, inputTokens: row.aiPromptTokens,
      outputTokens: row.aiCompletionTokens, totalTokens: row.aiTotalTokens,
      imageUnits: null, estimatedUsd: null,
    })),
    ...versions.slice(0, RECORD_CAP).map((row) => ({
      key: row.id, kind: "IDEA_VERSION" as const, decisionId: row.decisionId, createdAt: row.createdAt,
      provider: row.aiProvider || "UNKNOWN", model: row.aiModel || "UNKNOWN",
      responseId: row.aiResponseId, inputTokens: row.aiPromptTokens,
      outputTokens: row.aiCompletionTokens, totalTokens: row.aiTotalTokens,
      imageUnits: null, estimatedUsd: null,
    })),
    ...assets.slice(0, RECORD_CAP).map((row) => ({
      key: row.id, kind: "AI_IMAGE" as const, decisionId: null, createdAt: row.createdAt,
      provider: row.aiProvider || "UNKNOWN", model: row.aiModel || "UNKNOWN",
      responseId: row.aiResponseId, inputTokens: null, outputTokens: null, totalTokens: null,
      imageUnits: row.aiImageUnits, estimatedUsd: row.estimatedCost ? Number(row.estimatedCost) : null,
    })),
  ];
  return { windowDays: days, ...summarizeGrowthUsage(events, truncated) };
}
