import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { diversifyTargets } from "@/lib/growth/viral/target-diversity";

type Reader = Pick<
  Prisma.TransactionClient,
  | "translator"
  | "growthViralConversion"
  | "growthViralProgramSettings"
  | "growthPinCandidate"
  | "$queryRaw"
>;

/** The budgeted daily worker may revisit an old Translator only for a new,
 * active conversion with no bound generation attempt. Ordinary
 * exploration retains its never-promoted filter. Failed/uncertain paid work
 * is not silently retried merely because another day has begun. */
export async function readFreshCreativeTargets(
  v2: boolean,
  db: Reader = prisma,
) {
  const program = v2
    ? await db.growthViralProgramSettings.findUnique({
        where: { id: "global" },
        select: { mode: true },
      })
    : null;
  const conversions =
    program?.mode === "ACTIVE"
      ? await db.growthViralConversion.findMany({
          where: {
            status: { in: ["NATIVE_READY", "EXISTING_TRANSLATOR"] },
            translatorId: { not: null },
            campaignJobId: null,
          },
          select: { id: true, translatorId: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 100,
        })
      : [];
  const reserved =
    program?.mode === "ACTIVE"
      ? await db.growthViralConversion.findMany({
          where: {
            status: { in: ["NATIVE_READY", "EXISTING_TRANSLATOR"] },
            campaignJobId: { not: null },
            translatorId: { not: null },
          },
          select: { translatorId: true },
          take: 1001,
        })
      : [];
  if (reserved.length > 1000) return [];
  const reservedIds = reserved.map((r) => r.translatorId!);
  const byTranslator = new Map<string, (typeof conversions)[number]>();
  for (const conversion of conversions)
    if (!byTranslator.has(conversion.translatorId!))
      byTranslator.set(conversion.translatorId!, conversion);
  const targets = await db.translator.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      editorialExamples: { some: {} },
      OR: [
        { id: { notIn: reservedIds }, growthPinCandidates: { none: {} } },
        ...conversions.map((c) => ({ id: c.translatorId! })),
      ],
    },
    select: {
      id: true,
      slug: true,
      shortDescription: true,
      isFeatured: true,
      sortOrder: true,
      editorialExamples: {
        select: { originalText: true, transformedText: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { slug: "asc" }],
    take: 150,
  });
  // Fetch conversion targets explicitly too: they must not be lost behind the
  // first 150 never-promoted catalog entries before priority sorting.
  const missing = [...byTranslator.keys()].filter(
    (id) => !targets.some((t) => t.id === id),
  );
  if (missing.length)
    targets.push(
      ...(await db.translator.findMany({
        where: {
          isActive: true,
          archivedAt: null,
          editorialExamples: { some: {} },
          OR: conversions
            .filter((c) => missing.includes(c.translatorId!))
            .map((c) => ({ id: c.translatorId! })),
        },
        select: {
          id: true,
          slug: true,
          shortDescription: true,
          isFeatured: true,
          sortOrder: true,
          editorialExamples: {
            select: { originalText: true, transformedText: true },
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
        },
        take: 100,
      })),
    );
  const prioritized = targets
    .map((t) => ({ ...t, conversionId: byTranslator.get(t.id)?.id }))
    .sort(
      (a, b) =>
        Number(Boolean(b.conversionId)) - Number(Boolean(a.conversionId)),
    );
  return diversifyFreshTargets(prioritized, db);
}

/** Conversion targets keep their priority. Everything else is spread across
 * themes, favours pages with unique content and lets a recently promoted theme
 * wait, instead of walking the catalogue alphabetically. */
async function diversifyFreshTargets<
  T extends { id: string; slug: string; conversionId?: string },
>(targets: T[], db: Reader): Promise<T[]> {
  const converted = targets.filter((t) => t.conversionId);
  const rest = targets.filter((t) => !t.conversionId);
  if (rest.length < 2) return targets;
  try {
    const since = new Date(Date.now() - 14 * 86_400_000);
    const [recent, withPage] = await Promise.all([
      db.growthPinCandidate.findMany({
        where: { createdAt: { gte: since }, translatorId: { not: null } },
        select: { translator: { select: { slug: true } } },
        take: 200,
      }),
      db.$queryRaw<Array<{ translatorId: string }>>(Prisma.sql`
        SELECT DISTINCT "translatorId" FROM "TranslatorEditorialDraft"
        WHERE status = 'PUBLISHED' AND jsonb_typeof(payload->'page') = 'object'
      `),
    ]);
    const uniqueIds = new Set(withPage.map((row) => row.translatorId));
    const bySlug = new Map(rest.map((t) => [t.slug, t]));
    const ordered = diversifyTargets(
      rest.map((t) => ({ slug: t.slug, hasUniquePage: uniqueIds.has(t.id) })),
      recent.map((row) => row.translator?.slug).filter((s): s is string => Boolean(s)),
    ).map((t) => bySlug.get(t.slug)!);
    return [...converted, ...ordered];
  } catch {
    return targets;
  }
}

/** Persist the conversion/job link before any paid dispatch. A crash after
 * enqueue but before this transaction leaves a blocking unclaimed job, never
 * permission for another paid attempt on a different day or account. */
export async function bindNativeCampaignJob(
  conversionId: string,
  translatorId: string,
  jobId: string,
) {
  return prisma.$transaction(async (tx) => {
    const program = await tx.growthViralProgramSettings.findUnique({
      where: { id: "global" },
      select: { mode: true },
    });
    const job = await tx.growthJob.findUnique({ where: { id: jobId } });
    const payload = job?.payload as {
      targetKind?: unknown;
      targetId?: unknown;
    } | null;
    const validJob =
      job?.type === "CREATIVE_LAB_GENERATE" &&
      job.status === "PENDING" &&
      job.attemptCount === 0 &&
      job.maxAttempts === 1 &&
      payload?.targetKind === "TRANSLATOR" &&
      payload.targetId === translatorId;
    const bound =
      program?.mode === "ACTIVE" && validJob
        ? await tx.growthViralConversion.updateMany({
            where: {
              id: conversionId,
              translatorId,
              campaignJobId: null,
              status: { in: ["NATIVE_READY", "EXISTING_TRANSLATOR"] },
            },
            data: { campaignJobId: jobId },
          })
        : { count: 0 };
    if (bound.count !== 1) {
      await tx.growthJob.updateMany({
        where: {
          id: jobId,
          type: "CREATIVE_LAB_GENERATE",
          status: "PENDING",
          attemptCount: 0,
        },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          lastError: "Native conversion changed before paid dispatch.",
        },
      });
      return false;
    }
    await tx.growthActivity.create({
      data: {
        actorKind: "SYSTEM",
        entityType: "GrowthViralConversion",
        entityId: conversionId,
        action: "NATIVE_CAMPAIGN_JOB_BOUND",
        summary: { jobId, translatorId, paidDispatchStarted: false },
      },
    });
    return true;
  });
}
