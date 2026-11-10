import { prisma } from "@/lib/prisma";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { rateSourceTranslator } from "@/lib/growth/viral/rating";
import { prepareOriginalSourcePinDraft } from "@/lib/growth/viral/source-publishing";

/**
 * PREPARE ONLY. Generate original, truthful, source-linked art for the
 * selected rotating account's editorial share. Does not set account/board,
 * approve, queue provider writes or access third-party assets.
 *
 * All source concepts must already be discovered through the existing
 * robots-aware, once-per-day allowlisted catalog request.
 */
export async function prepareDailySourceCreativeDrafts(now: Date) {
  if (!Number.isFinite(now.getTime())) throw Error("SOURCE_DAILY_DATE_INVALID");
  const policy = await prisma.growthViralProgramSettings.findUnique({
    where: { id: "global" }, select: { mode: true, sourceSharePercent: true },
  });
  if (policy?.mode !== "ACTIVE") return {
    status: "REVIEW_ONLY" as const, created: 0, desired: 0,
    pinterestWrites: 0, aiCalls: 0,
  };
  if (policy.sourceSharePercent !== 50) {
    throw Error("SOURCE_DAILY_ALLOCATION_NOT_APPROVED");
  }
  const rotation = await readDailyRotation(now);
  if (!rotation.accountId) return {
    status: "NO_ACCOUNT" as const, created: 0, desired: 0,
    pinterestWrites: 0, aiCalls: 0,
  };
  const day = now.toISOString().slice(0, 10);
  const start = new Date(day + "T00:00:00.000Z");
  const end = new Date(start.getTime() + 86_400_000);
  const already = await prisma.growthViralPinTest.count({
    where: { channel: "SOURCE", createdAt: { gte: start, lt: end } },
  });
  const remaining = Math.max(0, rotation.source - already);
  if (remaining === 0) return {
    status: "SATISFIED" as const, created: 0, desired: rotation.source,
    pinterestWrites: 0, aiCalls: 0,
  };
  const concepts = await prisma.growthViralConcept.findMany({
    where: {
      status: "DISCOVERED", linkedTranslatorId: null,
      pinTests: { none: { channel: "SOURCE" } },
    },
    select: { id: true, title: true, sourceUrl: true },
    orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
    take: 250,
  });
  const ranked = concepts.map(concept => ({
    ...concept,
    rating: rateSourceTranslator(concept.title, concept.sourceUrl),
  })).filter(item => item.rating.decision === "PRIORITY")
    .sort((a, b) => b.rating.score - a.rating.score ||
      a.sourceUrl.localeCompare(b.sourceUrl));
  let created = 0;
  for (const concept of ranked.slice(0, remaining)) {
    // Null system actor intentionally: a draft is not an admin approval.
    await prepareOriginalSourcePinDraft(concept.id, null);
    created++;
  }
  return {
    status: created > 0 ? "PREPARED" as const : "NO_QUALIFIED_SOURCE" as const,
    created, desired: rotation.source, pinterestWrites: 0, aiCalls: 0,
  };
}
