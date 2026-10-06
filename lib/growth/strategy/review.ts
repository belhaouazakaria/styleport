import {
  GrowthActivityActorKind,
  GrowthPinterestConnectionStatus,
  GrowthJobType,
  Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { getAttributionCollectionStatus } from "@/lib/growth/attribution/config";
import { enqueueGrowthJob } from "@/lib/growth/jobs";
import {
  evaluateAccountHealth,
  evaluateIntentAlignment,
} from "@/lib/growth/strategy/account-health";
import { evaluateBoardEligibility } from "@/lib/growth/strategy/boards";
import {
  ACCOUNT_STRATEGY_MAX_BOARDS,
  ACCOUNT_STRATEGY_MAX_PINS,
  ACCOUNT_STRATEGY_MODEL_VERSION,
  ACCOUNT_STRATEGY_ROLES,
  accountStrategyPeriodKey,
  accountStrategyReviewWindow,
} from "@/lib/growth/strategy/constants";
import {
  accountStrategyEvidenceSchema,
  type AccountStrategyEvidence,
  type BoardStrategy,
  type RoleStrategy,
  type StrategyMetrics,
  type StrategyReasonCode,
} from "@/lib/growth/strategy/contracts";
import {
  bigintPercent,
  concentrationForRole,
  evaluatePortfolio,
} from "@/lib/growth/strategy/portfolio";
import { prisma } from "@/lib/prisma";

const ZERO_METRICS = {
  impressions: BigInt(0),
  saves: BigInt(0),
  pinClicks: BigInt(0),
  outboundClicks: BigInt(0),
};

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() || null;
}

function metricOutput(
  value: typeof ZERO_METRICS,
  observationDays: number,
  state: StrategyMetrics["state"],
): StrategyMetrics {
  if (state !== "KNOWN") {
    return {
      state,
      observationDays,
      impressions: null,
      saves: null,
      pinClicks: null,
      outboundClicks: null,
      outboundCtrPercent: null,
    };
  }
  return {
    state,
    observationDays,
    impressions: value.impressions.toString(),
    saves: value.saves.toString(),
    pinClicks: value.pinClicks.toString(),
    outboundClicks: value.outboundClicks.toString(),
    outboundCtrPercent: bigintPercent(value.outboundClicks, value.impressions),
  };
}

function sumMetrics(rows: Array<typeof ZERO_METRICS>) {
  return rows.reduce(
    (sum, row) => ({
      impressions: sum.impressions + row.impressions,
      saves: sum.saves + row.saves,
      pinClicks: sum.pinClicks + row.pinClicks,
      outboundClicks: sum.outboundClicks + row.outboundClicks,
    }),
    { ...ZERO_METRICS },
  );
}

function recommendedAction(
  health: RoleStrategy["health"],
  alignment: RoleStrategy["alignment"]["status"],
  label: string,
) {
  if (health === "NOT_CONNECTED")
    return `Connect or position the existing ${label} publication when ready; do not add a fourth account.`;
  if (health === "REAUTH_REQUIRED")
    return `Reconnect ${label} before using its data for strategy.`;
  if (alignment === "MISALIGNED")
    return `Review ${label} positioning against its intended user intent.`;
  if (health === "NEEDS_ATTENTION")
    return `Refresh or repair local Pinterest evidence for ${label}.`;
  if (health === "INSUFFICIENT_DATA" || alignment === "INSUFFICIENT_DATA")
    return `Collect more complete Pinterest evidence for ${label}.`;
  return `Keep ${label} aligned with its current intent and continue measuring.`;
}

export async function evaluateAccountStrategy(input?: {
  now?: Date;
  reviewMonth?: Date;
  evidenceWindowStart?: Date;
  evidenceWindowEnd?: Date;
}): Promise<AccountStrategyEvidence> {
  const now = input?.now || new Date();
  const calculated = accountStrategyReviewWindow(now);
  const reviewMonth = input?.reviewMonth || calculated.reviewMonth;
  const evidenceWindowStart =
    input?.evidenceWindowStart || calculated.evidenceWindowStart;
  const evidenceWindowEnd =
    input?.evidenceWindowEnd || calculated.evidenceWindowEnd;
  const attribution = await getAttributionCollectionStatus({
    readSettingWhenServerDisabled: true,
  });

  const accounts = await prisma.growthPinterestAccount.findMany({
    where: {
      activeRole: { not: null },
      connectionStatus: { not: GrowthPinterestConnectionStatus.DISCONNECTED },
    },
    select: {
      id: true,
      activeRole: true,
      username: true,
      connectionStatus: true,
      grantedScopes: true,
      refreshTokenExpiresAt: true,
      lastSuccessfulApiCallAt: true,
      lastAccountSyncAt: true,
      lastBoardSyncAt: true,
      analyticsState: {
        select: { status: true, lastSuccessfulSyncAt: true },
      },
    },
    orderBy: { activeRole: "asc" },
    take: 3,
  });
  const accountIds = accounts.map((account) => account.id);
  const [boards, pins, accountMetricRows, pinMetricGroups] = await Promise.all([
    prisma.growthPinterestBoard.findMany({
      where: { accountId: { in: accountIds } },
      select: {
        id: true,
        accountId: true,
        pinterestBoardId: true,
        name: true,
        privacy: true,
        isActive: true,
        lastSyncedAt: true,
      },
      orderBy: [{ isActive: "desc" }, { lastSyncedAt: "desc" }],
      take: ACCOUNT_STRATEGY_MAX_BOARDS,
    }),
    prisma.growthPinterestPin.findMany({
      where: { accountId: { in: accountIds }, isActive: true },
      select: {
        id: true,
        accountId: true,
        boardId: true,
        analyticsEligible: true,
        destinationUrl: true,
        title: true,
        description: true,
      },
      orderBy: { id: "asc" },
      take: ACCOUNT_STRATEGY_MAX_PINS,
    }),
    prisma.growthPinterestAccountMetricDaily.findMany({
      where: {
        accountId: { in: accountIds },
        metricDate: { gte: evidenceWindowStart, lte: evidenceWindowEnd },
      },
      select: {
        accountId: true,
        metricDate: true,
        impressions: true,
        saves: true,
        pinClicks: true,
        outboundClicks: true,
      },
      orderBy: [{ accountId: "asc" }, { metricDate: "asc" }],
      take: 3 * 28,
    }),
    prisma.growthPinterestPinMetricDaily.groupBy({
      by: ["pinId"],
      where: {
        metricDate: { gte: evidenceWindowStart, lte: evidenceWindowEnd },
        pin: {
          accountId: { in: accountIds },
          isActive: true,
          analyticsEligible: true,
        },
      },
      _sum: {
        impressions: true,
        saves: true,
        pinClicks: true,
        outboundClicks: true,
      },
      orderBy: { pinId: "asc" },
      take: ACCOUNT_STRATEGY_MAX_PINS,
    }),
  ]);

  const accountByRole = new Map(
    accounts.flatMap((account) =>
      account.activeRole ? [[account.activeRole, account] as const] : [],
    ),
  );
  const pinMetrics = new Map(
    pinMetricGroups.map((row) => [
      row.pinId,
      {
        impressions: row._sum.impressions || BigInt(0),
        saves: row._sum.saves || BigInt(0),
        pinClicks: row._sum.pinClicks || BigInt(0),
        outboundClicks: row._sum.outboundClicks || BigInt(0),
      },
    ]),
  );

  const qpcByAccount = new Map<string, bigint>();
  if (attribution.enabled) {
    await Promise.all(
      accountIds.map(async (accountId) => {
        const result = await prisma.growthAttributionDailyAggregate.aggregate({
          where: {
            metricDate: { gte: evidenceWindowStart, lte: evidenceWindowEnd },
            attributionRef: { pinterestPin: { accountId } },
          },
          _sum: { qualifiedConversions: true },
        });
        qpcByAccount.set(
          accountId,
          BigInt(result._sum.qualifiedConversions || 0),
        );
      }),
    );
  }

  const roles: RoleStrategy[] = ACCOUNT_STRATEGY_ROLES.map((definition) => {
    const account = accountByRole.get(definition.role) || null;
    if (!account) {
      const health = evaluateAccountHealth(null, now);
      return {
        ...definition,
        accountId: null,
        username: null,
        connectionStatus: null,
        health: health.health,
        readiness: health.readiness,
        evidenceQuality: health.evidenceQuality,
        requiredScopesComplete: null,
        lastSuccessfulApiCallAt: null,
        lastAccountSyncAt: null,
        lastBoardSyncAt: null,
        analyticsStatus: null,
        lastAnalyticsSyncAt: null,
        activePins: null,
        relevantPins: null,
        boardCount: null,
        metrics: metricOutput(ZERO_METRICS, 0, "NOT_APPLICABLE"),
        attributionCollection: attribution.enabled
          ? "COLLECTING"
          : "NOT_COLLECTING",
        qualifiedConversions: null,
        qualifiedConversionEvidence: "NOT_APPLICABLE",
        alignment: {
          status: "INSUFFICIENT_DATA",
          consideredPins: 0,
          alignedPins: 0,
          reasons: [],
        },
        reasonCodes: health.reasonCodes,
        recommendedAction: recommendedAction(
          health.health,
          "INSUFFICIENT_DATA",
          definition.label,
        ),
      };
    }

    const accountPins = pins.filter((pin) => pin.accountId === account.id);
    const relevantPins = accountPins.filter((pin) => pin.analyticsEligible);
    const accountBoards = boards.filter(
      (board) => board.accountId === account.id,
    );
    const metricRows = accountMetricRows.filter(
      (row) => row.accountId === account.id,
    );
    const metrics = sumMetrics(metricRows);
    const health = evaluateAccountHealth(
      {
        id: account.id,
        activeRole: account.activeRole!,
        username: account.username,
        connectionStatus: account.connectionStatus,
        grantedScopes: account.grantedScopes,
        refreshTokenExpiresAt: account.refreshTokenExpiresAt,
        lastSuccessfulApiCallAt: account.lastSuccessfulApiCallAt,
        lastAccountSyncAt: account.lastAccountSyncAt,
        lastBoardSyncAt: account.lastBoardSyncAt,
        analyticsStatus: account.analyticsState?.status || null,
        lastAnalyticsSyncAt:
          account.analyticsState?.lastSuccessfulSyncAt || null,
        activePins: accountPins.length,
        relevantPins: relevantPins.length,
        boardCount: accountBoards.filter((board) => board.isActive).length,
        observationDays: new Set(
          metricRows.map((row) => dateOnly(row.metricDate)),
        ).size,
      },
      now,
    );
    const alignment = evaluateIntentAlignment(definition.role, relevantPins);
    const reasonCodes = [
      ...new Set<StrategyReasonCode>([
        ...health.reasonCodes,
        ...alignment.reasons,
        ...(!attribution.enabled
          ? ["ATTRIBUTION_NOT_COLLECTING" as const]
          : []),
      ]),
    ];
    const qpc = qpcByAccount.get(account.id);
    return {
      ...definition,
      accountId: account.id,
      username: account.username,
      connectionStatus: account.connectionStatus,
      health: health.health,
      readiness: health.readiness,
      evidenceQuality: health.evidenceQuality,
      requiredScopesComplete: !health.reasonCodes.includes(
        "MISSING_REQUIRED_SCOPES",
      ),
      lastSuccessfulApiCallAt: iso(account.lastSuccessfulApiCallAt),
      lastAccountSyncAt: iso(account.lastAccountSyncAt),
      lastBoardSyncAt: iso(account.lastBoardSyncAt),
      analyticsStatus: account.analyticsState?.status || null,
      lastAnalyticsSyncAt: iso(account.analyticsState?.lastSuccessfulSyncAt),
      activePins: accountPins.length,
      relevantPins: relevantPins.length,
      boardCount: accountBoards.filter((board) => board.isActive).length,
      metrics: metricOutput(
        metrics,
        new Set(metricRows.map((row) => dateOnly(row.metricDate))).size,
        metricRows.length ? "KNOWN" : "UNKNOWN",
      ),
      attributionCollection: attribution.enabled
        ? "COLLECTING"
        : "NOT_COLLECTING",
      qualifiedConversions: attribution.enabled
        ? (qpc || BigInt(0)).toString()
        : null,
      qualifiedConversionEvidence: attribution.enabled
        ? "KNOWN"
        : "NOT_APPLICABLE",
      alignment,
      reasonCodes,
      recommendedAction: recommendedAction(
        health.health,
        alignment.status,
        definition.label,
      ),
    };
  });

  const boardStrategies: BoardStrategy[] = boards.flatMap((board) => {
    const account = accounts.find(
      (candidate) => candidate.id === board.accountId,
    );
    if (!account?.activeRole) return [];
    const role = roles.find(
      (candidate) => candidate.role === account.activeRole,
    );
    if (!role) return [];
    const boardPins = pins.filter((pin) => pin.boardId === board.id);
    const relevantBoardPins = boardPins.filter((pin) => pin.analyticsEligible);
    const boardMetricRows = relevantBoardPins.flatMap((pin) => {
      const metrics = pinMetrics.get(pin.id);
      return metrics ? [metrics] : [];
    });
    const eligibility = evaluateBoardEligibility({
      accountConnected: role.accountId !== null,
      accountBlocked: role.readiness === "BLOCKED",
      accountAlignment: role.alignment.status,
      active: board.isActive,
      privacy: board.privacy,
      pinCount: boardPins.length,
      relevantPinCount: relevantBoardPins.length,
    });
    return [
      {
        accountRole: account.activeRole,
        accountUsername: account.username,
        pinterestBoardId: board.pinterestBoardId,
        name: board.name,
        privacy: board.privacy,
        active: board.isActive,
        pinCount: boardPins.length,
        relevantPinCount: relevantBoardPins.length,
        metrics: metricOutput(
          sumMetrics(boardMetricRows),
          role.metrics.observationDays,
          boardMetricRows.length ? "KNOWN" : "INSUFFICIENT_DATA",
        ),
        eligibility: eligibility.eligibility,
        reasonCodes: eligibility.reasonCodes,
        lastSyncedAt: board.lastSyncedAt.toISOString(),
      },
    ];
  });

  const concentration = ACCOUNT_STRATEGY_ROLES.map((definition) => {
    const account = accountByRole.get(definition.role);
    const rows = account
      ? pins
          .filter(
            (pin) => pin.accountId === account.id && pin.analyticsEligible,
          )
          .flatMap((pin) => {
            const metrics = pinMetrics.get(pin.id);
            return metrics
              ? [
                  {
                    impressions: metrics.impressions,
                    outboundClicks: metrics.outboundClicks,
                  },
                ]
              : [];
          })
      : [];
    return concentrationForRole(definition.role, rows);
  });
  const portfolio = evaluatePortfolio({
    roles,
    concentration,
    attributionCollecting: attribution.enabled,
  });

  return accountStrategyEvidenceSchema.parse({
    modelVersion: ACCOUNT_STRATEGY_MODEL_VERSION,
    reviewMonth: accountStrategyPeriodKey(reviewMonth),
    evidenceWindowStart: dateOnly(evidenceWindowStart),
    evidenceWindowEnd: dateOnly(evidenceWindowEnd),
    attributionCapability: "AVAILABLE",
    attributionCollection: attribution.enabled
      ? "COLLECTING"
      : "NOT_COLLECTING",
    roles,
    boards: boardStrategies,
    concentration,
    portfolio,
  });
}

export async function persistAccountStrategyReview(input?: {
  now?: Date;
  reviewMonth?: Date;
  evidenceWindowStart?: Date;
  evidenceWindowEnd?: Date;
}) {
  const now = input?.now || new Date();
  const evidence = await evaluateAccountStrategy({ ...input, now });
  const reviewMonth = new Date(`${evidence.reviewMonth}-01T00:00:00.000Z`);
  const evidenceWindowStart = new Date(
    `${evidence.evidenceWindowStart}T00:00:00.000Z`,
  );
  const evidenceWindowEnd = new Date(
    `${evidence.evidenceWindowEnd}T00:00:00.000Z`,
  );
  return prisma.$transaction(async (tx) => {
    const existing = await tx.growthAccountStrategyReview.findUnique({
      where: {
        reviewMonth_modelVersion: {
          reviewMonth,
          modelVersion: ACCOUNT_STRATEGY_MODEL_VERSION,
        },
      },
      select: { id: true },
    });
    const review = await tx.growthAccountStrategyReview.upsert({
      where: {
        reviewMonth_modelVersion: {
          reviewMonth,
          modelVersion: ACCOUNT_STRATEGY_MODEL_VERSION,
        },
      },
      create: {
        reviewMonth,
        evidenceWindowStart,
        evidenceWindowEnd,
        modelVersion: ACCOUNT_STRATEGY_MODEL_VERSION,
        recommendation: evidence.portfolio.recommendation,
        plannedAccountCount: evidence.portfolio.plannedRoles,
        connectedAccountCount: evidence.portfolio.connectedRoles,
        recommendedAccountCount: evidence.portfolio.recommendedAccountCount,
        confidence: evidence.portfolio.confidence,
        evidenceQuality: evidence.portfolio.evidenceQuality,
        evidence: evidence as unknown as Prisma.InputJsonValue,
        reasonCodes: evidence.portfolio.reasonCodes,
        recommendationSummary: evidence.portfolio.summary,
        completedAt: now,
      },
      update: {
        evidenceWindowStart,
        evidenceWindowEnd,
        recommendation: evidence.portfolio.recommendation,
        plannedAccountCount: evidence.portfolio.plannedRoles,
        connectedAccountCount: evidence.portfolio.connectedRoles,
        recommendedAccountCount: evidence.portfolio.recommendedAccountCount,
        confidence: evidence.portfolio.confidence,
        evidenceQuality: evidence.portfolio.evidenceQuality,
        evidence: evidence as unknown as Prisma.InputJsonValue,
        reasonCodes: evidence.portfolio.reasonCodes,
        recommendationSummary: evidence.portfolio.summary,
        completedAt: now,
      },
    });
    await recordGrowthActivity(
      {
        actorKind: GrowthActivityActorKind.WORKER,
        entityType: "GrowthAccountStrategyReview",
        entityId: review.id,
        action: "ACCOUNT_STRATEGY_REVIEW_COMPLETED",
        fromState: existing ? "EXISTING" : null,
        toState: review.recommendation,
        summary: {
          period: evidence.reviewMonth,
          recommendation: review.recommendation,
          plannedCount: review.plannedAccountCount,
          connectedCount: review.connectedAccountCount,
          recommendedCount: review.recommendedAccountCount,
          confidence: review.confidence,
          evidenceQuality: review.evidenceQuality,
          reasonCodes: review.reasonCodes,
          modelVersion: review.modelVersion,
        },
        correlationKey: `account-strategy:${review.modelVersion}:${evidence.reviewMonth}`,
      },
      tx,
    );
    return { review, evidence, created: !existing };
  });
}

export function enqueueAccountStrategyReview(now = new Date()) {
  const window = accountStrategyReviewWindow(now);
  const period = accountStrategyPeriodKey(window.reviewMonth);
  return enqueueGrowthJob({
    type: GrowthJobType.ACCOUNT_STRATEGY_REVIEW,
    idempotencyKey: `account-strategy:${ACCOUNT_STRATEGY_MODEL_VERSION}:${period}`,
    payload: {
      reviewMonth: period,
      evidenceWindowEnd: dateOnly(window.evidenceWindowEnd),
      modelVersion: ACCOUNT_STRATEGY_MODEL_VERSION,
    },
    maxAttempts: 3,
  });
}
