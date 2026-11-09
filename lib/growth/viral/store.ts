import { GrowthActivityActorKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { discoverAnythingTranslateTopics } from "@/lib/growth/viral/catalog";
import { normalizeTranslatorConcept } from "@/lib/growth/viral/niche";
import {
  viralPortfolioPolicySchema, type ViralPortfolioPolicy,
} from "@/lib/growth/viral/portfolio";

/** Reads only catalog URL/title data. Reserves at most one attempt per UTC day.
 * No third-party creative copy, AI, Pinterest mutations or link updates.
 */
export async function scanViralSourceCatalog(now = new Date(), fetchImpl?: typeof fetch) {
  const day = now.toISOString().slice(0, 10);
  const key = "viral-catalog:" + day;
  await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('growth-viral-catalog-v1'))");
    const settings = await tx.growthViralProgramSettings.findUnique({
      where: { id: "global" },
    });
    if (!settings || settings.mode === "PAUSED") throw Error("VIRAL_SOURCE_OWNER_PAUSED");
    const reserved = await tx.growthActivity.findFirst({
      where: { correlationKey: key, action: "CATALOG_SCAN_RESERVED" },
      select: { id: true },
    });
    if (reserved) throw Error("VIRAL_SOURCE_ALREADY_SCANNED_TODAY");
    await tx.growthActivity.create({
      data: { actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthViralSource", entityId: "anythingtranslate.com",
        action: "CATALOG_SCAN_RESERVED", correlationKey: key,
        summary: { day, mode: settings.mode, requestLimit: 2 },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  let topics;
  try {
    topics = await discoverAnythingTranslateTopics({
      ownerEnabled: true, dueToday: true, fetchImpl,
    });
  } catch {
    await prisma.growthActivity.create({
      data: { actorKind: GrowthActivityActorKind.SYSTEM,
        entityType: "GrowthViralSource", entityId: "anythingtranslate.com",
        action: "CATALOG_SCAN_FAILED", correlationKey: key,
        summary: { day, retriesAllowed: false, noPinterestWrites: true },
      },
    });
    throw Error("VIRAL_CATALOG_SOURCE_UNAVAILABLE");
  }

  const existingTranslators = await prisma.translator.findMany({
    where: { archivedAt: null }, select: { name: true, slug: true }, take: 10000,
  });
  const catalogKeys = new Set(existingTranslators.flatMap(x => [
    normalizeTranslatorConcept(x.name), normalizeTranslatorConcept(x.slug),
  ]));
  let created = 0, existing = 0, skipped = 0;
  for (const topic of topics) {
    const normalizedKey = normalizeTranslatorConcept(topic.title);
    if (normalizedKey.length < 3 || normalizedKey.length > 160 ||
        catalogKeys.has(normalizedKey)) { skipped++; continue; }
    const found = await prisma.growthViralConcept.findFirst({
      where: { OR: [{ normalizedKey }, { sourceUrl: topic.sourceUrl }] },
      select: { id: true, sourceUrl: true },
    });
    if (found) {
      if (found.sourceUrl !== topic.sourceUrl) { skipped++; continue; }
      await prisma.growthViralConcept.update({
        where: { id: found.id }, data: { lastSeenAt: now },
      });
      existing++; continue;
    }
    try {
      await prisma.growthViralConcept.create({
        data: { title: topic.title, normalizedKey, sourceUrl: topic.sourceUrl,
          firstSeenAt: now, lastSeenAt: now,
          status: "DISCOVERED", rightsVerified: false },
      });
      created++;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002") { skipped++; continue; }
      throw error;
    }
  }
  await prisma.growthActivity.create({
    data: { actorKind: GrowthActivityActorKind.SYSTEM,
      entityType: "GrowthViralSource", entityId: "anythingtranslate.com",
      action: "CATALOG_SCAN_ARCHIVED", correlationKey: key,
      summary: { day, inspected: topics.length, created, existing, skipped,
        pinsPublished: 0, linksChanged: 0, aiCalls: 0 },
    },
  });
  return { inspected: topics.length, created, existing, skipped,
    pinsPublished: 0, linksChanged: 0 };
}

export async function updateViralProgramSettings(
  policy: ViralPortfolioPolicy, userId: string,
) {
  const parsed = viralPortfolioPolicySchema.parse(policy);
  if (!userId) throw Error("VIRAL_OWNER_REQUIRED");
  return prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('growth-viral-settings-v1'))");
    const updated = await tx.growthViralProgramSettings.update({
      where: { id: "global" },
      data: { mode: parsed.mode,
        sourceSharePercent: parsed.sourceSharePercent,
        maxPinsPerDay: parsed.maxPinsPerDay,
        configVersion: { increment: 1 }, updatedById: userId },
    });
    await tx.growthActivity.create({
      data: { actorKind: GrowthActivityActorKind.USER,
        actorUserId: userId, entityType: "GrowthViralProgramSettings",
        entityId: "global", action: "VIRAL_PROGRAM_POLICY_CHANGED",
        correlationKey: "viral-settings-v" + updated.configVersion,
        summary: { mode: updated.mode,
          sourceSharePercent: updated.sourceSharePercent,
          maxPinsPerDay: updated.maxPinsPerDay,
          automaticallyApprovesPins: false, rewritesExistingLinks: false },
      },
    });
    return { mode: updated.mode,
      sourceSharePercent: updated.sourceSharePercent,
      maxPinsPerDay: updated.maxPinsPerDay,
      configVersion: updated.configVersion };
  });
}
