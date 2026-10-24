import { GrowthAiOperationKind, GrowthAiUsageOutcome } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { GROWTH_TEXT_PRICE_VERSION } from "@/lib/growth/economics/text-admission";

/**
 * Only a response with valid usage can produce a token-based *estimate*.
 * This is a conservative uncached standard-rate estimate, not a provider
 * invoice, validated actual charge, or authorization to refund a reservation.
 * Model: gpt-4.1-mini; $0.40/M input, $1.60/M output (2026-10-24 profile).
 */
export function estimateGrowthTextMicroUsd(input: {
  model: string;
  pricingVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
}): bigint | null {
  if (input.model !== "gpt-4.1-mini" ||
      input.pricingVersion !== GROWTH_TEXT_PRICE_VERSION ||
      input.inputTokens === null || input.outputTokens === null ||
      !Number.isSafeInteger(input.inputTokens) || !Number.isSafeInteger(input.outputTokens) ||
      input.inputTokens < 0 || input.outputTokens < 0 ||
      input.inputTokens > 10_000_000 || input.outputTokens > 10_000_000) return null;
  const units = BigInt(2) * BigInt(input.inputTokens) + BigInt(8) * BigInt(input.outputTokens);
  return (units + BigInt(4)) / BigInt(5);
}

function validTokenCount(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isSafeInteger(value) &&
    value >= 0 && value <= 10_000_000;
}

type GrowthAiResponseEvidence = {
  reservationId: string;
  outcome: "RESPONSE_RECEIVED";
  responseId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  imageUnits?: number | null;
};
type GrowthAiUnknownEvidence = {
  reservationId: string;
  outcome: "OUTCOME_UNKNOWN";
};

/**
 * Append one immutable event for one durable reservation. No HTTP requests,
 * provider secrets, prompts or response text are persisted. Database unique
 * constraint and trigger disallow double booking or rewriting evidence.
 */
export async function appendGrowthAiUsageEvidence(
  event: GrowthAiResponseEvidence | GrowthAiUnknownEvidence,
) {
  if (!event.reservationId || event.reservationId.length > 191) {
    throw new Error("Invalid Growth AI reservation evidence ID");
  }
  const reservation = await prisma.growthAiBudgetReservation.findUnique({
    where: { id: event.reservationId },
    select: { id: true, kind: true, model: true, pricingVersion: true },
  });
  if (!reservation) throw new Error("Growth AI reservation evidence missing");
  if (event.outcome === "OUTCOME_UNKNOWN") {
    return prisma.growthAiUsageEvent.create({
      data: { reservationId: reservation.id, outcome: GrowthAiUsageOutcome.OUTCOME_UNKNOWN },
    });
  }
  const validResponseId = event.responseId === undefined || event.responseId === null ||
    (/^[A-Za-z0-9_-]{1,191}$/.test(event.responseId));
  if (!validResponseId) throw new Error("Invalid Growth AI provider response ID");
  for (const count of [event.inputTokens, event.outputTokens, event.totalTokens, event.imageUnits]) {
    if (count !== null && count !== undefined && !validTokenCount(count)) {
      throw new Error("Invalid Growth AI provider usage counter");
    }
  }
  if (reservation.kind === GrowthAiOperationKind.TEXT && event.imageUnits != null) {
    throw new Error("Unexpected image units in text response");
  }
  if (reservation.kind === GrowthAiOperationKind.IMAGE &&
      (event.inputTokens != null || event.outputTokens != null || event.totalTokens != null)) {
    // Image API pricing needs its separate modality-specific usage profile.
    throw new Error("Unsupported image token usage evidence");
  }
  const inputTokens = event.inputTokens ?? null;
  const outputTokens = event.outputTokens ?? null;
  const estimatedMicroUsd = reservation.kind === GrowthAiOperationKind.TEXT
    ? estimateGrowthTextMicroUsd({
        model: reservation.model, pricingVersion: reservation.pricingVersion,
        inputTokens, outputTokens,
      }) : null;
  return prisma.growthAiUsageEvent.create({
    data: {
      reservationId: reservation.id,
      outcome: GrowthAiUsageOutcome.RESPONSE_RECEIVED,
      providerResponseId: event.responseId ?? null,
      inputTokens,
      outputTokens,
      totalTokens: event.totalTokens ?? null,
      imageUnits: event.imageUnits ?? null,
      estimatedMicroUsd,
    },
  });
}
