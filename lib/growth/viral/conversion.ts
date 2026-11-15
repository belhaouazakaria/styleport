import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyViralOpportunity, type ViralPinMetrics } from "./winners";
import { normalizeTranslatorConcept } from "./niche";
import { rateSourceTranslator } from "./rating";
import {
  TRANSLATOR_AUTOPILOT_VERSION,
  TRANSLATOR_QUALITY_VERSION,
  TRANSLATOR_DEDUPE_VERSION,
} from "@/lib/growth/translator/constants";

function count(value: bigint | null) {
  return value !== null &&
    value >= BigInt(0) &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : null;
}

/** Only official observations of our SOURCE Pin can justify native expansion.
 * The recorded source destination is never updated by this pipeline. */
export async function qualifiedViralEvidence(
  pinTestId: string,
  now = new Date(),
  tx: Prisma.TransactionClient = prisma,
) {
  const test = await tx.growthViralPinTest.findUnique({
    where: { id: pinTestId },
    include: { concept: true },
  });
  if (
    !test ||
    test.channel !== "SOURCE" ||
    !test.pinterestPinId ||
    !test.publishedAt ||
    !["PUBLISHED", "TRACKED"].includes(test.status) ||
    test.concept.status === "REJECTED"
  )
    return null;
  const pin = await tx.growthPinterestPin.findUnique({
    where: { pinterestPinId: test.pinterestPinId },
    select: {
      isActive: true,
      destinationUrl: true,
      accountId: true,
      account: { select: { connectionStatus: true, apiEnvironment: true } },
    },
  });
  if (
    !pin?.isActive ||
    pin.account.connectionStatus !== "CONNECTED" ||
    pin.account.apiEnvironment !== "PRODUCTION" ||
    (test.accountId && test.accountId !== pin.accountId) ||
    pin.destinationUrl !== test.destinationUrl ||
    test.destinationUrl !== test.concept.sourceUrl
  )
    return null;
  const latest = await tx.growthViralMetricObservation.findFirst({
    where: { pinTestId },
    orderBy: { observedAt: "desc" },
  });
  if (
    !latest ||
    !latest.windowStart ||
    !latest.windowEnd ||
    !latest.baselineImpressions
  )
    return null;
  const previous = await tx.growthViralMetricObservation.findFirst({
    where: {
      pinTestId,
      observedAt: { lte: new Date(latest.observedAt.getTime() - 86400000) },
    },
    orderBy: { observedAt: "desc" },
  });
  if (
    !previous?.windowStart ||
    !previous.windowEnd ||
    !previous.baselineImpressions
  )
    return null;
  if (
    latest.windowStart.getTime() !== previous.windowStart.getTime() ||
    latest.windowEnd < previous.windowEnd
  )
    return null;
  const metrics = (row: typeof latest): ViralPinMetrics => ({
    impressions: count(row.impressions),
    saves: count(row.saves),
    outboundClicks: count(row.outboundClicks),
    measuredAt: row.observedAt,
    publishedAt: test.publishedAt,
    baselineSaveRate: row.baselineSaveRate,
    baselineOutboundRate: row.baselineOutboundRate,
    baselineImpressions: count(row.baselineImpressions),
    baselineSaves: count(row.baselineSaves),
    baselineOutboundClicks: count(row.baselineOutboundClicks),
    pinterestDataStatus:
      row.pinterestDataStatus === "READY" ? "READY" : "MISSING",
  });
  const classified = classifyViralOpportunity(
    metrics(latest),
    previous ? metrics(previous) : null,
    now,
  );
  if (classified.stage !== "HIGH_CONFIDENCE_WINNER") return null;
  return { test, latest, previous: previous!, classified };
}

/** Durable lineage to the existing budgeted, quality-checked Translator executor.
 * Creating a decision is local preparation, never permission to spend or publish. */
export async function prepareViralWinnerConversions(now = new Date()) {
  const program = await prisma.growthViralProgramSettings.findUnique({
    where: { id: "global" },
  });
  if (program?.mode !== "ACTIVE") return { prepared: 0, status: "PAUSED" };
  const tests = await prisma.growthViralPinTest.findMany({
    where: {
      channel: "SOURCE",
      status: { in: ["PUBLISHED", "TRACKED"] },
      pinterestPinId: { not: null },
    },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
  let prepared = 0;
  for (const test of tests) {
    const qualified = await qualifiedViralEvidence(test.id, now);
    if (!qualified) continue;
    const rating = rateSourceTranslator(
      qualified.test.concept.title,
      qualified.test.concept.sourceUrl,
    );
    if (rating.decision !== "PRIORITY") continue;
    const changed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"viral-conversion:" + test.conceptId}))`;
      if (
        await tx.growthViralConversion.findUnique({
          where: { conceptId: test.conceptId },
        })
      )
        return false;
      const catalog = await tx.translator.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true, slug: true },
        take: 501,
      });
      if (catalog.length > 500) return false;
      const key = normalizeTranslatorConcept(qualified.test.concept.title);
      const matches = catalog.filter(
        (t) =>
          normalizeTranslatorConcept(t.name) === key ||
          normalizeTranslatorConcept(t.slug) === key,
      );
      if (matches.length > 1) return false;
      const existing = matches[0];
      const evidence = {
        sourceConceptId: test.conceptId,
        sourcePinTestId: test.id,
        sourcePinterestPinId: test.pinterestPinId,
        sourceUrl: qualified.test.concept.sourceUrl,
        currentObservationId: qualified.latest.id,
        previousObservationId: qualified.previous.id,
        stage: qualified.classified.stage,
        confidenceMethod: "95_PERCENT_WILSON_LOWER_BOUND_AND_PERSISTENCE",
        editorialFitScore: rating.score,
        copiedSourceContent: false,
      };
      const decision = existing
        ? null
        : await tx.growthDecision.create({
            data: {
              type: "CREATE_TRANSLATOR",
              status: "PROPOSED",
              idempotencyKey: "viral-native:" + test.conceptId,
              decisionModelVersion: TRANSLATOR_AUTOPILOT_VERSION,
              qualityModelVersion: TRANSLATOR_QUALITY_VERSION,
              dedupeModelVersion: TRANSLATOR_DEDUPE_VERSION,
              confidence: 95,
              reasonCodes: [
                "QUALIFIED_SOURCE_PIN_WINNER",
                "ORIGINAL_CONTENT_REQUIRED",
              ],
              evidence: {
                ...evidence,
                opportunityType: "EXPLORE_RISING_TOPIC",
                score: rating.score,
                confidence: 95,
                evidenceQuality: "KNOWN",
                clusterName: qualified.test.concept.title.replace(
                  /\s+translator$/i,
                  "",
                ),
                sourceReasonCodes: [
                  "ORIGINAL_CONTENT_REQUIRED",
                  "DO_NOT_COPY_SOURCE_PROMPTS",
                ],
                targetChecksum: null,
                representativePins: [
                  {
                    title: qualified.test.concept.title,
                    description:
                      "Develop an original, useful implementation of this audience interest. Do not copy source prompts, descriptions, assets or proprietary behavior.",
                    destinationPath: qualified.test.concept.sourceUrl,
                  },
                ],
                mappedTranslatorIds: [],
              },
            },
          });
      const conversion = await tx.growthViralConversion.create({
        data: {
          conceptId: test.conceptId,
          winningPinTestId: test.id,
          evidence,
          decisionId: decision?.id,
          translatorId: existing?.id,
          status: existing ? "EXISTING_TRANSLATOR" : "PROPOSED",
        },
      });
      await tx.growthActivity.create({
        data: {
          actorKind: "SYSTEM",
          entityType: "GrowthViralConversion",
          entityId: conversion.id,
          action: "VIRAL_NATIVE_PROPOSAL_PREPARED",
          summary: evidence,
        },
      });
      return true;
    });
    if (changed) prepared++;
  }
  return { prepared, status: "COMPLETE" };
}

/** Called at both generation and commit boundaries of the existing executor. */
export async function assertViralConversionEligible(
  decisionId: string,
  tx: Prisma.TransactionClient = prisma,
  now = new Date(),
) {
  const conversion = await tx.growthViralConversion.findUnique({
    where: { decisionId },
  });
  if (!conversion) return; // Ordinary Phase 8 decisions retain their own guards.
  const program = await tx.growthViralProgramSettings.findUnique({
    where: { id: "global" },
  });
  if (
    program?.mode !== "ACTIVE" ||
    !(await qualifiedViralEvidence(conversion.winningPinTestId, now, tx))
  )
    throw Error("VIRAL_CONVERSION_EVIDENCE_NO_LONGER_QUALIFIED");
}

/** Reconcile completed native content, then prepare a distinctly new campaign.
 * Active public content and existing Creative Lab quality/budget gates apply.
 * The resulting candidate still needs its own individual Pin approval. */
export async function reconcileViralConversions(now = new Date()) {
  const program = await prisma.growthViralProgramSettings.findUnique({
    where: { id: "global" },
  });
  if (program?.mode !== "ACTIVE") return { reconciled: 0 };
  const conversions = await prisma.growthViralConversion.findMany({
    where: {
      status: {
        in: [
          "PROPOSED",
          "EXISTING_TRANSLATOR",
          "TRANSLATOR_DRAFT",
          "NATIVE_READY",
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  let reconciled = 0;
  for (const row of conversions) {
    try {
      const decision = row.decisionId
        ? await prisma.growthDecision.findUnique({
            where: { id: row.decisionId },
          })
        : null;
      const translatorId =
        row.translatorId ??
        (decision?.status === "COMPLETED" ? decision.translatorId : null);
      if (!translatorId) continue;
      const t = await prisma.translator.findUnique({
        where: { id: translatorId },
        select: { isActive: true, archivedAt: true },
      });
      if (!t || t.archivedAt) continue;
      await prisma.$transaction(async (tx) => {
        await tx.growthViralConversion.update({
          where: { id: row.id },
          data: {
            translatorId,
            status: t.isActive ? "NATIVE_READY" : "TRANSLATOR_DRAFT",
          },
        });
        await tx.growthViralConcept.update({
          where: { id: row.conceptId },
          data: {
            linkedTranslatorId: translatorId,
            status: t.isActive ? "ACTIVE" : "PREPARING",
          },
        });
      });
      if (!t.isActive || !row.campaignJobId) continue;
      // The existing daily fresh-creative worker owns budgeted generation.
      // Reconcile its new candidate instead of leaving an orphan generation job
      // that would block other protected timers.
      const candidate = await prisma.growthPinCandidate.findFirst({
        where: {
          translatorId,
          createdAt: { gte: row.createdAt, lte: now },
          generationJobId: row.campaignJobId,
        },
        orderBy: { createdAt: "asc" },
        select: {
          generationJobId: true,
          status: true,
          asset: { select: { state: true } },
          generationJob: { select: { status: true } },
        },
      });
      if (!candidate?.generationJobId) continue;
      const ready =
        candidate.status === "READY" &&
        candidate.asset.state === "READY" &&
        candidate.generationJob?.status === "SUCCEEDED";
      await prisma.growthViralConversion.update({
        where: { id: row.id },
        data: {
          campaignJobId: candidate.generationJobId,
          status: ready ? "CAMPAIGN_PREPARED" : "NATIVE_READY",
          lastErrorCode: ready ? null : "NATIVE_CREATIVE_REQUIRES_REVIEW",
        },
      });
      if (ready) reconciled++;
    } catch {
      await prisma.growthViralConversion.update({
        where: { id: row.id },
        data: { lastErrorCode: "NATIVE_CAMPAIGN_BLOCKED" },
      });
    }
  }
  return { reconciled };
}
