import { GrowthActivityActorKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalSourceTranslatorUrl } from "@/lib/growth/viral/catalog";
import { evaluateViralWinner } from "@/lib/growth/viral/winners";
import { planNicheExpansion } from "@/lib/growth/viral/niche";

/** Register only a Pin already known to belong to our connected Pinterest
 * account. This action creates no Pin, has no Pinterest API call and copies no
 * third-party image. TRACKED is read-only, not publication approval.
 */
export async function trackOwnedViralPin(input: {
  conceptId: string; pinterestPinId: string;
}, adminUserId: string) {
  if (!adminUserId || !/^\d{5,24}$/.test(input.pinterestPinId) ||
      !/^[a-z0-9]{10,40}$/.test(input.conceptId)) {
    throw Error("VIRAL_PIN_TRACK_INPUT_INVALID");
  }
  return prisma.$transaction(async tx => {
    const [concept, pin, existing] = await Promise.all([
      tx.growthViralConcept.findUnique({
        where: { id: input.conceptId },
        select: { id: true, sourceUrl: true, linkedTranslatorId: true },
      }),
      tx.growthPinterestPin.findUnique({
        where: { pinterestPinId: input.pinterestPinId },
        select: { id: true, isActive: true, accountId: true,
          destinationUrl: true, publishedAt: true,
          account: { select: { connectionStatus: true,
            apiEnvironment: true } } },
      }),
      tx.growthViralPinTest.findUnique({
        where: { pinterestPinId: input.pinterestPinId }, select: { id: true },
      }),
    ]);
    if (!concept || !pin?.isActive || !pin.publishedAt ||
        pin.account.connectionStatus !== "CONNECTED" ||
        pin.account.apiEnvironment !== "PRODUCTION" || existing) {
      throw Error("VIRAL_PIN_NOT_ELIGIBLE_FOR_TRACKING");
    }
    const destination = pin.destinationUrl || "";
    let channel: "SOURCE" | "SAYTWIST";
    if (canonicalSourceTranslatorUrl(destination) === concept.sourceUrl) {
      channel = "SOURCE";
    } else {
      let url: URL;
      try { url = new URL(destination); }
      catch { throw Error("VIRAL_PIN_UNEXPECTED_DESTINATION"); }
      if (url.protocol !== "https:" || url.hostname !== "saytwist.com" ||
          !/^\/translators\/[a-z0-9-]+\/?$/.test(url.pathname) ||
          !concept.linkedTranslatorId) {
        throw Error("VIRAL_PIN_UNEXPECTED_DESTINATION");
      }
      const translator = await tx.translator.findUnique({
        where: { id: concept.linkedTranslatorId },
        select: { slug: true, isActive: true, archivedAt: true },
      });
      if (!translator?.isActive || translator.archivedAt ||
          url.pathname.replace(/\/$/, "") !== "/translators/" + translator.slug) {
        throw Error("VIRAL_PIN_NO_MATCHING_TRANSLATOR");
      }
      channel = "SAYTWIST";
    }
    const test = await tx.growthViralPinTest.create({
      data: { conceptId: concept.id, channel, destinationUrl: destination,
        pinterestPinId: pin.id ? input.pinterestPinId : null,
        status: "TRACKED", publishedAt: pin.publishedAt,
        rightsVerified: false, approvedById: adminUserId },
    });
    await tx.growthActivity.create({
      data: { actorKind: GrowthActivityActorKind.USER,
        actorUserId: adminUserId, entityType: "GrowthViralPinTest",
        entityId: test.id, action: "OWNED_PIN_REGISTERED_READ_ONLY",
        correlationKey: "viral-track:" + input.pinterestPinId,
        summary: { channel, sourcePinId: input.pinterestPinId,
          existingPinterestPinOwned: true, pinWrites: 0,
          imageRightsNotInferred: true, destinationEditAllowed: false },
      },
    });
    return { testId: test.id, channel, status: "TRACKED" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function safeCount(value: bigint | null): number | null {
  if (value === null || value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

/** Refresh from existing, previously authorized Pinterest analytics storage.
 * One immutable observation per provider summary timestamp. No live API calls.
 */
export async function evaluateTrackedViralPins(now = new Date()) {
  const settings = await prisma.growthViralProgramSettings.findUnique({
    where: { id: "global" }, select: { mode: true },
  });
  if (!settings || settings.mode === "PAUSED") throw Error("VIRAL_OWNER_PAUSED");
  const tests = await prisma.growthViralPinTest.findMany({
    where: { status: { in: ["TRACKED", "PUBLISHED"] }, pinterestPinId: { not: null } },
    orderBy: { createdAt: "asc" }, take: 50,
  });
  let observed = 0, winners = 0, incomplete = 0;
  for (const test of tests) {
    const pin = await prisma.growthPinterestPin.findUnique({
      where: { pinterestPinId: test.pinterestPinId! },
      select: { accountId: true, isActive: true, destinationUrl: true,
        publishedAt: true,
        summaryFetchedAt: true, summaryEndDate: true,
        summaryImpressions: true, summarySaves: true,
        summaryOutboundClicks: true },
    });
    // If destination was edited outside our system, exclude old Pin evidence:
    // it cannot be used to attribute the old source domain to SayTwist.
    if (!pin || !pin.isActive ||
        pin.destinationUrl !== test.destinationUrl ||
        !pin.summaryFetchedAt || !pin.publishedAt) {
      incomplete++; continue;
    }
    const existing = await prisma.growthViralMetricObservation.findUnique({
      where: { pinTestId_observedAt: {
        pinTestId: test.id, observedAt: pin.summaryFetchedAt,
      } },
      select: { id: true },
    });
    if (existing) continue;
    const days = await prisma.growthPinterestAccountMetricDaily.findMany({
      where: { accountId: pin.accountId, dataStatus: "READY",
        metricDate: { gte: new Date(now.getTime() - 7 * 86400000),
          lte: now }, fetchedAt: { gte: new Date(now.getTime() - 48 * 3600000) } },
      select: { impressions: true, saves: true, outboundClicks: true },
      take: 8,
    });
    const totals = days.reduce((a, day) => ({
      impressions: a.impressions + day.impressions,
      saves: a.saves + day.saves, outbound: a.outbound + day.outboundClicks,
    }), { impressions: BigInt(0), saves: BigInt(0), outbound: BigInt(0) });
    const baseline = days.length >= 3 && totals.impressions > BigInt(0) &&
      totals.impressions <= BigInt(Number.MAX_SAFE_INTEGER);
    const bSave = baseline ? Number(totals.saves) / Number(totals.impressions) : null;
    const bOutbound = baseline ? Number(totals.outbound) / Number(totals.impressions) : null;
    const status = pin.summaryEndDate &&
      now.getTime() - pin.summaryEndDate.getTime() < 8 * 86400000 ?
      "READY" as const : "MISSING" as const;
    const evidence = {
      impressions: safeCount(pin.summaryImpressions),
      saves: safeCount(pin.summarySaves),
      outboundClicks: safeCount(pin.summaryOutboundClicks),
      measuredAt: pin.summaryFetchedAt, publishedAt: pin.publishedAt,
      baselineSaveRate: bSave, baselineOutboundRate: bOutbound,
      pinterestDataStatus: status,
    };
    const decision = evaluateViralWinner(evidence, now);
    try {
      await prisma.growthViralMetricObservation.create({
        data: { pinTestId: test.id, observedAt: pin.summaryFetchedAt,
          pinterestDataStatus: status,
          impressions: pin.summaryImpressions, saves: pin.summarySaves,
          outboundClicks: pin.summaryOutboundClicks,
          baselineSaveRate: bSave, baselineOutboundRate: bOutbound },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002") continue;
      throw error;
    }
    observed++;
    if (decision.status !== "WINNER") { incomplete++; continue; }
    const changed = await prisma.growthViralConcept.updateMany({
      where: { id: test.conceptId,
        status: { in: ["DISCOVERED", "REVIEW", "TESTING"] } },
      data: { status: "WINNER" },
    });
    if (changed.count === 1) winners++;
    await prisma.growthActivity.create({
      data: { actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthViralConcept", entityId: test.conceptId,
        action: "OWNED_PIN_WINNER_DETECTED",
        correlationKey: "viral-winner:" + test.id + ":" +
          pin.summaryFetchedAt.toISOString(),
        summary: { pinTestId: test.id, decision: decision.status,
          source: "OFFICIAL_SAVED_OWNED_PIN_ANALYTICS",
          saveRate: decision.saveRate, outboundRate: decision.outboundRate,
          saveLift: decision.saveLift, outboundLift: decision.outboundLift,
          newPinsPublished: 0, automaticTranslatorPublication: false },
      },
    });
  }
  return { scanned: tests.length, observationsArchived: observed,
    newlyQualifiedWinners: winners, incomplete,
    automaticPinWrites: 0, automaticTranslatorPublishes: 0 };
}

/** Persist bounded original concepts, not third-party prompts or artwork. */
export async function prepareNicheProposals(
  conceptId: string, proposals: unknown[], maxNew = 3,
) {
  const program = await prisma.growthViralProgramSettings.findUnique({
    where: { id: "global" }, select: { mode: true },
  });
  const winner = await prisma.growthViralConcept.findUnique({
    where: { id: conceptId }, select: { title: true, status: true },
  });
  if (!winner || winner.status !== "WINNER" || !program ||
      program.mode === "PAUSED") throw Error("VIRAL_NICHE_NOT_QUALIFIED");
  const [existing, otherProposals] = await Promise.all([
    prisma.translator.findMany({
      where: { archivedAt: null }, select: { name: true }, take: 10000,
    }),
    prisma.growthViralNicheProposal.findMany({
      where: { conceptId }, select: { title: true }, take: 100,
    }),
  ]);
  const plan = planNicheExpansion(winner.title, proposals,
    [...existing.map(x => x.name), ...otherProposals.map(x => x.title)], maxNew);
  let created = 0;
  for (const suggestion of plan.suggestions) {
    try {
      await prisma.growthViralNicheProposal.create({
        data: { conceptId, title: suggestion.title,
          normalizedKey: suggestion.normalizedKey,
          intent: suggestion.intent, relationship: suggestion.relationship,
          evidence: suggestion.evidence, status: "PROPOSED" },
      });
      created++;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002") continue;
      throw error;
    }
  }
  return { created, skipped: plan.skipped.length,
    translatorPublished: 0, pinPublished: 0, requiresQualityReview: true };
}
