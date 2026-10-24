import { GrowthAiReservationStatus } from "@prisma/client";
import { growthBudgetUtcWindows } from "@/lib/growth/economics/budget-policy";
import { prisma } from "@/lib/prisma";

/**
 * Read-only accounting of durable AI reservations. These are conservative
 * budget commitments, NOT provider-invoiced actual spend or cash payments.
 * Results are from the local Growth database only; no provider API calls.
 */
export async function getGrowthBudgetExposure(now = new Date()) {
  const { dayStart, monthStart } = growthBudgetUtcWindows(now);
  const [settings, day, month, images, outstanding, recent] = await Promise.all([
    prisma.growthSettings.findUnique({
      where: { id: "global" },
      select: {
        enabled: true, aiDailyBudgetCents: true, aiMonthlyBudgetCents: true,
        aiImagesPerDayCap: true,
      },
    }),
    prisma.growthAiBudgetReservation.aggregate({
      where: { createdAt: { gte: dayStart } },
      _sum: { reservedCents: true },
    }),
    prisma.growthAiBudgetReservation.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { reservedCents: true },
    }),
    prisma.growthAiBudgetReservation.count({
      where: { createdAt: { gte: dayStart }, kind: "IMAGE" },
    }),
    prisma.growthAiBudgetReservation.count({
      where: { status: GrowthAiReservationStatus.RESERVED },
    }),
    prisma.growthAiBudgetReservation.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true, createdAt: true, kind: true, provider: true, model: true,
        pricingVersion: true, reservedCents: true, reconciledCents: true,
        status: true,
        usageEvidence: { select: {
          outcome: true, inputTokens: true, outputTokens: true,
          totalTokens: true, imageUnits: true, estimatedMicroUsd: true,
        } },
      },
    }),
  ]);

  const dailyReservedCents = day._sum.reservedCents ?? 0;
  const monthlyReservedCents = month._sum.reservedCents ?? 0;
  return {
    settingsProvisioned: settings !== null,
    growthEnabled: settings?.enabled ?? false,
    aiDailyBudgetCents: settings?.aiDailyBudgetCents ?? null,
    aiMonthlyBudgetCents: settings?.aiMonthlyBudgetCents ?? null,
    imageDailyCap: settings?.aiImagesPerDayCap ?? null,
    dailyReservedCents,
    monthlyReservedCents,
    imagesReservedToday: images,
    outstandingReservations: outstanding,
    dailyPercent: percentOfBudget(dailyReservedCents, settings?.aiDailyBudgetCents),
    monthlyPercent: percentOfBudget(monthlyReservedCents, settings?.aiMonthlyBudgetCents),
    recent,
  };
}

export function percentOfBudget(committedCents: number, capCents: number | null | undefined): number | null {
  if (!Number.isSafeInteger(committedCents) || committedCents < 0 ||
      !Number.isSafeInteger(capCents) || !capCents || capCents <= 0) return null;
  return Math.round(committedCents * 1000 / capCents) / 10;
}
