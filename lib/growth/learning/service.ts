import {
  GrowthActivityActorKind,
  GrowthCreativeDestinationKind,
  GrowthEvergreenRecommendation,
  GrowthEvergreenRecommendationStatus,
  GrowthExperimentStatus,
  GrowthJobType,
  GrowthLearningEvidenceQuality,
  GrowthPublicationStatus,
  Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { enqueueCreativeGeneration } from "@/lib/growth/creative/candidates";
import { experimentVariantsSchema } from "@/lib/growth/creative/contracts";
import {
  EVERGREEN_MODEL_VERSION,
  EXPERIMENT_LEARNING_VERSION,
  LEARNED_SCHEDULER_VERSION,
  LEARNING_MODEL_VERSION,
  LEARNING_TIME_ZONE,
  LEARNING_WINDOW_DAYS,
  MAX_LEARNING_PUBLICATIONS,
  MAX_LEARNING_TARGETS,
  OPPORTUNITY_FEEDBACK_VERSION,
} from "@/lib/growth/learning/constants";
import {
  learningExperimentActionSchema,
  prepareEvergreenRecommendationSchema,
  type EvergreenTargetEvidence,
} from "@/lib/growth/learning/contracts";
import { evaluateEvergreenTarget } from "@/lib/growth/learning/evergreen";
import { evaluateExperiment } from "@/lib/growth/learning/experiments";
import {
  comparePerformance,
  type PerformanceObservation,
} from "@/lib/growth/learning/performance";
import { evaluateLearnedWindows } from "@/lib/growth/learning/scheduler";
import { enqueueGrowthJob } from "@/lib/growth/jobs";
import { prisma } from "@/lib/prisma";

function utcDay(value = new Date()) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}
function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
function safeNumber(value: bigint | number | null | undefined) {
  return value == null ? 0 : Number(value);
}
function sum<T>(
  rows: T[],
  read: (row: T) => bigint | number | null | undefined,
) {
  return rows.reduce((total, row) => total + safeNumber(read(row)), 0);
}

export async function enqueueLearningAnalysis(now = new Date()) {
  const analysisDate = utcDay(now);
  return enqueueGrowthJob({
    type: GrowthJobType.EVERGREEN_LEARNING_ANALYSIS,
    idempotencyKey: `evergreen-learning:${LEARNING_MODEL_VERSION}:${dateKey(analysisDate)}`,
    payload: {
      analysisDate: dateKey(analysisDate),
      learningModelVersion: LEARNING_MODEL_VERSION,
    },
    maxAttempts: 3,
  });
}

export async function persistLearningAnalysis(input: {
  analysisDate: Date;
  jobId?: string | null;
  now?: Date;
}) {
  const analysisDate = utcDay(input.analysisDate);
  const existing = await prisma.growthLearningRun.findUnique({
    where: {
      analysisDate_learningModelVersion: {
        analysisDate,
        learningModelVersion: LEARNING_MODEL_VERSION,
      },
    },
    include: {
      recommendations: true,
      scheduleWindows: true,
      experimentEvaluations: true,
    },
  });
  if (existing) return { run: existing, reused: true };
  const now = input.now || new Date();
  const evidenceWindowEnd = new Date(analysisDate.getTime() - 86_400_000);
  const evidenceWindowStart = new Date(
    evidenceWindowEnd.getTime() - (LEARNING_WINDOW_DAYS - 1) * 86_400_000,
  );
  const settings = await prisma.growthSettings.findUnique({
    where: { id: "global" },
    select: {
      enabled: true,
      attributionEnabled: true,
      evergreenCooldownDays: true,
    },
  });
  if (!settings?.enabled)
    throw new Error(
      "Growth is disabled; learning analysis remains queued until explicitly enabled.",
    );

  const [
    translators,
    ideas,
    publications,
    accounts,
    experiments,
    recentOpportunities,
    activeCandidates,
    fatigueSignals,
  ] = await Promise.all([
    prisma.translator.findMany({
      where: { isActive: true, archivedAt: null },
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: MAX_LEARNING_TARGETS,
    }),
    prisma.growthIdea.findMany({
      where: {
        status: "PUBLISHED",
        archivedAt: null,
        currentVersion: { is: { publishedAt: { not: null } } },
        category: { isActive: true, archivedAt: null },
      },
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: MAX_LEARNING_TARGETS,
    }),
    prisma.growthPinPublication.findMany({
      where: {
        status: {
          in: [
            GrowthPublicationStatus.PUBLISHED,
            GrowthPublicationStatus.RECONCILED,
          ],
        },
        publishedAt: { gte: evidenceWindowStart, lte: evidenceWindowEnd },
      },
      include: {
        candidate: {
          select: {
            destinationKind: true,
            translatorId: true,
            ideaId: true,
            clusterId: true,
            archetype: true,
            templateId: true,
            headlinePattern: true,
            ctaPattern: true,
            topic: true,
            experimentId: true,
            experimentVariantKey: true,
            createdAt: true,
          },
        },
        account: {
          select: { id: true, publicationRole: true, connectionStatus: true },
        },
        pinterestPin: {
          include: {
            dailyMetrics: {
              where: {
                metricDate: {
                  gte: evidenceWindowStart,
                  lte: evidenceWindowEnd,
                },
              },
              orderBy: { metricDate: "asc" },
              take: LEARNING_WINDOW_DAYS,
            },
          },
        },
        attributionRef: {
          include: {
            dailyAggregates: {
              where: {
                metricDate: {
                  gte: evidenceWindowStart,
                  lte: evidenceWindowEnd,
                },
              },
              select: { qualifiedConversions: true },
            },
          },
        },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: MAX_LEARNING_PUBLICATIONS,
    }),
    prisma.growthPinterestAccount.findMany({
      where: { activeRole: { not: null } },
      select: {
        id: true,
        connectionStatus: true,
        analyticsState: {
          select: { lastSuccessfulSyncAt: true, status: true },
        },
      },
      take: 20,
    }),
    prisma.growthExperiment.findMany({
      where: {
        status: {
          in: [
            GrowthExperimentStatus.RUNNING,
            GrowthExperimentStatus.ANALYZING,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        variants: true,
        candidates: {
          select: {
            experimentVariantKey: true,
            publications: {
              where: {
                status: {
                  in: [
                    GrowthPublicationStatus.PUBLISHED,
                    GrowthPublicationStatus.RECONCILED,
                  ],
                },
              },
              select: {
                publishedAt: true,
                pinterestPin: {
                  include: {
                    dailyMetrics: {
                      where: {
                        metricDate: {
                          gte: evidenceWindowStart,
                          lte: evidenceWindowEnd,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      take: 25,
    }),
    prisma.growthOpportunity.findMany({
      where: { createdAt: { gte: evidenceWindowStart } },
      select: {
        id: true,
        type: true,
        score: true,
        confidence: true,
        clusterId: true,
      },
      orderBy: [{ score: "desc" }, { id: "asc" }],
      take: 100,
    }),
    prisma.growthPinCandidate.findMany({
      where: {
        OR: [
          { status: { in: ["DRAFT", "RENDERING"] } },
          {
            status: "READY",
            publications: {
              none: {
                status: {
                  in: [
                    GrowthPublicationStatus.PUBLISHED,
                    GrowthPublicationStatus.RECONCILED,
                    GrowthPublicationStatus.CANCELLED,
                    GrowthPublicationStatus.FAILED_TERMINAL,
                  ],
                },
              },
            },
          },
        ],
      },
      select: { destinationKind: true, translatorId: true, ideaId: true },
      orderBy: { createdAt: "desc" },
      take: MAX_LEARNING_TARGETS,
    }),
    prisma.growthPinSignal.findMany({
      where: {
        type: "FATIGUE",
        strength: "STRONG",
        createdAt: { gte: evidenceWindowStart },
        pinId: { not: null },
      },
      select: { pinId: true },
      take: MAX_LEARNING_PUBLICATIONS,
    }),
  ]);

  const attributionAvailable = Boolean(settings.attributionEnabled);
  const activeAccountsHealthy = accounts.every(
    (account) => account.connectionStatus === "CONNECTED",
  );
  const freshThrough =
    accounts
      .map((account) => account.analyticsState?.lastSuccessfulSyncAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;
  const analyticsFresh = Boolean(
    freshThrough && now.getTime() - freshThrough.getTime() <= 36 * 60 * 60_000,
  );
  const observations: PerformanceObservation[] = [];
  const publicationByTarget = new Map<string, typeof publications>();
  for (const publication of publications) {
    const targetId =
      publication.candidate.translatorId || publication.candidate.ideaId;
    if (!targetId) continue;
    const key = `${publication.candidate.destinationKind}:${targetId}`;
    publicationByTarget.set(key, [
      ...(publicationByTarget.get(key) || []),
      publication,
    ]);
    const metrics = publication.pinterestPin?.dailyMetrics || [];
    const impressions = sum(metrics, (row) => row.impressions);
    const outboundClicks = sum(metrics, (row) => row.outboundClicks);
    const saves = sum(metrics, (row) => row.saves);
    const conversions = publication.attributionRef?.dailyAggregates.length
      ? sum(
          publication.attributionRef.dailyAggregates,
          (row) => row.qualifiedConversions,
        )
      : null;
    const localParts = publication.publishedAt
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: LEARNING_TIME_ZONE,
          weekday: "short",
          hour: "2-digit",
          hourCycle: "h23",
        }).formatToParts(publication.publishedAt)
      : [];
    const weekday =
      localParts.find((part) => part.type === "weekday")?.value || "UNKNOWN";
    const localHour =
      localParts.find((part) => part.type === "hour")?.value || "UNKNOWN";
    const ageDays = publication.publishedAt
      ? Math.floor(
          (now.getTime() - publication.publishedAt.getTime()) / 86_400_000,
        )
      : 0;
    const ageBucket =
      ageDays < 14 ? "0_13_DAYS" : ageDays < 45 ? "14_44_DAYS" : "45_PLUS_DAYS";
    const dimensions = [
      ["account", publication.account.id],
      ["role", publication.account.publicationRole],
      ["destinationKind", publication.candidate.destinationKind],
      [
        "contentIntent",
        publication.candidate.clusterId || publication.candidate.topic,
      ],
      ["archetype", publication.candidate.archetype],
      ["template", publication.candidate.templateId],
      ["headline", publication.candidate.headlinePattern],
      ["cta", publication.candidate.ctaPattern],
      ["topic", publication.candidate.topic],
      ["weekday", weekday],
      ["localHour", localHour],
      ["publicationAge", ageBucket],
    ];
    for (const [dimension, value] of dimensions)
      observations.push({
        dimension,
        value,
        impressions,
        outboundClicks,
        saves,
        qualifiedConversions: conversions,
      });
  }
  const performanceFindings = comparePerformance(
    observations,
    attributionAvailable,
  );

  const targetRows = [
    ...translators.map((row) => ({
      ...row,
      destinationKind: GrowthCreativeDestinationKind.TRANSLATOR,
      destinationPath: `/translators/${row.slug}`,
    })),
    ...ideas.map((row) => ({
      ...row,
      destinationKind: GrowthCreativeDestinationKind.IDEA,
      destinationPath: `/ideas/${row.slug}`,
    })),
  ];
  const recommendations = targetRows.map((target) => {
    const history =
      publicationByTarget.get(`${target.destinationKind}:${target.id}`) || [];
    const metrics = history.flatMap(
      (row) => row.pinterestPin?.dailyMetrics || [],
    );
    const lastPublishedAt =
      history
        .map((row) => row.publishedAt)
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0] || null;
    const recentActive = history.filter(
      (row) =>
        row.publishedAt &&
        now.getTime() - row.publishedAt.getTime() < 45 * 86_400_000,
    ).length;
    const activeCandidateCount = activeCandidates.filter(
      (candidate) =>
        candidate.destinationKind === target.destinationKind &&
        (candidate.translatorId === target.id ||
          candidate.ideaId === target.id),
    ).length;
    const historyPinIds = new Set(
      history.map((row) => row.pinterestPin?.id).filter(Boolean),
    );
    const conversionRows = history.flatMap(
      (row) => row.attributionRef?.dailyAggregates || [],
    );
    const qualifiedConversions =
      attributionAvailable && conversionRows.length
        ? sum(conversionRows, (row) => row.qualifiedConversions)
        : null;
    const targetAnalyticsFresh = history.length
      ? history.every((row) => row.account.connectionStatus === "CONNECTED") &&
        analyticsFresh
      : analyticsFresh;
    const evidence: EvergreenTargetEvidence = {
      destinationKind: target.destinationKind,
      targetId: target.id,
      destinationPath: target.destinationPath,
      activeAndPublic: true,
      contentUpdatedAt: target.updatedAt,
      observedMetricDays: new Set(
        metrics.map((row) => row.metricDate.toISOString().slice(0, 10)),
      ).size,
      impressions: sum(metrics, (row) => row.impressions),
      outboundClicks: sum(metrics, (row) => row.outboundClicks),
      saves: sum(metrics, (row) => row.saves),
      qualifiedConversions,
      attributionAvailable,
      lastPublishedAt,
      publicationCount: history.length,
      activeEquivalentCount: recentActive,
      activeCandidateCount,
      strongFatigue: fatigueSignals.some(
        (signal) => signal.pinId && historyPinIds.has(signal.pinId),
      ),
      analyticsFresh: targetAnalyticsFresh,
      unresolvedAccountIssue: history.length
        ? history.some((row) => row.account.connectionStatus !== "CONNECTED")
        : !activeAccountsHealthy,
      meaningfulAngleAvailable: true,
      evidenceComplete:
        publications.length < MAX_LEARNING_PUBLICATIONS &&
        activeCandidates.length < MAX_LEARNING_PUBLICATIONS,
      previousArchetypes: [
        ...new Set(history.map((row) => row.candidate.archetype)),
      ],
    };
    const result = evaluateEvergreenTarget(
      evidence,
      now,
      settings.evergreenCooldownDays,
    );
    return { target, evidence, result };
  });

  const scheduleRows = accounts.flatMap((account) => {
    const accountPublications = publications.filter(
      (row) => row.accountId === account.id && row.publishedAt,
    );
    const buckets = new Map<
      number,
      {
        localHour: number;
        samplePins: number;
        impressions: number;
        outboundClicks: number;
        saves: number;
        qualifiedConversions: null;
      }
    >();
    for (const publication of accountPublications) {
      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: LEARNING_TIME_ZONE,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(publication.publishedAt!),
      );
      const bucket = buckets.get(hour) || {
        localHour: hour,
        samplePins: 0,
        impressions: 0,
        outboundClicks: 0,
        saves: 0,
        qualifiedConversions: null,
      };
      const metrics = publication.pinterestPin?.dailyMetrics || [];
      bucket.samplePins += 1;
      bucket.impressions += sum(metrics, (row) => row.impressions);
      bucket.outboundClicks += sum(metrics, (row) => row.outboundClicks);
      bucket.saves += sum(metrics, (row) => row.saves);
      buckets.set(hour, bucket);
    }
    return evaluateLearnedWindows(
      [...buckets.values()],
      attributionAvailable,
    ).map((window) => ({ accountId: account.id, window }));
  });

  const experimentRows = experiments.map((experiment) => {
    const variants = experiment.candidates.reduce<
      Map<
        string,
        {
          key: string;
          publications: number;
          ageDays: number;
          impressions: number;
          outboundClicks: number;
          topPublicationImpressionPercent: number;
          maximumPublicationImpressions: number;
        }
      >
    >((map, candidate) => {
      if (!candidate.experimentVariantKey) return map;
      const metrics = candidate.publications.flatMap(
        (publication) => publication.pinterestPin?.dailyMetrics || [],
      );
      const oldest = candidate.publications
        .map((publication) => publication.publishedAt)
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const row = map.get(candidate.experimentVariantKey) || {
        key: candidate.experimentVariantKey,
        publications: 0,
        ageDays: 0,
        impressions: 0,
        outboundClicks: 0,
        topPublicationImpressionPercent: 0,
        maximumPublicationImpressions: 0,
      };
      row.publications += candidate.publications.length;
      row.ageDays = oldest
        ? Math.floor((now.getTime() - oldest.getTime()) / 86_400_000)
        : 0;
      row.impressions += sum(metrics, (metric) => metric.impressions);
      row.outboundClicks += sum(metrics, (metric) => metric.outboundClicks);
      for (const publication of candidate.publications) {
        row.maximumPublicationImpressions = Math.max(
          row.maximumPublicationImpressions,
          sum(
            publication.pinterestPin?.dailyMetrics || [],
            (metric) => metric.impressions,
          ),
        );
      }
      row.topPublicationImpressionPercent = row.impressions
        ? Math.round(
            (row.maximumPublicationImpressions / row.impressions) * 100,
          )
        : 0;
      map.set(row.key, row);
      return map;
    }, new Map());
    return {
      experimentId: experiment.id,
      variants: [...variants.values()],
      result: evaluateExperiment([...variants.values()]),
    };
  });

  const clusterEvidence = new Map<
    string,
    { publications: number; impressions: number; outboundClicks: number }
  >();
  for (const publication of publications) {
    if (!publication.candidate.clusterId) continue;
    const current = clusterEvidence.get(publication.candidate.clusterId) || {
      publications: 0,
      impressions: 0,
      outboundClicks: 0,
    };
    const metrics = publication.pinterestPin?.dailyMetrics || [];
    current.publications += 1;
    current.impressions += sum(metrics, (row) => row.impressions);
    current.outboundClicks += sum(metrics, (row) => row.outboundClicks);
    clusterEvidence.set(publication.candidate.clusterId, current);
  }
  const adjustedClusters = new Set<string>();
  const opportunityAdjustments = recentOpportunities.map((opportunity) => {
    const evidence = opportunity.clusterId
      ? clusterEvidence.get(opportunity.clusterId)
      : null;
    const qualified = Boolean(
      evidence && evidence.publications >= 2 && evidence.impressions >= 1_000,
    );
    const clusterAlreadyAdjusted = Boolean(
      opportunity.clusterId && adjustedClusters.has(opportunity.clusterId),
    );
    const adjustment =
      qualified && !clusterAlreadyAdjusted && evidence!.outboundClicks >= 20
        ? 5
        : 0;
    if (adjustment && opportunity.clusterId)
      adjustedClusters.add(opportunity.clusterId);
    return {
      opportunityId: opportunity.id,
      originalScore: opportunity.score,
      originalConfidence: opportunity.confidence,
      adjustment,
      adjustedScore: Math.min(100, opportunity.score + adjustment),
      evidence: evidence || null,
      reasonCodes: clusterAlreadyAdjusted
        ? ["DUPLICATE_CLUSTER_FEEDBACK_SUPPRESSED"]
        : qualified
          ? [
              adjustment
                ? "QUALIFIED_HISTORICAL_FEEDBACK"
                : "QUALIFIED_FEEDBACK_NEUTRAL",
            ]
          : ["NO_QUALIFIED_TARGET_FEEDBACK"],
      feedbackModelVersion: OPPORTUNITY_FEEDBACK_VERSION,
    };
  });
  const overallQuality = analyticsFresh
    ? publications.length
      ? GrowthLearningEvidenceQuality.KNOWN
      : GrowthLearningEvidenceQuality.INSUFFICIENT_DATA
    : GrowthLearningEvidenceQuality.STALE;
  const reasonCodes = [
    !analyticsFresh ? "ANALYTICS_STALE" : null,
    !publications.length ? "NO_HISTORICAL_PUBLICATIONS" : null,
    !attributionAvailable ? "ATTRIBUTION_NOT_COLLECTING" : null,
  ].filter((value): value is string => Boolean(value));

  try {
    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.growthLearningRun.create({
        data: {
          analysisDate,
          evidenceWindowStart,
          evidenceWindowEnd,
          learningModelVersion: LEARNING_MODEL_VERSION,
          evergreenModelVersion: EVERGREEN_MODEL_VERSION,
          schedulerModelVersion: LEARNED_SCHEDULER_VERSION,
          experimentModelVersion: EXPERIMENT_LEARNING_VERSION,
          opportunityFeedbackVersion: OPPORTUNITY_FEEDBACK_VERSION,
          evidenceQuality: overallQuality,
          attributionAvailability: attributionAvailable
            ? "AVAILABLE"
            : "NOT_COLLECTING",
          targetsConsidered: targetRows.length,
          recommendationsProduced: recommendations.length,
          reasonCodes,
          performanceFindings: performanceFindings as Prisma.InputJsonValue,
          opportunityAdjustments:
            opportunityAdjustments as Prisma.InputJsonValue,
          summary: `Evaluated ${targetRows.length} public destinations and ${publications.length} historical publications; produced ${recommendations.length} advisory recommendations.`,
          jobId: input.jobId || null,
        },
      });
      for (const row of recommendations)
        await tx.growthEvergreenRecommendationRecord.create({
          data: {
            learningRunId: created.id,
            destinationKind: row.target.destinationKind,
            translatorId:
              row.target.destinationKind ===
              GrowthCreativeDestinationKind.TRANSLATOR
                ? row.target.id
                : null,
            ideaId:
              row.target.destinationKind === GrowthCreativeDestinationKind.IDEA
                ? row.target.id
                : null,
            recommendation: row.result.recommendation,
            confidence: row.result.confidence,
            evidenceQuality: row.result.evidenceQuality,
            reasonCodes: row.result.reasonCodes,
            evidence: {
              destinationPath: row.evidence.destinationPath,
              observedMetricDays: row.evidence.observedMetricDays,
              impressions: row.evidence.impressions,
              outboundClicks: row.evidence.outboundClicks,
              saves: row.evidence.saves,
              qualifiedConversions: row.evidence.qualifiedConversions,
              attributionAvailable: row.evidence.attributionAvailable,
              publicationCount: row.evidence.publicationCount,
              activeEquivalentCount: row.evidence.activeEquivalentCount,
              activeCandidateCount: row.evidence.activeCandidateCount,
              analyticsFresh: row.evidence.analyticsFresh,
            } as Prisma.InputJsonValue,
            proposedArchetype: row.result.proposedArchetype,
            proposedAngle: row.result.proposedAngle,
            cooldownUntil: row.result.cooldownUntil,
            evidenceFreshThrough: freshThrough,
          },
        });
      for (const row of scheduleRows)
        await tx.growthLearnedScheduleWindow.create({
          data: {
            learningRunId: created.id,
            accountId: row.accountId,
            localHour: row.window.localHour,
            timeZone: row.window.timeZone,
            mode: row.window.mode,
            confidence: row.window.confidence,
            samplePins: row.window.samplePins,
            impressions: BigInt(row.window.impressions),
            outboundClicks: BigInt(row.window.outboundClicks),
            saves: BigInt(row.window.saves),
            qualifiedConversions: row.window.qualifiedConversions,
            evidenceQuality: row.window.evidenceQuality,
            reasonCodes: row.window.reasonCodes,
            evidence: {
              outboundRate: row.window.outboundRate,
              conversionRate: row.window.conversionRate,
            },
          },
        });
      for (const row of experimentRows)
        await tx.growthExperimentLearningEvaluation.create({
          data: {
            learningRunId: created.id,
            experimentId: row.experimentId,
            outcome: row.result.outcome,
            confidence: row.result.confidence,
            evidenceQuality: row.result.evidenceQuality,
            reasonCodes: row.result.reasonCodes,
            evidence: {
              variants: row.variants,
              winnerKey: row.result.winnerKey,
            },
          },
        });
      await recordGrowthActivity(
        {
          actorKind: GrowthActivityActorKind.WORKER,
          entityType: "GrowthLearningRun",
          entityId: created.id,
          action: "EVERGREEN_LEARNING_ANALYZED",
          toState: overallQuality,
          summary: {
            targetsConsidered: targetRows.length,
            publicationsConsidered: publications.length,
            recommendationsProduced: recommendations.length,
            modelVersion: LEARNING_MODEL_VERSION,
          },
          correlationKey: `evergreen-learning:${dateKey(analysisDate)}`,
        },
        tx,
      );
      return created;
    });
    return {
      run: await prisma.growthLearningRun.findUniqueOrThrow({
        where: { id: run.id },
        include: {
          recommendations: true,
          scheduleWindows: true,
          experimentEvaluations: true,
        },
      }),
      reused: false,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        run: await prisma.growthLearningRun.findUniqueOrThrow({
          where: {
            analysisDate_learningModelVersion: {
              analysisDate,
              learningModelVersion: LEARNING_MODEL_VERSION,
            },
          },
          include: {
            recommendations: true,
            scheduleWindows: true,
            experimentEvaluations: true,
          },
        }),
        reused: true,
      };
    }
    throw error;
  }
}

export async function prepareEvergreenRecommendation(
  input: unknown,
  actorUserId: string,
) {
  const parsed = prepareEvergreenRecommendationSchema.parse(input);
  const recommendation =
    await prisma.growthEvergreenRecommendationRecord.findUnique({
      where: { id: parsed.recommendationId },
      include: { learningRun: true },
    });
  if (
    !recommendation ||
    recommendation.recommendation !== GrowthEvergreenRecommendation.REVIVE ||
    recommendation.status !== GrowthEvergreenRecommendationStatus.PROPOSED ||
    !recommendation.proposedArchetype
  )
    throw new Error("Only a current REVIVE proposal can be prepared.");
  if (
    Date.now() - recommendation.learningRun.completedAt.getTime() >
    48 * 60 * 60_000
  )
    throw new Error(
      "The recommendation is stale; run learning analysis again.",
    );
  const targetId = recommendation.translatorId || recommendation.ideaId;
  if (!targetId) throw new Error("The recommendation target is unavailable.");
  const result = await enqueueCreativeGeneration({
    targetKind: recommendation.destinationKind,
    targetId,
    archetype: recommendation.proposedArchetype,
    creativeModelVersion: "creative_lab_v1",
    ...(recommendation.proposedArchetype === "BEFORE_AFTER"
      ? { useAiExample: true }
      : {}),
  });
  await prisma.$transaction(async (tx) => {
    await tx.growthEvergreenRecommendationRecord.updateMany({
      where: {
        id: recommendation.id,
        status: GrowthEvergreenRecommendationStatus.PROPOSED,
      },
      data: { status: GrowthEvergreenRecommendationStatus.PREPARED },
    });
    await recordGrowthActivity(
      {
        actorKind: GrowthActivityActorKind.USER,
        actorUserId,
        entityType: "GrowthEvergreenRecommendation",
        entityId: recommendation.id,
        action: "EVERGREEN_CREATIVE_PREPARATION_REQUESTED",
        fromState: GrowthEvergreenRecommendationStatus.PROPOSED,
        toState: GrowthEvergreenRecommendationStatus.PREPARED,
        summary: {
          jobId: result.job.id,
          targetKind: recommendation.destinationKind,
          modelVersion: recommendation.learningRun.evergreenModelVersion,
        },
        correlationKey: result.job.idempotencyKey,
      },
      tx,
    );
  });
  return result;
}

export async function transitionLearningExperiment(
  input: unknown,
  actorUserId: string,
) {
  const parsed = learningExperimentActionSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT "id" FROM "GrowthExperiment" WHERE "id" = ${parsed.experimentId} FOR UPDATE`,
    );
    const experiment = await tx.growthExperiment.findUnique({
      where: { id: parsed.experimentId },
      include: {
        candidates: {
          select: {
            status: true,
            experimentVariantKey: true,
            contentHash: true,
            archetype: true,
            templateId: true,
            visualTreatment: true,
          },
        },
        learningEvaluations: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!experiment) throw new Error("Experiment is unavailable.");
    let toStatus: GrowthExperimentStatus;
    let result: Prisma.InputJsonValue | undefined;
    if (parsed.action === "START") {
      if (experiment.status !== GrowthExperimentStatus.DRAFT)
        throw new Error("Only a DRAFT experiment can start.");
      const variants = experimentVariantsSchema.parse(experiment.variants);
      const readyCandidates = experiment.candidates.filter(
        (candidate) => candidate.status === "READY",
      );
      const covered = new Set(
        readyCandidates
          .map((candidate) => candidate.experimentVariantKey)
          .filter(Boolean),
      );
      if (variants.some((variant) => !covered.has(variant.key)))
        throw new Error(
          "Every experiment variant requires a READY candidate before start.",
        );
      const signatures = new Set(
        readyCandidates.map(
          (candidate) =>
            `${candidate.contentHash}:${candidate.archetype}:${candidate.templateId}:${candidate.visualTreatment}`,
        ),
      );
      if (signatures.size < variants.length)
        throw new Error(
          "Experiment variants must be materially different, not cosmetic duplicates.",
        );
      toStatus = GrowthExperimentStatus.RUNNING;
    } else if (parsed.action === "PAUSE") {
      if (experiment.status !== GrowthExperimentStatus.RUNNING)
        throw new Error("Only a RUNNING experiment can pause.");
      toStatus = GrowthExperimentStatus.PAUSED;
    } else if (parsed.action === "RESUME") {
      if (experiment.status !== GrowthExperimentStatus.PAUSED)
        throw new Error("Only a PAUSED experiment can resume.");
      toStatus = GrowthExperimentStatus.RUNNING;
    } else if (parsed.action === "REQUEST_ANALYSIS") {
      if (
        experiment.status !== GrowthExperimentStatus.RUNNING &&
        experiment.status !== GrowthExperimentStatus.PAUSED
      )
        throw new Error(
          "Only a running or paused experiment can request analysis.",
        );
      toStatus = GrowthExperimentStatus.ANALYZING;
    } else {
      if (experiment.status !== GrowthExperimentStatus.ANALYZING)
        throw new Error("Only an ANALYZING experiment can finalize.");
      const evaluation = experiment.learningEvaluations[0];
      if (
        !evaluation ||
        evaluation.createdAt < experiment.updatedAt ||
        (evaluation.outcome !== GrowthExperimentStatus.COMPLETED &&
          evaluation.outcome !== GrowthExperimentStatus.INCONCLUSIVE)
      )
        throw new Error(
          "A retained learning evaluation is required before finalization.",
        );
      toStatus = evaluation.outcome;
      result = {
        evaluationId: evaluation.id,
        confidence: evaluation.confidence,
        evidenceQuality: evaluation.evidenceQuality,
        reasonCodes: evaluation.reasonCodes,
        evidence: evaluation.evidence,
      } as Prisma.InputJsonValue;
    }
    const updated = await tx.growthExperiment.update({
      where: { id: experiment.id },
      data: {
        status: toStatus,
        ...(parsed.action === "START" ? { startedAt: new Date() } : {}),
        ...(parsed.action === "FINALIZE"
          ? { endedAt: new Date(), result }
          : {}),
      },
    });
    await recordGrowthActivity(
      {
        actorKind: GrowthActivityActorKind.USER,
        actorUserId,
        entityType: "GrowthExperiment",
        entityId: experiment.id,
        action: `EXPERIMENT_${parsed.action}`,
        fromState: experiment.status,
        toState: toStatus,
        summary: { experimentModelVersion: experiment.experimentModelVersion },
        correlationKey: `experiment:${experiment.id}`,
      },
      tx,
    );
    return updated;
  });
}

export async function getLearningOverview() {
  const [run, experiments] = await Promise.all([
    prisma.growthLearningRun.findFirst({
      orderBy: [{ analysisDate: "desc" }, { completedAt: "desc" }],
      include: {
        recommendations: {
          include: {
            translator: { select: { name: true, slug: true } },
            idea: { include: { currentVersion: { select: { title: true } } } },
          },
          orderBy: [{ recommendation: "asc" }, { confidence: "desc" }],
          take: 100,
        },
        scheduleWindows: {
          include: {
            account: { select: { username: true, publicationRole: true } },
          },
          orderBy: [{ accountId: "asc" }, { confidence: "desc" }],
        },
        experimentEvaluations: {
          include: {
            experiment: {
              select: { hypothesis: true, dimension: true, status: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 25,
        },
      },
    }),
    prisma.growthExperiment.findMany({
      where: {
        status: { in: ["DRAFT", "RUNNING", "PAUSED", "ANALYZING"] },
      },
      select: {
        id: true,
        hypothesis: true,
        status: true,
        dimension: true,
        candidates: {
          select: { experimentVariantKey: true, status: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 25,
    }),
  ]);
  return { run, experiments };
}
