import {
  GrowthActivityActorKind,
  GrowthContentClusterStatus,
  GrowthJobType,
  GrowthOpportunityDestinationKind,
  GrowthOpportunityEvidenceQuality,
  GrowthOpportunityType,
  Prisma,
} from "@prisma/client";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { getAttributionCollectionStatus } from "@/lib/growth/attribution/config";
import { enqueueGrowthJob } from "@/lib/growth/jobs";
import { prisma } from "@/lib/prisma";
import { clusterPins, translatorSlugFromUrl } from "./clustering";
import {
  CONTENT_CLUSTERING_VERSION,
  dateKey,
  OPPORTUNITY_ANALYTICS_FRESH_MS,
  OPPORTUNITY_INTELLIGENCE_VERSION,
  OPPORTUNITY_MAX_CLUSTERS,
  OPPORTUNITY_MAX_MEMBERS_PER_CLUSTER,
  OPPORTUNITY_MAX_OPPORTUNITIES,
  OPPORTUNITY_MAX_PIN_SIGNALS,
  OPPORTUNITY_PIN_CAP,
  OPPORTUNITY_SCORING_VERSION,
  opportunityWindow,
} from "./constants";
import {
  opportunityEvidenceSchema,
  pinSignalEvidenceSchema,
} from "./contracts";
import {
  aggregateClusterMetrics,
  classifyPinSignals,
  hasIncompleteSignalWindow,
  qualifyClusterOpportunities,
} from "./metrics";
import { scoreOpportunity } from "./scoring";
import { NullTrendProvider, type TrendProvider } from "./trends";

export async function evaluateOpportunityIntelligence(input?: {
  now?: Date;
  analysisDate?: Date;
  evidenceWindowStart?: Date;
  evidenceWindowEnd?: Date;
  trendProvider?: TrendProvider;
}) {
  const now = input?.now || new Date();
  const window = opportunityWindow(now);
  const analysisDate = input?.analysisDate || window.analysisDate;
  const start = input?.evidenceWindowStart || window.evidenceWindowStart;
  const end = input?.evidenceWindowEnd || window.evidenceWindowEnd;
  const attribution = await getAttributionCollectionStatus({
    readSettingWhenServerDisabled: true,
  });
  const pinsPlus = await prisma.growthPinterestPin.findMany({
    where: { isActive: true, analyticsEligible: true },
    select: {
      id: true,
      accountId: true,
      pinterestPinId: true,
      title: true,
      description: true,
      destinationUrl: true,
      account: { select: { activeRole: true } },
    },
    orderBy: { id: "asc" },
    take: OPPORTUNITY_PIN_CAP + 1,
  });
  const capReached = pinsPlus.length > OPPORTUNITY_PIN_CAP;
  const pins = pinsPlus.slice(0, OPPORTUNITY_PIN_CAP);
  const slugs = [
    ...new Set(
      pins
        .map((p) => translatorSlugFromUrl(p.destinationUrl))
        .filter((x): x is string => !!x),
    ),
  ];
  const [translators, metricRows, states, refs, boards, latestStrategy] =
    await Promise.all([
      prisma.translator.findMany({
        where: { slug: { in: slugs } },
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          primaryCategory: { select: { slug: true, name: true } },
        },
        take: OPPORTUNITY_PIN_CAP,
      }),
      prisma.growthPinterestPinMetricDaily.findMany({
        where: {
          pinId: { in: pins.map((p) => p.id) },
          metricDate: { gte: start, lte: end },
        },
        select: {
          pinId: true,
          metricDate: true,
          impressions: true,
          saves: true,
          pinClicks: true,
          outboundClicks: true,
        },
        orderBy: [{ pinId: "asc" }, { metricDate: "asc" }],
        take: OPPORTUNITY_PIN_CAP * 28,
      }),
      prisma.growthPinterestAnalyticsState.findMany({
        where: {
          accountId: { in: [...new Set(pins.map((p) => p.accountId))] },
        },
        select: { status: true, lastSuccessfulSyncAt: true },
        take: 3,
      }),
      attribution.enabled
        ? prisma.growthAttributionRef.findMany({
            where: { pinId: { in: pins.map((p) => p.id) } },
            select: {
              pinId: true,
              dailyAggregates: {
                where: { metricDate: { gte: start, lte: end } },
                select: { qualifiedConversions: true },
                take: 28,
              },
            },
            take: OPPORTUNITY_PIN_CAP,
          })
        : Promise.resolve([]),
      prisma.growthPinterestBoard.findMany({
        where: {
          accountId: { in: [...new Set(pins.map((p) => p.accountId))] },
          isActive: true,
        },
        select: { id: true },
        take: 100,
      }),
      prisma.growthAccountStrategyReview.findFirst({
        select: { recommendation: true },
        orderBy: { reviewMonth: "desc" },
      }),
    ]);
  const translatorMap = new Map(translators.map((t) => [t.slug, t]));
  const prepared = pins.map((p) => ({
    ...p,
    role: p.account.activeRole,
    translator:
      translatorMap.get(translatorSlugFromUrl(p.destinationUrl) || "") || null,
  }));
  const clusters = clusterPins(prepared).slice(0, OPPORTUNITY_MAX_CLUSTERS);
  const stale =
    states.length === 0 ||
    states.some(
      (s) =>
        s.status !== "FRESH" ||
        !s.lastSuccessfulSyncAt ||
        now.getTime() - s.lastSuccessfulSyncAt.getTime() >
          OPPORTUNITY_ANALYTICS_FRESH_MS,
    );
  let quality = !pins.length
    ? GrowthOpportunityEvidenceQuality.INSUFFICIENT_DATA
    : capReached
      ? GrowthOpportunityEvidenceQuality.PARTIAL
      : stale
        ? GrowthOpportunityEvidenceQuality.STALE
        : GrowthOpportunityEvidenceQuality.KNOWN;
  const qpcByPin = new Map<string, number>();
  for (const ref of refs)
    if (ref.pinId)
      qpcByPin.set(
        ref.pinId,
        ref.dailyAggregates.reduce((n, r) => n + r.qualifiedConversions, 0),
      );
  const evaluated = [];
  const pinMetricMap = new Map(
    prepared.map((pin) => [
      pin.id,
      aggregateClusterMetrics(metricRows, [pin.id], end),
    ]),
  );
  if (
    quality === GrowthOpportunityEvidenceQuality.KNOWN &&
    [...pinMetricMap.values()].some(hasIncompleteSignalWindow)
  )
    quality = GrowthOpportunityEvidenceQuality.PARTIAL;
  const pinSignals = prepared.flatMap((pin) => {
    const metrics = pinMetricMap.get(pin.id)!;
    return classifyPinSignals(metrics)
      .filter((signal) => !stale || signal.type === "WINNER")
      .map((signal) => ({
        pin,
        metrics,
        signal,
        evidence: pinSignalEvidenceSchema.parse({
          intelligenceModelVersion: OPPORTUNITY_INTELLIGENCE_VERSION,
          type: signal.type,
          strength: signal.strength,
          windowStart: dateKey(start),
          windowEnd: dateKey(end),
          impressions: metrics.impressions.toString(),
          outboundClicks: metrics.outboundClicks.toString(),
          recentImpressions: metrics.recentImpressions.toString(),
          previousImpressions: metrics.previousImpressions.toString(),
          recentOutboundClicks: metrics.recentOutboundClicks.toString(),
          previousOutboundClicks: metrics.previousOutboundClicks.toString(),
          impressionVelocityPercent: metrics.impressionVelocityPercent,
          outboundVelocityPercent: metrics.outboundVelocityPercent,
          ctrChangePercent: metrics.ctrChangePercent,
          saveRateChangePercent: metrics.saveRateChangePercent,
          activeWeekCount: metrics.activeWeekCount,
          observationDays: metrics.observationDays,
        }),
      }));
  });
  const provider = input?.trendProvider || new NullTrendProvider();
  for (const cluster of clusters) {
    const metrics = aggregateClusterMetrics(
      metricRows,
      cluster.pins.map((p) => p.id),
      end,
    );
    const destinations = new Set(
      cluster.pins.map((p) => p.destinationPath).filter(Boolean),
    ).size;
    const qualified = attribution.enabled
      ? cluster.pins.reduce((n, p) => n + (qpcByPin.get(p.id) || 0), 0)
      : null;
    await provider.getSignal({ clusterKey: cluster.key, start, end });
    const signals = qualifyClusterOpportunities({
      metrics,
      pinMetrics: cluster.pins.map((pin) => pinMetricMap.get(pin.id)!),
      pinCount: cluster.pins.length,
      destinations,
      stale,
    });
    if (
      attribution.enabled &&
      qualified !== null &&
      qualified >= 3 &&
      metrics.impressions < BigInt(1000)
    )
      signals.push(GrowthOpportunityType.HIGH_CONVERSION_LOW_REACH);
    if (
      attribution.enabled &&
      qualified === 0 &&
      metrics.outboundClicks >= BigInt(20)
    )
      signals.push(GrowthOpportunityType.HIGH_CLICK_LOW_CONVERSION);
    const opportunities = signals.slice(0, 4).map((type) => {
      const scoring = scoreOpportunity({
        type,
        metrics,
        pinCount: cluster.pins.length,
        destinationCount: destinations,
        evidencePartial: capReached,
        stale,
        qualifiedConversions: qualified,
      });
      const evidence = opportunityEvidenceSchema.parse({
        intelligenceModelVersion: OPPORTUNITY_INTELLIGENCE_VERSION,
        scoringModelVersion: OPPORTUNITY_SCORING_VERSION,
        clusteringModelVersion: CONTENT_CLUSTERING_VERSION,
        type,
        clusterKey: cluster.key,
        windowStart: dateKey(start),
        windowEnd: dateKey(end),
        metrics: {
          impressions: metrics.impressions.toString(),
          saves: metrics.saves.toString(),
          pinClicks: metrics.pinClicks.toString(),
          outboundClicks: metrics.outboundClicks.toString(),
          qualifiedConversions: qualified,
        },
        components: scoring.components,
        pinCount: cluster.pins.length,
        distinctDestinationCount: destinations,
        activeWeekCount: metrics.activeWeekCount,
        velocityPercent: metrics.impressionVelocityPercent,
        attributionCollection: attribution.enabled
          ? "COLLECTING"
          : "NOT_COLLECTING",
        supportingPinterestPinIds: cluster.pins
          .slice(0, 20)
          .map((p) => p.pinterestPinId),
        context: {
          boardCount: boards.length,
          latestStrategyRecommendation: latestStrategy?.recommendation || null,
        },
      });
      return { type, ...scoring, evidence };
    });
    evaluated.push({
      cluster,
      metrics,
      destinations,
      qualified,
      opportunities,
    });
  }
  return {
    analysisDate,
    start,
    end,
    capReached,
    pinsConsidered: pins.length,
    quality,
    attributionCollection: attribution.enabled
      ? "COLLECTING"
      : "NOT_COLLECTING",
    evaluated,
    pinSignals: pinSignals.slice(0, OPPORTUNITY_MAX_PIN_SIGNALS),
  };
}

export async function persistOpportunityAnalysis(
  input?: Parameters<typeof evaluateOpportunityIntelligence>[0],
) {
  const result = await evaluateOpportunityIntelligence(input);
  const existing = await prisma.growthOpportunityAnalysisRun.findUnique({
    where: {
      analysisDate_intelligenceModelVersion: {
        analysisDate: result.analysisDate,
        intelligenceModelVersion: OPPORTUNITY_INTELLIGENCE_VERSION,
      },
    },
  });
  if (existing) return { run: existing, created: false };
  const opportunityCount = Math.min(
    OPPORTUNITY_MAX_OPPORTUNITIES,
    OPPORTUNITY_MAX_PIN_SIGNALS,
    result.evaluated.reduce((n, e) => n + e.opportunities.length, 0),
  );
  try {
    return await prisma.$transaction(async (tx) => {
      const run = await tx.growthOpportunityAnalysisRun.create({
        data: {
          analysisDate: result.analysisDate,
          evidenceWindowStart: result.start,
          evidenceWindowEnd: result.end,
          intelligenceModelVersion: OPPORTUNITY_INTELLIGENCE_VERSION,
          scoringModelVersion: OPPORTUNITY_SCORING_VERSION,
          clusteringModelVersion: CONTENT_CLUSTERING_VERSION,
          evidenceQuality: result.quality,
          pinsConsidered: result.pinsConsidered,
          pinCap: OPPORTUNITY_PIN_CAP,
          capReached: result.capReached,
          clustersProduced: result.evaluated.length,
          opportunitiesProduced: opportunityCount,
          attributionCollection: result.attributionCollection,
          reasonCodes: [
            ...(result.capReached ? ["PIN_CAP_REACHED"] : []),
            ...(result.quality === GrowthOpportunityEvidenceQuality.STALE
              ? ["ANALYTICS_STALE"]
              : []),
          ],
          summary: `Analyzed ${result.pinsConsidered} eligible Pins into ${result.evaluated.length} deterministic clusters and ${opportunityCount} opportunities.`,
        },
      });
      let written = 0;
      for (const item of result.evaluated) {
        const cluster = await tx.growthContentCluster.upsert({
          where: {
            clusterKey_clusteringVersion: {
              clusterKey: item.cluster.key,
              clusteringVersion: CONTENT_CLUSTERING_VERSION,
            },
          },
          create: {
            clusterKey: item.cluster.key,
            name: item.cluster.name,
            clusteringVersion: CONTENT_CLUSTERING_VERSION,
            targetRole: item.cluster.role,
            status:
              item.cluster.pins.length >= 2
                ? GrowthContentClusterStatus.ACTIVE
                : GrowthContentClusterStatus.INSUFFICIENT_DATA,
            summary: `Deterministic lexical cluster containing ${item.cluster.pins.length} eligible Pins.`,
          },
          update: {
            name: item.cluster.name,
            targetRole: item.cluster.role,
            status: GrowthContentClusterStatus.ACTIVE,
            summary: `Deterministic lexical cluster containing ${item.cluster.pins.length} eligible Pins.`,
          },
        });
        const snapshot = await tx.growthContentClusterSnapshot.create({
          data: {
            analysisRunId: run.id,
            clusterId: cluster.id,
            pinCount: item.cluster.pins.length,
            distinctDestinationCount: item.destinations,
            activeWeekCount: item.metrics.activeWeekCount,
            impressions: item.metrics.impressions,
            saves: item.metrics.saves,
            pinClicks: item.metrics.pinClicks,
            outboundClicks: item.metrics.outboundClicks,
            qualifiedConversions: item.qualified,
            topPinImpressionPercent: item.metrics.topPinImpressionPercent,
            topThreeImpressionPercent: item.metrics.topThreeImpressionPercent,
            topPinOutboundPercent: item.metrics.topPinOutboundPercent,
            topThreeOutboundPercent: item.metrics.topThreeOutboundPercent,
            velocityPercent: item.metrics.impressionVelocityPercent,
            evidenceQuality: result.quality,
            reasonCodes: [],
          },
        });
        await tx.growthContentClusterMembership.createMany({
          data: item.cluster.pins
            .slice(0, OPPORTUNITY_MAX_MEMBERS_PER_CLUSTER)
            .map((p) => ({
              snapshotId: snapshot.id,
              pinId: p.id,
              translatorId: p.translator?.id || null,
              pinterestPinId: p.pinterestPinId,
              destinationPath: p.destinationPath,
              matchTokens: p.matchTokens.slice(0, 20),
            })),
        });
        for (const opportunity of item.opportunities) {
          if (written >= OPPORTUNITY_MAX_OPPORTUNITIES) break;
          await tx.growthOpportunity.create({
            data: {
              analysisRunId: run.id,
              clusterId: cluster.id,
              type: opportunity.type,
              score: opportunity.score,
              confidence: opportunity.confidence,
              evidenceQuality: result.quality,
              scoringModelVersion: OPPORTUNITY_SCORING_VERSION,
              clusteringModelVersion: CONTENT_CLUSTERING_VERSION,
              targetRole: item.cluster.role,
              targetDestinationKind: item.cluster.pins.every(
                (p) => p.translator,
              )
                ? GrowthOpportunityDestinationKind.TRANSLATOR
                : item.destinations > 1
                  ? GrowthOpportunityDestinationKind.MULTIPLE
                  : GrowthOpportunityDestinationKind.UNKNOWN,
              evidence:
                opportunity.evidence as unknown as Prisma.InputJsonValue,
              reasonCodes: [],
              dedupeKey: `${OPPORTUNITY_INTELLIGENCE_VERSION}:${dateKey(result.analysisDate)}:${opportunity.type}:${item.cluster.key}`,
            },
          });
          written++;
        }
      }
      const persistedClusters = await tx.growthContentCluster.findMany({
        where: {
          clusteringVersion: CONTENT_CLUSTERING_VERSION,
          clusterKey: { in: result.evaluated.map((item) => item.cluster.key) },
        },
        select: { id: true, clusterKey: true },
        take: OPPORTUNITY_MAX_CLUSTERS,
      });
      const idByKey = new Map(
        persistedClusters.map((cluster) => [cluster.clusterKey, cluster.id]),
      );
      const clusterIdByPin = new Map<string, string>();
      for (const item of result.evaluated)
        for (const pin of item.cluster.pins) {
          const clusterId = idByKey.get(item.cluster.key);
          if (clusterId) clusterIdByPin.set(pin.id, clusterId);
        }
      if (result.pinSignals.length)
        await tx.growthPinSignal.createMany({
          data: result.pinSignals.map(({ pin, signal, evidence }) => ({
            analysisRunId: run.id,
            clusterId: clusterIdByPin.get(pin.id) || null,
            pinId: pin.id,
            pinterestPinId: pin.pinterestPinId,
            type: signal.type,
            strength: signal.strength,
            confidence:
              result.quality === GrowthOpportunityEvidenceQuality.STALE
                ? Math.min(60, signal.confidence)
                : result.quality === GrowthOpportunityEvidenceQuality.PARTIAL
                  ? Math.min(75, signal.confidence)
                  : signal.confidence,
            evidenceQuality: result.quality,
            evidence: evidence as unknown as Prisma.InputJsonValue,
            reasonCodes: signal.reasonCodes,
            dedupeKey: `${OPPORTUNITY_INTELLIGENCE_VERSION}:${dateKey(result.analysisDate)}:${signal.type}:${pin.pinterestPinId}`,
          })),
        });
      await recordGrowthActivity(
        {
          actorKind: GrowthActivityActorKind.WORKER,
          entityType: "GrowthOpportunityAnalysisRun",
          entityId: run.id,
          action: "OPPORTUNITY_ANALYSIS_COMPLETED",
          toState: result.quality,
          summary: {
            pinsConsidered: result.pinsConsidered,
            clusters: result.evaluated.length,
            opportunities: written,
            pinSignals: result.pinSignals.length,
            modelVersion: OPPORTUNITY_INTELLIGENCE_VERSION,
          },
          correlationKey: `opportunity-intelligence:${dateKey(result.analysisDate)}`,
        },
        tx,
      );
      return { run, created: true };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const run = await prisma.growthOpportunityAnalysisRun.findUnique({
        where: {
          analysisDate_intelligenceModelVersion: {
            analysisDate: result.analysisDate,
            intelligenceModelVersion: OPPORTUNITY_INTELLIGENCE_VERSION,
          },
        },
      });
      if (run) return { run, created: false };
    }
    throw error;
  }
}
export async function enqueueOpportunityAnalysis(now = new Date()) {
  const { analysisDate } = opportunityWindow(now);
  return enqueueGrowthJob({
    type: GrowthJobType.OPPORTUNITY_INTELLIGENCE_ANALYSIS,
    idempotencyKey: `opportunity-intelligence:${OPPORTUNITY_INTELLIGENCE_VERSION}:${dateKey(analysisDate)}`,
    payload: {
      analysisDate: dateKey(analysisDate),
      modelVersion: OPPORTUNITY_INTELLIGENCE_VERSION,
    },
  });
}
