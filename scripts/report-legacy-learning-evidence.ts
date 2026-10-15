import { MAX_LEARNING_PIN_EVIDENCE } from "@/lib/growth/learning/constants";
import {
  potentialLegacyTranslatorSlug,
  validateLegacyPinDestination,
} from "@/lib/growth/learning/legacy-evidence";
import { prisma } from "@/lib/prisma";

async function main() {
  const environment = process.env.GROWTH_EVIDENCE_ENVIRONMENT?.trim();
  const deployedVersion = process.env.GROWTH_EVIDENCE_DEPLOYED_VERSION?.trim();
  const canonicalOrigin = process.env.GROWTH_EVIDENCE_CANONICAL_ORIGIN?.trim();
  if (!environment || !deployedVersion || !canonicalOrigin)
    throw new Error(
      "GROWTH_EVIDENCE_ENVIRONMENT, GROWTH_EVIDENCE_DEPLOYED_VERSION, and GROWTH_EVIDENCE_CANONICAL_ORIGIN are required.",
    );
  const origin = new URL(canonicalOrigin);
  if (environment === "production" && origin.origin !== "https://saytwist.com")
    throw new Error(
      "Production verification requires GROWTH_EVIDENCE_CANONICAL_ORIGIN=https://saytwist.com.",
    );

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const [translators, pins] = await Promise.all([
      tx.translator.findMany({
        where: { isActive: true, archivedAt: null },
        select: { id: true, slug: true },
        orderBy: { slug: "asc" },
      }),
      tx.growthPinterestPin.findMany({
        where: { isActive: true, analyticsEligible: true },
        select: {
          pinterestPinId: true,
          destinationUrl: true,
          publishedAt: true,
          publication: { select: { id: true } },
        },
        orderBy: { pinterestPinId: "asc" },
        take: MAX_LEARNING_PIN_EVIDENCE + 1,
      }),
    ]);
    const activeSlugs = new Set(translators.map((row) => row.slug));
    const selected = pins.slice(0, MAX_LEARNING_PIN_EVIDENCE);
    const rows = selected.map((pin) => {
      const validation = validateLegacyPinDestination(
        pin.destinationUrl,
        translators,
        origin.origin,
      );
      const preliminarySlug = potentialLegacyTranslatorSlug(pin.destinationUrl);
      return {
        pinterestPinId: pin.pinterestPinId,
        destinationUrl: pin.destinationUrl,
        publishedAt: pin.publishedAt?.toISOString() || null,
        managed: Boolean(pin.publication),
        preliminaryActiveSlugMatch: Boolean(
          preliminarySlug && activeSlugs.has(preliminarySlug),
        ),
        strictMatch: validation.match,
        rejectionReason: validation.reason,
      };
    });
    return { pins, rows };
  });
  const rejected = result.rows.filter((row) => !row.strictMatch);
  const rejectionCounts = rejected.reduce<Record<string, number>>(
    (counts, row) => {
      const reason = row.rejectionReason || "UNKNOWN";
      counts[reason] = (counts[reason] || 0) + 1;
      return counts;
    },
    {},
  );
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        readOnly: true,
        environment,
        deployedVersion,
        canonicalOrigin: origin.origin,
        databaseSafety:
          "PostgreSQL transaction set to READ ONLY before the first query",
        cap: MAX_LEARNING_PIN_EVIDENCE,
        capExhausted: result.pins.length > MAX_LEARNING_PIN_EVIDENCE,
        selectedPins: result.rows.length,
        preliminaryActiveSlugMatches: result.rows.filter(
          (row) => row.preliminaryActiveSlugMatch,
        ).length,
        strictMatches: result.rows.filter((row) => row.strictMatch).length,
        strictManagedMatches: result.rows.filter(
          (row) => row.strictMatch && row.managed,
        ).length,
        strictLegacyMatches: result.rows.filter(
          (row) => row.strictMatch && !row.managed,
        ).length,
        rejectedCount: rejected.length,
        rejectionCounts,
        rejected,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          readOnly: true,
          error:
            error instanceof Error ? error.message : "Unknown report failure",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
