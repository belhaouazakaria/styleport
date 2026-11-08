import { readFileSync } from "node:fs";
import os from "node:os";
import {
  GrowthActivityActorKind, GrowthContentSideEffectStatus,
  GrowthContentVersionAction, GrowthDecisionStatus, Prisma,
} from "@prisma/client";

import { invalidatePublicTranslatorCaches } from "@/lib/data/translator-cache-invalidation";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { MAX_DEDUPE_CANDIDATES } from "@/lib/growth/translator/constants";
import { classifyTranslatorDuplicate } from "@/lib/growth/translator/dedupe";
import { validateTranslatorQuality } from "@/lib/growth/translator/quality";
import {
  readTranslatorSnapshot, snapshotToTranslatorInput,
  type TranslatorSnapshot,
} from "@/lib/growth/translator/snapshot";
import { prisma } from "@/lib/prisma";

const APP = "/home/saytwist/htdocs/saytwist.com";
const NODE = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node";
const ONE_DAY = 86_400_000;
const MAX_AGE = 72 * 60 * 60_000;

/** Website-side publication, not Pinterest publishing.
 * This independent opt-in runner uses no AI or Pinterest provider credentials.
 */
export function assertAutoTranslatorPublishRuntime(
  env: Record<string, string | undefined>,
  deployedSha: string,
  identity: { username: string; uid: number; cwd: string; node: string },
  now = new Date(),
) {
  const sha = env.EXPECTED_RELEASE || "";
  const day = env.GROWTH_TRANSLATOR_PUBLISH_DAY || "";
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== deployedSha ||
      env.GROWTH_TRANSLATOR_PUBLISH_ENABLED !== "true" ||
      env.GROWTH_TRANSLATOR_PUBLISH_APPROVAL !==
        "SAYTWIST_AUTONOMOUS_TRANSLATOR_PUBLICATION:" + sha ||
      env.NODE_ENV !== "production" ||
      day !== now.toISOString().slice(0, 10) ||
      !(now.getUTCHours() === 6 && now.getUTCMinutes() >= 57 &&
        now.getUTCMinutes() < 59)) {
    throw Error("AUTO_TRANSLATOR_PUBLISH_RELEASE_OR_CLOCK");
  }
  if (identity.username !== "saytwist" || identity.uid === 0 ||
      identity.cwd !== APP || identity.node !== NODE) {
    throw Error("AUTO_TRANSLATOR_PUBLISH_IDENTITY");
  }
  for (const flag of [
    "GROWTH_WORKER_RUN_ENABLED", "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
    "TELEGRAM_REPORTS_ENABLED", "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
    "GROWTH_AI_IMAGE_ENABLED",
  ]) if (env[flag] === "true") throw Error("AUTO_TRANSLATOR_PUBLISH_UNEXPECTED_AUTOMATION");
  if (env.GROWTH_ROLLOUT_MODE !== "OFF" ||
      env.APP_BASE_URL !== "https://saytwist.com") {
    throw Error("AUTO_TRANSLATOR_PUBLISH_ENV");
  }
  const url = new URL(env.DATABASE_URL || "");
  if (![ "postgres:", "postgresql:" ].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5433" ||
      decodeURIComponent(url.pathname.slice(1)) !== "saytwist" ||
      url.searchParams.has("host") || !url.username) {
    throw Error("AUTO_TRANSLATOR_PUBLISH_DATABASE");
  }
  return { sha, day };
}

export function strictPublicTranslatorSeo(snapshot: TranslatorSnapshot) {
  const title = (snapshot.seoTitle || "").trim();
  const description = (snapshot.seoDescription || "").trim();
  const slug = snapshot.slug;
  const about = (snapshot.editorial.about || "").trim();
  const whatItDoes = (snapshot.editorial.whatItDoes || "").trim();
  // Fail closed for incomplete generic pages. The upstream LLM validator
  // checks all other content quality, categories and prompt semantics.
  return title.length >= 25 && title.length <= 75 &&
    description.length >= 70 && description.length <= 170 &&
    /^[-a-z0-9]{3,80}$/.test(slug) &&
    about.length >= 80 && whatItDoes.length >= 80 &&
    snapshot.editorial.examples.length >= 2 &&
    snapshot.editorial.faq.length >= 2 &&
    snapshot.primaryCategoryId !== null &&
    snapshot.categories.some(x => x.id === snapshot.primaryCategoryId);
}

export async function activateOneQualifiedGrowthTranslator(day: string, now = new Date()) {
  if (day !== now.toISOString().slice(0, 10)) throw Error("AUTO_TRANSLATOR_DAY_CHANGED");
  const start = new Date(day + "T00:00:00Z");
  if (!Number.isFinite(start.getTime())) throw Error("AUTO_TRANSLATOR_DAY_INVALID");
  const outcome = await prisma.$transaction(async tx => {
    // Coordinate against the original content creation lock and the global
    // activation lease. No broad worker activation or external calls.
    await tx.$queryRaw`SELECT "id" FROM "GrowthSettings"
      WHERE "id" = 'global' FOR UPDATE`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('growth-translator-create-v1'))`;
    const [settings, blockers, publishedToday] = await Promise.all([
      tx.growthSettings.findUnique({ where: { id: "global" },
        select: { enabled: true, attributionEnabled: true,
          workerActivationExpiresAt: true } }),
      countBlockingGrowthJobs(tx),
      tx.growthActivity.count({
        where: { entityType: "Translator", action: "TRANSLATOR_AUTONOMOUSLY_PUBLISHED",
          createdAt: { gte: start } },
      }),
    ]);
    if (!settings || settings.enabled || settings.attributionEnabled ||
        settings.workerActivationExpiresAt !== null || blockers !== 0) {
      throw Error("AUTO_TRANSLATOR_GROWTH_NOT_IDLE");
    }
    if (publishedToday >= 1) return "SATISFIED" as const;

    const versions = await tx.growthContentVersion.findMany({
      where: {
        action: GrowthContentVersionAction.CREATE,
        actorKind: GrowthActivityActorKind.WORKER,
        sideEffectStatus: { in: [
          GrowthContentSideEffectStatus.SYNCHRONIZED,
          GrowthContentSideEffectStatus.NOT_REQUIRED,
        ] },
        createdAt: { gte: new Date(now.getTime() - MAX_AGE), lte: now },
        translator: { isActive: false, archivedAt: null },
        decision: { is: { status: GrowthDecisionStatus.COMPLETED } },
      },
      select: { id: true, translatorId: true, checksum: true, version: true,
        decisionId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 2,
    });
    if (versions.length === 0) return "NONE" as const;
    const version = versions[0];
    if (version.version !== 1 || !version.decisionId) return "INELIGIBLE" as const;
    await tx.$queryRaw`SELECT "id" FROM "Translator" WHERE "id" = ${version.translatorId} FOR UPDATE`;
    const fresh = await readTranslatorSnapshot(version.translatorId, tx);
    if (!fresh || fresh.translator.isActive || fresh.translator.archivedAt ||
        fresh.checksum !== version.checksum) return "INELIGIBLE" as const;
    const latest = await tx.growthContentVersion.findFirst({
      where: { translatorId: version.translatorId },
      select: { id: true }, orderBy: [{ version: "desc" }],
    });
    if (latest?.id !== version.id) return "INELIGIBLE" as const;

    const safeCategoryIds = await tx.category.findMany({
      where: { id: { in: fresh.snapshot.categories.map(x => x.id) },
        isActive: true, archivedAt: null }, select: { id: true },
    });
    if (safeCategoryIds.length !== fresh.snapshot.categories.length ||
        !strictPublicTranslatorSeo(fresh.snapshot)) {
      return "INELIGIBLE" as const;
    }
    const quality = validateTranslatorQuality(snapshotToTranslatorInput(fresh.snapshot), {
      activeCategoryIds: new Set(safeCategoryIds.map(x => x.id)),
    });
    if (!quality.valid) return "INELIGIBLE" as const;

    const peers = await tx.translator.findMany({
      where: { id: { not: version.translatorId }, archivedAt: null },
      select: { id: true, name: true, slug: true, archivedAt: true,
        promptInstructions: true, sourceLabel: true, targetLabel: true,
        categories: { select: { category: { select: { slug: true } } } } },
      orderBy: [{ slug: "asc" }], take: MAX_DEDUPE_CANDIDATES + 1,
    });
    if (peers.length > MAX_DEDUPE_CANDIDATES) return "INELIGIBLE" as const;
    const duplicate = classifyTranslatorDuplicate({
      name: fresh.snapshot.name, slug: fresh.snapshot.slug,
      promptPurpose: fresh.snapshot.promptInstructions,
      sourceLabel: fresh.snapshot.sourceLabel,
      targetLabel: fresh.snapshot.targetLabel,
      categorySlugs: fresh.snapshot.categories.map(x => x.slug),
      archivedAt: null,
    }, peers.map(p => ({
      id: p.id, name: p.name, slug: p.slug,
      promptPurpose: p.promptInstructions, sourceLabel: p.sourceLabel,
      targetLabel: p.targetLabel, archivedAt: p.archivedAt,
      categorySlugs: p.categories.map(c => c.category.slug),
    })));
    if (duplicate.classification !== "DISTINCT" &&
        duplicate.classification !== "RELATED_DISTINCT") {
      return "INELIGIBLE" as const;
    }
    const published = await tx.translator.updateMany({
      where: { id: version.translatorId, isActive: false, archivedAt: null },
      data: { isActive: true },
    });
    if (published.count !== 1) throw Error("AUTO_TRANSLATOR_PUBLISH_RACE");
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.SYSTEM,
      entityType: "Translator", entityId: version.translatorId,
      action: "TRANSLATOR_AUTONOMOUSLY_PUBLISHED",
      correlationKey: "growth-translator-auto-publish-v1:" + day,
      fromState: "INACTIVE", toState: "ACTIVE",
      summary: { versionId: version.id, checksum: version.checksum,
        qualityModel: "strict-public-seo-v1", originalCreation: true },
    }, tx);
    return "PUBLISHED" as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  if (outcome === "PUBLISHED") invalidatePublicTranslatorCaches();
  return outcome;
}

async function main() {
  try {
    const { day } = assertAutoTranslatorPublishRuntime(
      process.env, readFileSync(APP + "/.deployed-release", "utf8").trim(),
      { username: os.userInfo().username, uid: process.getuid?.() ?? -1,
        cwd: process.cwd(), node: process.execPath },
    );
    const status = await activateOneQualifiedGrowthTranslator(day);
    console.log("GROWTH_AUTO_TRANSLATOR_PUBLICATION=" + status);
    console.log("GROWTH_AUTO_TRANSLATOR_PINS_PUBLISHED=0");
    console.log("GROWTH_AUTO_TRANSLATOR_AI_CALLS=0");
    console.log("GROWTH_AUTO_TRANSLATOR_GROWTH=OFF");
  } catch {
    console.error("GROWTH_AUTO_TRANSLATOR_PUBLICATION=BLOCKED");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }
}
if (process.env.GROWTH_AUTO_TRANSLATOR_PUBLISH_ENTRYPOINT === "true") void main();
