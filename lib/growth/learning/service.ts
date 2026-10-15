import {
  GrowthActivityActorKind,
  GrowthCreativeDestinationKind,
  GrowthEvergreenRecommendation,
  GrowthEvergreenRecommendationStatus,
  GrowthExperimentStatus,
  GrowthJobStatus,
  GrowthJobType,
  GrowthLearningEvidenceQuality,
  GrowthPublicationStatus,
  Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { enqueueCreativeGeneration } from "@/lib/growth/creative/candidates";
import {
  experimentGuardrailsSchema,
  experimentVariantsSchema,
} from "@/lib/growth/creative/contracts";
import { isAttributionEnvironmentEnabled } from "@/lib/growth/attribution/config";
import {
  EVERGREEN_MODEL_VERSION,
  EXPERIMENT_LEARNING_VERSION,
  LEARNED_SCHEDULER_VERSION,
  LEARNING_MODEL_VERSION,
  LEARNING_TIME_ZONE,
  LEARNING_WINDOW_DAYS,
  ANALYTICS_FRESHNESS_HOURS,
  MAX_LEARNING_ACCOUNTS,
  MAX_LEARNING_ACTIVE_CANDIDATES,
  MAX_LEARNING_EXPERIMENTS,
  MAX_LEARNING_FATIGUE_SIGNALS,
  MAX_LEARNING_OPPORTUNITIES,
  MAX_LEARNING_PIN_EVIDENCE,
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
  deduplicatePinterestEvidence,
  matchLegacyPinToTranslator,
  potentialLegacyTranslatorSlug,
  selectBoundedPinterestEvidence,
  selectFinalizedMetricEvidence,
} from "@/lib/growth/learning/legacy-evidence";
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
export function learningEvidenceWindow(analysisDate: Date) {
  const endExclusive = utcDay(analysisDate);
  return {
    start: new Date(endExclusive.getTime() - LEARNING_WINDOW_DAYS * 86_400_000),
    endExclusive,
  };
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
  const { start: evidenceWindowStart, endExclusive: evidenceWindowEnd } =
    learningEvidenceWindow(analysisDate);
  const finalizedMetricEvidence = (
    rows: Parameters<typeof selectFinalizedMetricEvidence>[0],
    publishedAt: Date | null,
  ) =>
    selectFinalizedMetricEvidence(rows, {
      windowStart: evidenceWindowStart,
      windowEndExclusive: evidenceWindowEnd,
      publishedAt,
    });
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
    translatorRows,
    ideaRows,
    publicationRows,
    accountRows,
    experimentRowsRaw,
    opportunityRows,
    activeCandidateRows,
    fatigueSignalRows,
    legacyPinRowsRaw,
    recentPublicationRowsRaw,
  ] = await Promise.all([
    prisma.translator.findMany({
      where: { isActive: true, archivedAt: null },
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: MAX_LEARNING_TARGETS + 1,
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
      take: MAX_LEARNING_TARGETS + 1,
    }),
    prisma.growthPinPublication.findMany({
      where: {
        status: {
          in: [
            GrowthPublicationStatus.PUBLISHED,
            GrowthPublicationStatus.RECONCILED,
          ],
        },
        publishedAt: { lt: evidenceWindowEnd },
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
                  lt: evidenceWindowEnd,
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
                  lt: evidenceWindowEnd,
                },
              },
              select: { qualifiedConversions: true },
            },
          },
        },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: MAX_LEARNING_PUBLICATIONS + 1,
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
      orderBy: { id: "asc" },
      take: MAX_LEARNING_ACCOUNTS + 1,
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
        primaryKpi: true,
        guardrails: true,
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
                accountId: true,
                pinterestPin: {
                  include: {
                    dailyMetrics: {
                      where: {
                        metricDate: {
                          gte: evidenceWindowStart,
                          lt: evidenceWindowEnd,
                        },
                      },
                    },
                  },
                },
                attributionRef: {
                  include: {
                    dailyAggregates: {
                      where: {
                        metricDate: {
                          gte: evidenceWindowStart,
                          lt: evidenceWindowEnd,
                        },
                      },
                      select: { qualifiedConversions: true },
                    },
                  },
                },
              },
              orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
              take: MAX_LEARNING_PUBLICATIONS + 1,
            },
          },
        },
      },
      orderBy: { id: "asc" },
      take: MAX_LEARNING_EXPERIMENTS + 1,
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
      take: MAX_LEARNING_OPPORTUNITIES + 1,
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
      take: MAX_LEARNING_ACTIVE_CANDIDATES + 1,
    }),
    prisma.growthPinSignal.findMany({
      where: {
        type: "FATIGUE",
        strength: "STRONG",
        createdAt: { gte: evidenceWindowStart },
        pinId: { not: null },
      },
      select: { pinId: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_LEARNING_FATIGUE_SIGNALS + 1,
    }),
    prisma.growthPinterestPin.findMany({
      where: {
        isActive: true,
        analyticsEligible: true,
        destinationUrl: { not: null },
      },
      select: {
        id: true,
        pinterestPinId: true,
        accountId: true,
        destinationUrl: true,
        publishedAt: true,
        account: {
          select: { id: true, publicationRole: true, connectionStatus: true },
        },
        dailyMetrics: {
          where: {
            metricDate: { gte: evidenceWindowStart, lt: evidenceWindowEnd },
          },
          orderBy: { metricDate: "asc" },
          take: LEARNING_WINDOW_DAYS,
        },
      },
      orderBy: { pinterestPinId: "asc" },
      take: MAX_LEARNING_PIN_EVIDENCE + 1,
    }),
    prisma.growthPinPublication.findMany({
      where: {
        status: {
          in: [
            GrowthPublicationStatus.PUBLISHED,
            GrowthPublicationStatus.RECONCILED,
          ],
        },
        publishedAt: { gte: evidenceWindowEnd },
      },
      select: {
        id: true,
        pinterestPinId: true,
        accountId: true,
        publishedAt: true,
        candidate: {
          select: {
            destinationKind: true,
            translatorId: true,
            ideaId: true,
          },
        },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: MAX_LEARNING_PUBLICATIONS + 1,
    }),
  ]);

  const selectionReasonCodes: string[] = [];
  const legacyEvidenceReasonCodes: string[] = [];
  if (translatorRows.length > MAX_LEARNING_TARGETS)
    selectionReasonCodes.push("TRANSLATOR_CAP_EXHAUSTED");
  if (ideaRows.length > MAX_LEARNING_TARGETS)
    selectionReasonCodes.push("IDEA_CAP_EXHAUSTED");
  if (publicationRows.length > MAX_LEARNING_PUBLICATIONS)
    selectionReasonCodes.push("PUBLICATION_CAP_EXHAUSTED");
  if (activeCandidateRows.length > MAX_LEARNING_ACTIVE_CANDIDATES)
    selectionReasonCodes.push("ACTIVE_CANDIDATE_CAP_EXHAUSTED");
  if (accountRows.length > MAX_LEARNING_ACCOUNTS)
    selectionReasonCodes.push("ACCOUNT_CAP_EXHAUSTED");
  if (experimentRowsRaw.length > MAX_LEARNING_EXPERIMENTS)
    selectionReasonCodes.push("EXPERIMENT_CAP_EXHAUSTED");
  if (opportunityRows.length > MAX_LEARNING_OPPORTUNITIES)
    selectionReasonCodes.push("OPPORTUNITY_CAP_EXHAUSTED");
  if (fatigueSignalRows.length > MAX_LEARNING_FATIGUE_SIGNALS)
    selectionReasonCodes.push("FATIGUE_SIGNAL_CAP_EXHAUSTED");
  const boundedPinRows = selectBoundedPinterestEvidence(
    legacyPinRowsRaw,
    MAX_LEARNING_PIN_EVIDENCE,
  );
  if (boundedPinRows.capExhausted)
    selectionReasonCodes.push("PIN_EVIDENCE_CAP_EXHAUSTED");
  if (recentPublicationRowsRaw.length > MAX_LEARNING_PUBLICATIONS)
    selectionReasonCodes.push("RECENT_PUBLICATION_CAP_EXHAUSTED");
  const translators = translatorRows.slice(0, MAX_LEARNING_TARGETS);
  const ideas = ideaRows.slice(0, MAX_LEARNING_TARGETS);
  const publications = publicationRows.slice(0, MAX_LEARNING_PUBLICATIONS);
  const activeCandidates = activeCandidateRows.slice(
    0,
    MAX_LEARNING_ACTIVE_CANDIDATES,
  );
  const accounts = accountRows.slice(0, MAX_LEARNING_ACCOUNTS);
  const experiments = experimentRowsRaw.slice(0, MAX_LEARNING_EXPERIMENTS);
  const recentOpportunities = opportunityRows.slice(
    0,
    MAX_LEARNING_OPPORTUNITIES,
  );
  const fatigueSignals = fatigueSignalRows.slice(
    0,
    MAX_LEARNING_FATIGUE_SIGNALS,
  );
  const selectedPinRows = boundedPinRows.selected;
  const recentPublicationRows = recentPublicationRowsRaw.slice(
    0,
    MAX_LEARNING_PUBLICATIONS,
  );
  const recentPublicationByTarget = new Map<
    string,
    typeof recentPublicationRows
  >();
  for (const publication of recentPublicationRows) {
    const targetId =
      publication.candidate.translatorId || publication.candidate.ideaId;
    if (!targetId) continue;
    const key = `${publication.candidate.destinationKind}:${targetId}`;
    recentPublicationByTarget.set(key, [
      ...(recentPublicationByTarget.get(key) || []),
      publication,
    ]);
  }
  const matchedPinRows = selectedPinRows.flatMap((pin) => {
    const match = matchLegacyPinToTranslator(pin.destinationUrl, translators);
    return match ? [{ ...pin, match }] : [];
  });
  const rejectedPinCount = selectedPinRows.length - matchedPinRows.length;
  if (rejectedPinCount)
    legacyEvidenceReasonCodes.push("LEGACY_PIN_URL_REJECTED");
  const managedPinterestIds = [
    ...publications.flatMap((row) =>
      row.pinterestPinId ? [row.pinterestPinId] : [],
    ),
    ...recentPublicationRows.flatMap((row) =>
      row.pinterestPinId ? [row.pinterestPinId] : [],
    ),
  ];
  const deduplicatedPinRows = deduplicatePinterestEvidence(
    managedPinterestIds.map((pinterestPinId) => ({ pinterestPinId })),
    matchedPinRows,
  ).legacy;
  const incompletePinMetrics = deduplicatedPinRows.some(
    (pin) =>
      (!pin.publishedAt || pin.publishedAt < evidenceWindowEnd) &&
      !finalizedMetricEvidence(pin.dailyMetrics, pin.publishedAt)
        .evidenceComplete,
  );
  if (incompletePinMetrics)
    legacyEvidenceReasonCodes.push("PIN_METRICS_INCOMPLETE");
  const incompleteManagedMetrics = publications.some(
    (publication) =>
      !finalizedMetricEvidence(
        publication.pinterestPin?.dailyMetrics || [],
        publication.publishedAt,
      ).evidenceComplete,
  );
  if (incompleteManagedMetrics)
    legacyEvidenceReasonCodes.push("MANAGED_PIN_METRICS_INCOMPLETE");
  const evidenceComplete = selectionReasonCodes.length === 0;

  const attributionAvailable =
    isAttributionEnvironmentEnabled() && Boolean(settings.attributionEnabled);
  const freshnessCutoff = new Date(
    now.getTime() - ANALYTICS_FRESHNESS_HOURS * 60 * 60_000,
  );
  const accountEvidence = new Map(
    accounts.map((account) => {
      const state = account.analyticsState;
      const available = Boolean(
        account.connectionStatus === "CONNECTED" &&
        state?.status === "FRESH" &&
        state.lastSuccessfulSyncAt &&
        state.lastSuccessfulSyncAt >= freshnessCutoff,
      );
      return [
        account.id,
        { available, freshThrough: state?.lastSuccessfulSyncAt || null },
      ] as const;
    }),
  );
  const activeAccountsHealthy = accounts.every(
    (account) => accountEvidence.get(account.id)?.available,
  );
  const freshThrough =
    accounts
      .map((account) =>
        accountEvidence.get(account.id)?.available
          ? account.analyticsState?.lastSuccessfulSyncAt
          : null,
      )
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime())[0] || null;
  const analyticsFresh = accounts.length > 0 && activeAccountsHealthy;
  const observations: PerformanceObservation[] = [];
  const publicationByTarget = new Map<string, typeof publications>();
  const legacyByTarget = new Map<string, typeof deduplicatedPinRows>();
  for (const publication of publications) {
    const targetId =
      publication.candidate.translatorId || publication.candidate.ideaId;
    if (!targetId) continue;
    const key = `${publication.candidate.destinationKind}:${targetId}`;
    publicationByTarget.set(key, [
      ...(publicationByTarget.get(key) || []),
      publication,
    ]);
    const accountFresh = Boolean(
      accountEvidence.get(publication.account.id)?.available,
    );
    const metrics = accountFresh
      ? finalizedMetricEvidence(
          publication.pinterestPin?.dailyMetrics || [],
          publication.publishedAt,
        ).ready
      : [];
    const impressions = sum(metrics, (row) => row.impressions);
    const outboundClicks = sum(metrics, (row) => row.outboundClicks);
    const saves = sum(metrics, (row) => row.saves);
    const conversions =
      accountFresh && publication.attributionRef?.dailyAggregates.length
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
    if (!accountFresh || !metrics.length) continue;
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
  for (const pin of deduplicatedPinRows) {
    const key = `${GrowthCreativeDestinationKind.TRANSLATOR}:${pin.match.translatorId}`;
    legacyByTarget.set(key, [...(legacyByTarget.get(key) || []), pin]);
    if (pin.publishedAt && pin.publishedAt >= evidenceWindowEnd) continue;
    if (!accountEvidence.get(pin.accountId)?.available) continue;
    const metricEvidence = finalizedMetricEvidence(
      pin.dailyMetrics,
      pin.publishedAt,
    );
    const metrics = metricEvidence.ready;
    if (!metrics.length) continue;
    const impressions = sum(metrics, (row) => row.impressions);
    const outboundClicks = sum(metrics, (row) => row.outboundClicks);
    const saves = sum(metrics, (row) => row.saves);
    const dimensions: Array<[string, string | null]> = [
      ["account", pin.accountId],
      ["role", pin.account.publicationRole],
      ["destinationKind", GrowthCreativeDestinationKind.TRANSLATOR],
    ];
    if (pin.publishedAt) {
      const localParts = new Intl.DateTimeFormat("en-US", {
        timeZone: LEARNING_TIME_ZONE,
        weekday: "short",
        hour: "2-digit",
        hourCycle: "h23",
      }).formatToParts(pin.publishedAt);
      dimensions.push(
        [
          "weekday",
          localParts.find((part) => part.type === "weekday")?.value || null,
        ],
        [
          "localHour",
          localParts.find((part) => part.type === "hour")?.value || null,
        ],
      );
    }
    for (const [dimension, value] of dimensions)
      if (value)
        observations.push({
          dimension,
          value,
          impressions,
          outboundClicks,
          saves,
          qualifiedConversions: null,
        });
  }
  const performanceFindings = comparePerformance(observations, {
    attributionAvailable,
    evidenceComplete:
      evidenceComplete &&
      analyticsFresh &&
      !incompletePinMetrics &&
      !incompleteManagedMetrics,
    incompletenessReasonCodes: [
      ...selectionReasonCodes,
      ...legacyEvidenceReasonCodes,
      ...(!analyticsFresh ? ["ACCOUNT_ANALYTICS_UNAVAILABLE"] : []),
    ],
  });

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
    const targetKey = `${target.destinationKind}:${target.id}`;
    const history = publicationByTarget.get(targetKey) || [];
    const legacyHistory = legacyByTarget.get(targetKey) || [];
    const recentHistory = recentPublicationByTarget.get(targetKey) || [];
    const legacyEvidenceHistory = legacyHistory.filter(
      (row) => !row.publishedAt || row.publishedAt < evidenceWindowEnd,
    );
    const freshHistory = history.filter(
      (row) => accountEvidence.get(row.accountId)?.available,
    );
    const freshLegacyHistory = legacyEvidenceHistory.filter(
      (row) => accountEvidence.get(row.accountId)?.available,
    );
    const managedMetricEvidence = freshHistory.map((row) =>
      finalizedMetricEvidence(
        row.pinterestPin?.dailyMetrics || [],
        row.publishedAt,
      ),
    );
    const legacyMetricEvidence = freshLegacyHistory.map((row) =>
      finalizedMetricEvidence(row.dailyMetrics, row.publishedAt),
    );
    const metrics = [
      ...managedMetricEvidence.flatMap((row) => row.ready),
      ...legacyMetricEvidence.flatMap((row) => row.ready),
    ];
    const lastPublishedAt =
      [
        ...history.map((row) => row.publishedAt),
        ...legacyHistory.map((row) => row.publishedAt),
        ...recentHistory.map((row) => row.publishedAt),
      ]
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0] || null;
    const recentActive = [
      ...history.map((row) => row.publishedAt),
      ...legacyHistory.map((row) => row.publishedAt),
      ...recentHistory.map((row) => row.publishedAt),
    ].filter(
      (publishedAt) =>
        publishedAt &&
        now.getTime() - publishedAt.getTime() <
          settings.evergreenCooldownDays * 86_400_000,
    ).length;
    const activeCandidateCount = activeCandidates.filter(
      (candidate) =>
        candidate.destinationKind === target.destinationKind &&
        (candidate.translatorId === target.id ||
          candidate.ideaId === target.id),
    ).length;
    const historyPinIds = new Set(
      [
        ...history.map((row) => row.pinterestPin?.id),
        ...legacyHistory.map((row) => row.id),
      ].filter(Boolean),
    );
    const conversionRows = freshHistory.flatMap(
      (row) => row.attributionRef?.dailyAggregates || [],
    );
    const conversionEvidenceComplete =
      freshLegacyHistory.length === 0 &&
      freshHistory.length > 0 &&
      freshHistory.every(
        (row) => (row.attributionRef?.dailyAggregates.length || 0) > 0,
      );
    const qualifiedConversions =
      attributionAvailable && conversionEvidenceComplete
        ? sum(conversionRows, (row) => row.qualifiedConversions)
        : null;
    const allAccountIds = [
      ...history.map((row) => row.accountId),
      ...legacyHistory.map((row) => row.accountId),
    ];
    const targetAnalyticsFresh = allAccountIds.length
      ? allAccountIds.every((id) => accountEvidence.get(id)?.available)
      : analyticsFresh;
    const targetMetricsComplete = [
      ...managedMetricEvidence,
      ...legacyMetricEvidence,
    ].every((row) => row.evidenceComplete);
    const targetEvidenceReasonCodes = [
      ...selectionReasonCodes,
      ...managedMetricEvidence.flatMap((row) => row.reasonCodes),
      ...legacyMetricEvidence.flatMap((row) => row.reasonCodes),
    ];
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
      publicationCount: history.length + legacyEvidenceHistory.length,
      activeEquivalentCount: recentActive,
      activeCandidateCount,
      strongFatigue: fatigueSignals.some(
        (signal) => signal.pinId && historyPinIds.has(signal.pinId),
      ),
      analyticsFresh: targetAnalyticsFresh,
      unresolvedAccountIssue:
        history.length || legacyHistory.length
          ? history.some(
              (row) => row.account.connectionStatus !== "CONNECTED",
            ) ||
            legacyHistory.some(
              (row) => row.account.connectionStatus !== "CONNECTED",
            )
          : !activeAccountsHealthy,
      meaningfulAngleAvailable:
        legacyEvidenceHistory.length === 0 || history.length > 0,
      evidenceComplete:
        evidenceComplete && targetAnalyticsFresh && targetMetricsComplete,
      evidenceReasonCodes: [...new Set(targetEvidenceReasonCodes)],
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
    const accountFresh = Boolean(accountEvidence.get(account.id)?.available);
    const accountPublications = publications.filter(
      (row) => accountFresh && row.accountId === account.id && row.publishedAt,
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
      const metrics = finalizedMetricEvidence(
        publication.pinterestPin?.dailyMetrics || [],
        publication.publishedAt,
      ).ready;
      bucket.samplePins += 1;
      bucket.impressions += sum(metrics, (row) => row.impressions);
      bucket.outboundClicks += sum(metrics, (row) => row.outboundClicks);
      bucket.saves += sum(metrics, (row) => row.saves);
      buckets.set(hour, bucket);
    }
    const accountLegacyPins = deduplicatedPinRows.filter(
      (pin) =>
        accountFresh &&
        pin.accountId === account.id &&
        pin.publishedAt &&
        pin.publishedAt < evidenceWindowEnd,
    );
    for (const pin of accountLegacyPins) {
      const metricEvidence = finalizedMetricEvidence(
        pin.dailyMetrics,
        pin.publishedAt,
      );
      if (!metricEvidence.ready.length) continue;
      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: LEARNING_TIME_ZONE,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(pin.publishedAt!),
      );
      const bucket = buckets.get(hour) || {
        localHour: hour,
        samplePins: 0,
        impressions: 0,
        outboundClicks: 0,
        saves: 0,
        qualifiedConversions: null,
      };
      bucket.samplePins += 1;
      bucket.impressions += sum(metricEvidence.ready, (row) => row.impressions);
      bucket.outboundClicks += sum(
        metricEvidence.ready,
        (row) => row.outboundClicks,
      );
      bucket.saves += sum(metricEvidence.ready, (row) => row.saves);
      buckets.set(hour, bucket);
    }
    const accountMetricsComplete =
      accountPublications.every(
        (publication) =>
          finalizedMetricEvidence(
            publication.pinterestPin?.dailyMetrics || [],
            publication.publishedAt,
          ).evidenceComplete,
      ) &&
      accountLegacyPins.every(
        (pin) =>
          finalizedMetricEvidence(pin.dailyMetrics, pin.publishedAt)
            .evidenceComplete,
      );
    return evaluateLearnedWindows(
      [...buckets.values()],
      attributionAvailable,
      accountFresh && evidenceComplete && accountMetricsComplete,
    ).map((window) => ({ accountId: account.id, window }));
  });

  const experimentRows = experiments.map((experiment) => {
    let experimentEvidenceComplete = evidenceComplete && analyticsFresh;
    const configuredVariants = experimentVariantsSchema.parse(
      experiment.variants,
    );
    const variants = new Map(
      configuredVariants.map((variant) => [
        variant.key,
        {
          key: variant.key,
          publications: 0,
          ageDays: 0,
          impressions: 0,
          outboundClicks: 0,
          saves: 0,
          qualifiedConversions: attributionAvailable ? 0 : null,
          topPublicationImpressionPercent: 0,
          maximumPublicationImpressions: 0,
          latestPublishedAt: null as Date | null,
          conversionEvidenceComplete: attributionAvailable,
        },
      ]),
    );
    for (const candidate of experiment.candidates) {
      if (!candidate.experimentVariantKey) continue;
      const row = variants.get(candidate.experimentVariantKey);
      if (!row) continue;
      if (candidate.publications.length > MAX_LEARNING_PUBLICATIONS)
        experimentEvidenceComplete = false;
      for (const publication of candidate.publications.slice(
        0,
        MAX_LEARNING_PUBLICATIONS,
      )) {
        if (!accountEvidence.get(publication.accountId)?.available) {
          row.conversionEvidenceComplete = false;
          continue;
        }
        const metricEvidence = finalizedMetricEvidence(
          publication.pinterestPin?.dailyMetrics || [],
          publication.publishedAt,
        );
        if (!metricEvidence.evidenceComplete)
          experimentEvidenceComplete = false;
        const metrics = metricEvidence.ready;
        const publicationImpressions = sum(
          metrics,
          (metric) => metric.impressions,
        );
        row.publications += 1;
        row.impressions += publicationImpressions;
        row.outboundClicks += sum(metrics, (metric) => metric.outboundClicks);
        row.saves += sum(metrics, (metric) => metric.saves);
        row.maximumPublicationImpressions = Math.max(
          row.maximumPublicationImpressions,
          publicationImpressions,
        );
        if (
          publication.publishedAt &&
          (!row.latestPublishedAt ||
            publication.publishedAt > row.latestPublishedAt)
        )
          row.latestPublishedAt = publication.publishedAt;
        const conversionRows =
          publication.attributionRef?.dailyAggregates || [];
        if (attributionAvailable && conversionRows.length)
          row.qualifiedConversions =
            (row.qualifiedConversions || 0) +
            sum(conversionRows, (metric) => metric.qualifiedConversions);
        else if (attributionAvailable) row.conversionEvidenceComplete = false;
      }
    }
    const variantEvidence = [...variants.values()].map((row) => ({
      key: row.key,
      publications: row.publications,
      ageDays: row.latestPublishedAt
        ? Math.floor(
            (now.getTime() - row.latestPublishedAt.getTime()) / 86_400_000,
          )
        : 0,
      impressions: row.impressions,
      outboundClicks: row.outboundClicks,
      saves: row.saves,
      qualifiedConversions: row.conversionEvidenceComplete
        ? row.qualifiedConversions
        : null,
      topPublicationImpressionPercent: row.impressions
        ? Math.round(
            (row.maximumPublicationImpressions / row.impressions) * 100,
          )
        : 0,
    }));
    const guardrails = experimentGuardrailsSchema.parse(experiment.guardrails);
    return {
      experimentId: experiment.id,
      variants: variantEvidence,
      result: evaluateExperiment(variantEvidence, {
        primaryKpi: experiment.primaryKpi as
          | "OUTBOUND_CLICKS"
          | "OUTBOUND_CTR"
          | "SAVES"
          | "QUALIFIED_CONVERSIONS",
        minimumImpressions: guardrails.minimumImpressions,
        minimumOutboundClicks: guardrails.minimumOutboundClicks,
        attributionAvailable,
        evidenceComplete: experimentEvidenceComplete,
      }),
    };
  });

  const clusterEvidence = new Map<
    string,
    { publications: number; impressions: number; outboundClicks: number }
  >();
  for (const publication of publications) {
    if (!accountEvidence.get(publication.accountId)?.available) continue;
    if (!publication.candidate.clusterId) continue;
    const current = clusterEvidence.get(publication.candidate.clusterId) || {
      publications: 0,
      impressions: 0,
      outboundClicks: 0,
    };
    const metrics = finalizedMetricEvidence(
      publication.pinterestPin?.dailyMetrics || [],
      publication.publishedAt,
    ).ready;
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
      evidenceComplete &&
      analyticsFresh &&
      !incompletePinMetrics &&
      !incompleteManagedMetrics &&
      evidence &&
      evidence.publications >= 2 &&
      evidence.impressions >= 1_000,
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
  const historicalLegacyCount = deduplicatedPinRows.filter(
    (pin) => !pin.publishedAt || pin.publishedAt < evidenceWindowEnd,
  ).length;
  const historicalEvidenceCount = publications.length + historicalLegacyCount;
  const overallQuality = analyticsFresh
    ? historicalEvidenceCount
      ? evidenceComplete && !incompletePinMetrics && !incompleteManagedMetrics
        ? GrowthLearningEvidenceQuality.KNOWN
        : GrowthLearningEvidenceQuality.PARTIAL
      : GrowthLearningEvidenceQuality.INSUFFICIENT_DATA
    : GrowthLearningEvidenceQuality.STALE;
  const reasonCodes = [
    ...selectionReasonCodes,
    ...legacyEvidenceReasonCodes,
    !analyticsFresh ? "ANALYTICS_STALE" : null,
    !historicalEvidenceCount ? "NO_HISTORICAL_PIN_EVIDENCE" : null,
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
          summary: `Evaluated ${targetRows.length} public destinations using ${publications.length} managed publications and ${historicalLegacyCount} deduplicated legacy Pins; produced ${recommendations.length} advisory recommendations.`,
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
              contentUpdatedAt: row.evidence.contentUpdatedAt.toISOString(),
              observedMetricDays: row.evidence.observedMetricDays,
              impressions: row.evidence.impressions,
              outboundClicks: row.evidence.outboundClicks,
              saves: row.evidence.saves,
              qualifiedConversions: row.evidence.qualifiedConversions,
              attributionAvailable: row.evidence.attributionAvailable,
              lastPublishedAt:
                row.evidence.lastPublishedAt?.toISOString() || null,
              publicationCount: row.evidence.publicationCount,
              activeEquivalentCount: row.evidence.activeEquivalentCount,
              activeCandidateCount: row.evidence.activeCandidateCount,
              analyticsFresh: row.evidence.analyticsFresh,
              evidenceComplete: row.evidence.evidenceComplete,
              evidenceReasonCodes: row.evidence.evidenceReasonCodes,
              evidenceSources: {
                managed: (
                  publicationByTarget.get(
                    `${row.target.destinationKind}:${row.target.id}`,
                  ) || []
                ).map((publication) => ({
                  source: "GROWTH_MANAGED_PUBLICATION",
                  pinterestPinId: publication.pinterestPinId,
                  publicationId: publication.id,
                  publishedAt: publication.publishedAt?.toISOString() || null,
                })),
                legacy: (
                  legacyByTarget.get(
                    `${row.target.destinationKind}:${row.target.id}`,
                  ) || []
                ).map((pin) => ({
                  source: "LEGACY_PIN",
                  pinterestPinId: pin.pinterestPinId,
                  pinRecordId: pin.id,
                  sourceHost: pin.match.sourceHost,
                  publishedAt: pin.publishedAt?.toISOString() || null,
                  metricStatus:
                    pin.publishedAt && pin.publishedAt >= evidenceWindowEnd
                      ? "COOLDOWN_ONLY"
                      : finalizedMetricEvidence(
                            pin.dailyMetrics,
                            pin.publishedAt,
                          ).evidenceComplete
                        ? "COMPLETE"
                        : "INCOMPLETE",
                })),
              },
              accountFreshness: accounts.map((account) => ({
                id: account.id,
                connectionStatus: account.connectionStatus,
                analyticsStatus: account.analyticsState?.status || null,
                lastSuccessfulSyncAt:
                  account.analyticsState?.lastSuccessfulSyncAt?.toISOString() ||
                  null,
              })),
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
            legacyPinsConsidered: historicalLegacyCount,
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
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT "id" FROM "GrowthEvergreenRecommendationRecord" WHERE "id" = ${parsed.recommendationId} FOR UPDATE`,
    );
    const recommendation =
      await tx.growthEvergreenRecommendationRecord.findUnique({
        where: { id: parsed.recommendationId },
        include: { learningRun: true, preparationJob: true },
      });
    if (recommendation?.preparationJob)
      return { job: recommendation.preparationJob, created: false };
    await assertEvergreenRecommendationCurrent(tx, recommendation, new Date());
    if (
      recommendation!.proposedArchetype === "BEFORE_AFTER" &&
      parsed.paidAiConfirmation !== "QUEUE PAID AI CREATIVE"
    )
      throw new Error(
        "Paid AI preparation requires the exact confirmation: QUEUE PAID AI CREATIVE.",
      );
    const job = await tx.growthJob.create({
      data: {
        type: GrowthJobType.EVERGREEN_CREATIVE_PREPARE,
        idempotencyKey: `evergreen-prepare:${recommendation!.id}`,
        payload: { recommendationId: recommendation!.id },
        maxAttempts: 3,
      },
    });
    await tx.growthEvergreenRecommendationRecord.update({
      where: { id: recommendation!.id },
      data: {
        status: GrowthEvergreenRecommendationStatus.PREPARING,
        preparationJobId: job.id,
      },
    });
    await recordGrowthActivity(
      {
        actorKind: GrowthActivityActorKind.USER,
        actorUserId,
        entityType: "GrowthEvergreenRecommendation",
        entityId: recommendation!.id,
        action: "EVERGREEN_CREATIVE_PREPARATION_REQUESTED",
        fromState: GrowthEvergreenRecommendationStatus.PROPOSED,
        toState: GrowthEvergreenRecommendationStatus.PREPARING,
        summary: {
          jobId: job.id,
          targetKind: recommendation!.destinationKind,
          modelVersion: recommendation!.learningRun.evergreenModelVersion,
          paidAiConfirmed: recommendation!.proposedArchetype === "BEFORE_AFTER",
        },
        correlationKey: job.idempotencyKey,
      },
      tx,
    );
    return { job, created: true };
  });
}

type PreparationRecommendation =
  Prisma.GrowthEvergreenRecommendationRecordGetPayload<{
    include: { learningRun: true };
  }>;

async function assertEvergreenRecommendationCurrent(
  tx: Prisma.TransactionClient,
  recommendation: PreparationRecommendation | null,
  now: Date,
) {
  if (
    !recommendation ||
    recommendation.recommendation !== GrowthEvergreenRecommendation.REVIVE ||
    !(
      [
        GrowthEvergreenRecommendationStatus.PROPOSED,
        GrowthEvergreenRecommendationStatus.PREPARING,
      ] as GrowthEvergreenRecommendationStatus[]
    ).includes(recommendation.status) ||
    !recommendation.proposedArchetype
  )
    throw new Error("Only a current REVIVE proposal can be prepared.");
  if (
    now.getTime() - recommendation.learningRun.completedAt.getTime() >
    48 * 60 * 60_000
  )
    throw new Error(
      "The recommendation is stale; run learning analysis again.",
    );
  const targetId = recommendation.translatorId || recommendation.ideaId;
  if (!targetId) throw new Error("The recommendation target is unavailable.");
  const evidence = recommendation.evidence as {
    contentUpdatedAt?: string;
    lastPublishedAt?: string | null;
    accountFreshness?: Array<{
      id: string;
      connectionStatus: string;
      analyticsStatus: string | null;
      lastSuccessfulSyncAt: string | null;
    }>;
  };
  const [
    settings,
    target,
    publicationHistory,
    activeCandidateCount,
    strongFatigue,
    accounts,
  ] = await Promise.all([
    tx.growthSettings.findUnique({
      where: { id: "global" },
      select: { enabled: true, evergreenCooldownDays: true },
    }),
    recommendation.destinationKind === GrowthCreativeDestinationKind.TRANSLATOR
      ? tx.translator.findFirst({
          where: { id: targetId, isActive: true, archivedAt: null },
          select: { updatedAt: true, slug: true },
        })
      : tx.growthIdea.findFirst({
          where: {
            id: targetId,
            status: "PUBLISHED",
            archivedAt: null,
            currentVersion: { is: { publishedAt: { not: null } } },
            category: { isActive: true, archivedAt: null },
          },
          select: { updatedAt: true },
        }),
    tx.growthPinPublication.findMany({
      where: {
        status: {
          in: [
            GrowthPublicationStatus.PUBLISHED,
            GrowthPublicationStatus.RECONCILED,
          ],
        },
        candidate:
          recommendation.destinationKind ===
          GrowthCreativeDestinationKind.TRANSLATOR
            ? { translatorId: targetId }
            : { ideaId: targetId },
      },
      select: { id: true, pinterestPinId: true, publishedAt: true },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: MAX_LEARNING_PUBLICATIONS + 1,
    }),
    tx.growthPinCandidate.count({
      where: {
        ...(recommendation.destinationKind ===
        GrowthCreativeDestinationKind.TRANSLATOR
          ? { translatorId: targetId }
          : { ideaId: targetId }),
        status: { in: ["DRAFT", "RENDERING", "READY"] },
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
    }),
    tx.growthPinSignal.count({
      where: {
        type: "FATIGUE",
        strength: "STRONG",
        pin: {
          publication: {
            candidate:
              recommendation.destinationKind ===
              GrowthCreativeDestinationKind.TRANSLATOR
                ? { translatorId: targetId }
                : { ideaId: targetId },
          },
        },
      },
    }),
    tx.growthPinterestAccount.findMany({
      where: { activeRole: { not: null } },
      select: {
        id: true,
        connectionStatus: true,
        analyticsState: {
          select: { status: true, lastSuccessfulSyncAt: true },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  if (!settings?.enabled)
    throw new Error("Growth was disabled after analysis.");
  if (!target)
    throw new Error(
      "The recommendation target is no longer public and eligible.",
    );
  if (
    !evidence.contentUpdatedAt ||
    target.updatedAt.toISOString() !== evidence.contentUpdatedAt
  )
    throw new Error(
      "The target changed after analysis; run learning analysis again.",
    );
  if (publicationHistory.length > MAX_LEARNING_PUBLICATIONS)
    throw new Error(
      "Publication history is ambiguous; run learning analysis again.",
    );
  let currentLatest = publicationHistory[0]?.publishedAt || null;
  const evidenceSources = (
    recommendation.evidence as {
      evidenceSources?: {
        managed?: Array<{
          publicationId?: string;
          pinterestPinId?: string | null;
        }>;
        legacy?: Array<{
          pinterestPinId?: string;
          sourceHost?: string;
        }>;
      };
    }
  ).evidenceSources;
  if (
    recommendation.learningRun.learningModelVersion === "growth_learning_v2"
  ) {
    if (!evidenceSources)
      throw new Error(
        "Pin provenance is unavailable; run learning analysis again.",
      );
    const storedManaged = (evidenceSources.managed || [])
      .map((source) => source.publicationId || "")
      .sort();
    const currentManaged = publicationHistory.map((row) => row.id).sort();
    if (JSON.stringify(storedManaged) !== JSON.stringify(currentManaged))
      throw new Error(
        "Managed publication provenance changed after analysis; run learning analysis again.",
      );
    if (
      recommendation.destinationKind !==
      GrowthCreativeDestinationKind.TRANSLATOR
    ) {
      if (evidenceSources?.legacy?.length)
        throw new Error(
          "Legacy Pin provenance is invalid for this target; run learning analysis again.",
        );
    } else {
      if (!("slug" in target))
        throw new Error(
          "Legacy Pin provenance is unavailable; run learning analysis again.",
        );
      const pinRows = await tx.growthPinterestPin.findMany({
        where: {
          isActive: true,
          analyticsEligible: true,
          destinationUrl: { not: null },
        },
        select: {
          id: true,
          pinterestPinId: true,
          destinationUrl: true,
          publishedAt: true,
        },
        orderBy: { pinterestPinId: "asc" },
        take: MAX_LEARNING_PIN_EVIDENCE + 1,
      });
      if (pinRows.length > MAX_LEARNING_PIN_EVIDENCE)
        throw new Error(
          "Legacy Pin evidence is ambiguous; run learning analysis again.",
        );
      const activeTarget = [{ id: targetId, slug: target.slug }];
      const managedPinterestIds = new Set(
        publicationHistory.flatMap((publication) =>
          publication.pinterestPinId ? [publication.pinterestPinId] : [],
        ),
      );
      const legacyPins = pinRows.flatMap((pin) => {
        const match = matchLegacyPinToTranslator(
          pin.destinationUrl,
          activeTarget,
        );
        if (
          !match &&
          potentialLegacyTranslatorSlug(pin.destinationUrl) ===
            target.slug.toLowerCase()
        )
          throw new Error(
            "Legacy Pin destination is ambiguous; run learning analysis again.",
          );
        return match && !managedPinterestIds.has(pin.pinterestPinId)
          ? [{ ...pin, match }]
          : [];
      });
      const storedLegacy = (evidenceSources.legacy || [])
        .map(
          (source) =>
            `${source.pinterestPinId || ""}:${source.sourceHost || ""}`,
        )
        .sort();
      const currentLegacy = legacyPins
        .map((pin) => `${pin.pinterestPinId}:${pin.match.sourceHost}`)
        .sort();
      if (JSON.stringify(storedLegacy) !== JSON.stringify(currentLegacy))
        throw new Error(
          "Combined Pin provenance changed after analysis; run learning analysis again.",
        );
      currentLatest =
        [
          ...publicationHistory.map((row) => row.publishedAt),
          ...legacyPins.map((pin) => pin.publishedAt),
        ]
          .filter((value): value is Date => Boolean(value))
          .sort((a, b) => b.getTime() - a.getTime())[0] || null;
    }
  }
  const expectedLatest = evidence.lastPublishedAt || null;
  if ((currentLatest?.toISOString() || null) !== expectedLatest)
    throw new Error(
      "Publication history changed after analysis; run learning analysis again.",
    );
  if (
    currentLatest &&
    now.getTime() - currentLatest.getTime() <
      settings.evergreenCooldownDays * 86_400_000
  )
    throw new Error("The target is inside the current evergreen cooldown.");
  if (activeCandidateCount)
    throw new Error(
      "An active creative candidate already exists for this target.",
    );
  if (strongFatigue)
    throw new Error("Strong fatigue now blocks evergreen preparation.");
  const freshnessCutoff =
    now.getTime() - ANALYTICS_FRESHNESS_HOURS * 60 * 60_000;
  if (
    !accounts.length ||
    accounts.some(
      (account) =>
        account.connectionStatus !== "CONNECTED" ||
        account.analyticsState?.status !== "FRESH" ||
        !account.analyticsState.lastSuccessfulSyncAt ||
        account.analyticsState.lastSuccessfulSyncAt.getTime() < freshnessCutoff,
    )
  )
    throw new Error(
      "Pinterest account health or analytics freshness changed after analysis.",
    );
  const currentAccountFreshness = accounts.map((account) => ({
    id: account.id,
    connectionStatus: account.connectionStatus,
    analyticsStatus: account.analyticsState?.status || null,
    lastSuccessfulSyncAt:
      account.analyticsState?.lastSuccessfulSyncAt?.toISOString() || null,
  }));
  if (
    !evidence.accountFreshness ||
    JSON.stringify(
      currentAccountFreshness.map((a) => [
        a.id,
        a.connectionStatus,
        a.analyticsStatus,
        a.lastSuccessfulSyncAt,
      ]),
    ) !==
      JSON.stringify(
        evidence.accountFreshness.map((a) => [
          a.id,
          a.connectionStatus,
          a.analyticsStatus,
          a.lastSuccessfulSyncAt,
        ]),
      )
  )
    throw new Error(
      "Pinterest analytics changed after analysis; run learning analysis again.",
    );
  return recommendation;
}

export async function executeEvergreenPreparation(recommendationId: string) {
  const prepared = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT "id" FROM "GrowthEvergreenRecommendationRecord" WHERE "id" = ${recommendationId} FOR UPDATE`,
    );
    const row = await tx.growthEvergreenRecommendationRecord.findUnique({
      where: { id: recommendationId },
      include: { learningRun: true, creativeJob: true },
    });
    if (row?.creativeJob)
      return { recommendation: row, existingJob: row.creativeJob };
    return {
      recommendation: await assertEvergreenRecommendationCurrent(
        tx,
        row,
        new Date(),
      ),
      existingJob: null,
    };
  });
  if (prepared.existingJob)
    return { job: prepared.existingJob, created: false };
  const recommendation = prepared.recommendation;
  const targetId = recommendation.translatorId || recommendation.ideaId;
  if (!targetId) throw new Error("The recommendation target is unavailable.");
  const result = await enqueueCreativeGeneration(
    {
      targetKind: recommendation.destinationKind,
      targetId,
      archetype: recommendation.proposedArchetype,
      creativeModelVersion: "creative_lab_v1",
      ...(recommendation.proposedArchetype === "BEFORE_AFTER"
        ? { useAiExample: true }
        : {}),
    },
    {
      runAfter: new Date(Date.now() + 10 * 60_000),
      idempotencyScope: recommendationId,
      evergreenRecommendationId: recommendationId,
    },
  );
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT "id" FROM "GrowthEvergreenRecommendationRecord" WHERE "id" = ${recommendationId} FOR UPDATE`,
      );
      const current = await tx.growthEvergreenRecommendationRecord.findUnique({
        where: { id: recommendationId },
        include: { learningRun: true },
      });
      await assertEvergreenRecommendationCurrent(tx, current, new Date());
      const payload = {
        ...(result.job.payload as Prisma.JsonObject),
        evergreenRecommendationId: recommendationId,
      };
      await tx.growthJob.update({
        where: { id: result.job.id },
        data: { payload, runAfter: new Date() },
      });
      await tx.growthEvergreenRecommendationRecord.update({
        where: { id: recommendationId },
        data: { creativeJobId: result.job.id },
      });
    });
  } catch (error) {
    if (result.created)
      await prisma.growthJob.updateMany({
        where: { id: result.job.id, status: GrowthJobStatus.PENDING },
        data: { status: GrowthJobStatus.CANCELLED, completedAt: new Date() },
      });
    throw error;
  }
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
