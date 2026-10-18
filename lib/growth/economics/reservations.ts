import { GrowthActivityActorKind, GrowthAiOperationKind, GrowthAiReservationStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { NonRetryableGrowthJobError } from "@/lib/growth/errors";
import {
  assessGrowthBudgetAdmission,
  growthBudgetUtcWindows,
  GROWTH_BUDGET_WARNING_PERCENTS,
} from "@/lib/growth/economics/budget-policy";
import { prisma } from "@/lib/prisma";

export class GrowthBudgetBlockedError extends NonRetryableGrowthJobError {
  constructor(readonly reason: string) {
    super(`Growth AI spend admission blocked: ${reason}`);
    this.name = "GrowthBudgetBlockedError";
  }
}

export interface GrowthReservationRequest {
  requestKey?: string;
  jobId?: string | null;
  kind: GrowthAiOperationKind;
  provider: string;
  model: string;
  // Must be sourced from a verified model pricing profile with a conservative
  // upper bound for the full single provider request. Unknown => no call.
  priceCeilingCents: number | null;
  pricingVersion: string | null;
}

function validBounded(value: string, max: number) {
  return value.trim().length > 0 && value.length <= max;
}

function crossed(before: number, after: number, ceiling: number, threshold: number) {
  return before * 100 < threshold * ceiling && after * 100 >= threshold * ceiling;
}

export async function reserveGrowthAiBudget(input: GrowthReservationRequest) {
  const requestKey = input.requestKey ?? randomUUID();
  if (!validBounded(requestKey, 191) || !validBounded(input.provider, 80) ||
      !validBounded(input.model, 120) || !input.pricingVersion || !validBounded(input.pricingVersion, 120)) {
    throw new GrowthBudgetBlockedError("INVALID_OPERATION_OR_PRICING_PROFILE");
  }
  if (input.priceCeilingCents === null || !Number.isSafeInteger(input.priceCeilingCents) || input.priceCeilingCents <= 0) {
    throw new GrowthBudgetBlockedError("UNKNOWN_PRICE");
  }
  const priceCeilingCents = input.priceCeilingCents as number;
  if (input.jobId && !validBounded(input.jobId, 191)) {
    throw new GrowthBudgetBlockedError("INVALID_JOB_ID");
  }

  return prisma.$transaction(async (tx) => {
    // Lock the existing singleton settings row. Growth cannot execute unless
    // this row exists and is enabled. This serializes spending admissions across
    // workers and setting changes without locking normal translation requests.
    await tx.$queryRaw`SELECT "id" FROM "GrowthSettings" WHERE "id" = 'global' FOR UPDATE`;

    const previousRequest = await tx.growthAiBudgetReservation.findUnique({ where: { requestKey } });
    if (previousRequest) {
      if (previousRequest.kind !== input.kind || previousRequest.model !== input.model ||
          previousRequest.provider !== input.provider ||
          previousRequest.pricingVersion !== input.pricingVersion ||
          previousRequest.reservedCents !== priceCeilingCents) {
        throw new GrowthBudgetBlockedError("RESERVATION_IDEMPOTENCY_CONFLICT");
      }
      // Returning a previous reservation does not authorize making another
      // provider request with the same key. The caller must ensure one-time use.
      return { reservation: previousRequest, newlyReserved: false };
    }

    const settings = await tx.growthSettings.findUnique({ where: { id: "global" } });
    if (!settings?.enabled) throw new GrowthBudgetBlockedError("GROWTH_DISABLED");

    const { dayStart, monthStart } = growthBudgetUtcWindows(new Date());
    const [daily, monthly, imageCount] = await Promise.all([
      tx.growthAiBudgetReservation.aggregate({
        where: { createdAt: { gte: dayStart } },
        _sum: { reservedCents: true },
      }),
      tx.growthAiBudgetReservation.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { reservedCents: true },
      }),
      tx.growthAiBudgetReservation.count({
        where: { createdAt: { gte: dayStart }, kind: GrowthAiOperationKind.IMAGE },
      }),
    ]);

    if (input.kind === GrowthAiOperationKind.IMAGE && imageCount >= settings.aiImagesPerDayCap) {
      throw new GrowthBudgetBlockedError("IMAGE_DAILY_LIMIT");
    }

    const dailyCommittedCents = daily._sum.reservedCents ?? 0;
    const monthlyCommittedCents = monthly._sum.reservedCents ?? 0;
    const admission = assessGrowthBudgetAdmission({
      dailyBudgetCents: settings.aiDailyBudgetCents,
      monthlyBudgetCents: settings.aiMonthlyBudgetCents,
      dailyCommittedCents,
      monthlyCommittedCents,
    }, priceCeilingCents);
    if (!admission.allowed) throw new GrowthBudgetBlockedError(admission.reason);

    const reservation = await tx.growthAiBudgetReservation.create({
      data: {
        requestKey,
        jobId: input.jobId || null,
        provider: input.provider,
        model: input.model,
        kind: input.kind,
        pricingVersion: input.pricingVersion,
        reservedCents: priceCeilingCents,
        status: GrowthAiReservationStatus.RESERVED,
      },
    });

    const warningPercents = GROWTH_BUDGET_WARNING_PERCENTS.filter((threshold) =>
      crossed(dailyCommittedCents, admission.dailyAfterCents, settings.aiDailyBudgetCents, threshold) ||
      crossed(monthlyCommittedCents, admission.monthlyAfterCents, settings.aiMonthlyBudgetCents, threshold),
    );
    for (const percent of warningPercents) {
      await recordGrowthActivity({
        actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthAiBudgetReservation",
        entityId: reservation.id,
        action: "AI_BUDGET_WARNING",
        summary: { thresholdPercent: percent, dailyAfterCents: admission.dailyAfterCents,
          monthlyAfterCents: admission.monthlyAfterCents, currency: "USD" },
        correlationKey: `growth-ai-budget-warning:${percent}:${dayStart.toISOString()}:${reservation.id}`,
      }, tx);
    }
    return { reservation, newlyReserved: true };
  }, { timeout: 10_000 });
}

// Pessimistic reservations remain counted even after reconciliation so any
// missing provider usage and retry ambiguity cannot silently free budget.
export async function reconcileGrowthAiBudget(input: {
  reservationId: string;
  actualCostCents: number | null;
}) {
  if (!input.reservationId || input.reservationId.length > 191 ||
      input.actualCostCents === null || !Number.isSafeInteger(input.actualCostCents) || input.actualCostCents < 0) {
    throw new GrowthBudgetBlockedError("UNKNOWN_ACTUAL_COST");
  }
  const updated = await prisma.growthAiBudgetReservation.updateMany({
    where: { id: input.reservationId, status: GrowthAiReservationStatus.RESERVED,
      reservedCents: { gte: input.actualCostCents } },
    data: { reconciledCents: input.actualCostCents,
      status: GrowthAiReservationStatus.RECONCILED, reconciledAt: new Date() },
  });
  if (updated.count !== 1) throw new GrowthBudgetBlockedError("RECONCILIATION_FAILED_OR_OVER_CEILING");
}
