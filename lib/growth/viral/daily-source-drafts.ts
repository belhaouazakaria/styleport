import { prisma } from "@/lib/prisma";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { rateSourceTranslator } from "@/lib/growth/viral/rating";
import { prepareOriginalSourcePinDraft } from "@/lib/growth/viral/source-publishing";

/**
 * PREPARE ONLY. The isolated AI runner generates truthful source-linked art for the
 * selected rotating account's editorial share. Does not set account/board,
 * approve, queue Pinterest writes or access third-party assets.
 *
 * All source concepts must already be discovered through the existing
 * robots-aware, once-per-day allowlisted catalog request.
 */
export async function prepareDailySourceCreativeDrafts(
  now: Date,
  aiRunner = false,
) {
  // Discovery remains a read-only research runner with no AI credentials.
  // Discovered concepts form the durable queue consumed by the isolated fresh runner.
  if (!aiRunner)
    return {
      status: "AI_RUNNER_REQUIRED" as const,
      created: 0,
      desired: 0,
      pinterestWrites: 0,
      aiCalls: 0,
    };
  if (!Number.isFinite(now.getTime())) throw Error("SOURCE_DAILY_DATE_INVALID");
  const policy = await prisma.growthViralProgramSettings.findUnique({
    where: { id: "global" },
    select: { mode: true },
  });
  if (policy?.mode !== "ACTIVE")
    return {
      status: "REVIEW_ONLY" as const,
      created: 0,
      desired: 0,
      pinterestWrites: 0,
      aiCalls: 0,
    };
  const rotation = await readDailyRotation(now);
  if (!rotation.accountId)
    return {
      status: "NO_ACCOUNT" as const,
      created: 0,
      desired: 0,
      pinterestWrites: 0,
      aiCalls: 0,
    };
  const day = now.toISOString().slice(0, 10);
  const start = new Date(day + "T00:00:00.000Z");
  const end = new Date(start.getTime() + 86_400_000);
  const already = await prisma.growthViralPinTest.count({
    where: { channel: "SOURCE", createdAt: { gte: start, lt: end } },
  });
  const remaining = Math.max(0, rotation.source - already);
  if (remaining === 0)
    return {
      status: "SATISFIED" as const,
      created: 0,
      desired: rotation.source,
      pinterestWrites: 0,
      aiCalls: 0,
    };
  const concepts = await prisma.growthViralConcept.findMany({
    where: {
      status: "DISCOVERED",
      linkedTranslatorId: null,
      pinTests: { none: { channel: "SOURCE", status: { not: "CANCELLED" } } },
    },
    select: { id: true, title: true, sourceUrl: true },
    orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
    take: 250,
  });
  const ranked = concepts
    .map((concept) => ({
      ...concept,
      rating: rateSourceTranslator(concept.title, concept.sourceUrl),
    }))
    .filter((item) => item.rating.decision === "PRIORITY")
    .sort(
      (a, b) =>
        b.rating.score - a.rating.score ||
        a.sourceUrl.localeCompare(b.sourceUrl),
    );
  if (process.env.GROWTH_V2_INTELLIGENCE_ENABLED === "true") {
    const { readNativeThemeOutcomes, nativeThemeAdjustment } =
      await import("./theme-learning");
    const outcomes = await readNativeThemeOutcomes(now);
    ranked.sort(
      (a, b) =>
        b.rating.score +
          nativeThemeAdjustment(b.title, outcomes).adjustment -
          (a.rating.score +
            nativeThemeAdjustment(a.title, outcomes).adjustment) ||
        a.sourceUrl.localeCompare(b.sourceUrl),
    );
    await prisma.growthActivity.create({
      data: {
        actorKind: "SYSTEM",
        entityType: "GrowthViralSource",
        entityId: day,
        action: "NATIVE_THEME_RESEARCH_RANKING_APPLIED",
        summary: {
          modelVersion: "native-theme-feedback-v1",
          selected: ranked
            .slice(0, remaining)
            .map((c) => ({
              conceptId: c.id,
              editorialScore: c.rating.score,
              feedback: nativeThemeAdjustment(c.title, outcomes),
            })),
          permissionOrBudgetChanges: false,
        },
      },
    });
  }
  const attempted = await prisma.growthAiBudgetReservation.findMany({
    where: {
      requestKey: {
        in: ranked.map((c) => "growth:creative:source-" + c.id + ":image-1"),
      },
    },
    select: { requestKey: true },
  });
  const attemptedKeys = new Set(attempted.map((a) => a.requestKey));
  const unattempted = ranked.filter(
    (c) => !attemptedKeys.has("growth:creative:source-" + c.id + ":image-1"),
  );
  let created = 0;
  for (const concept of unattempted.slice(0, Math.min(1, remaining))) {
    // Null system actor intentionally: a draft is not an admin approval.
    await prepareOriginalSourcePinDraft(concept.id, null);
    created++;
  }
  return {
    status:
      created > 0 ? ("PREPARED" as const) : ("NO_QUALIFIED_SOURCE" as const),
    created,
    desired: rotation.source,
    pinterestWrites: 0,
    aiCalls: created,
  };
}
