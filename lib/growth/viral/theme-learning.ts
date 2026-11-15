import { prisma } from "@/lib/prisma";
export type NativeThemeOutcome = {
  conceptId: string;
  title: string;
  outcome: "NATIVE_OUTPERFORMS" | "SOURCE_OUTPERFORMS";
};
const generic = new Set([
  "english",
  "text",
  "word",
  "words",
  "language",
  "translator",
  "translation",
  "style",
  "tone",
  "the",
  "and",
  "for",
]);
function themes(title: string) {
  return [
    ...new Set(
      (title.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(
        (t) => !generic.has(t),
      ),
    ),
  ];
}

/** Re-ranks editorially qualified research only. It cannot change winner
 * classification, budgets, publication permission or content quality gates. */
export function nativeThemeAdjustment(
  title: string,
  outcomes: NativeThemeOutcome[],
) {
  const distinct = [...new Map(outcomes.map((o) => [o.conceptId, o])).values()];
  const ranked = themes(title)
    .map((theme) => {
      const relevant = distinct.filter((o) => themes(o.title).includes(theme));
      const wins = relevant.filter(
        (o) => o.outcome === "NATIVE_OUTPERFORMS",
      ).length;
      const losses = relevant.length - wins;
      const fraction = relevant.length ? wins / relevant.length : 0.5;
      const adjustment =
        relevant.length >= 3
          ? fraction >= 0.75
            ? 5
            : fraction <= 0.25
              ? -5
              : 0
          : 0;
      return {
        theme,
        independentConcepts: relevant.length,
        wins,
        losses,
        adjustment,
      };
    })
    .sort(
      (a, b) =>
        b.independentConcepts - a.independentConcepts ||
        a.theme.localeCompare(b.theme),
    );
  return {
    modelVersion: "native-theme-feedback-v1",
    ...(ranked[0] ?? {
      theme: null,
      independentConcepts: 0,
      wins: 0,
      losses: 0,
      adjustment: 0,
    }),
    evidenceMetric: "OFFICIAL_OUTBOUND_RATE_ONLY",
    qualifiedConversionsInferred: false,
  };
}

export async function readNativeThemeOutcomes(
  now = new Date(),
): Promise<NativeThemeOutcome[]> {
  const activities = await prisma.growthActivity.findMany({
    where: {
      action: "VIRAL_NATIVE_COMPARISON_ARCHIVED",
      createdAt: { gte: new Date(now.getTime() - 90 * 86400000) },
    },
    select: { entityId: true, summary: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  // Only the latest observation per conversion is used; overlapping daily
  // windows are never counted as additional independent experiments.
  const latest = [
    ...new Map([...activities].reverse().map((a) => [a.entityId, a])).values(),
  ].slice(-100);
  const conversions = await prisma.growthViralConversion.findMany({
    where: { id: { in: latest.map((a) => a.entityId) } },
    select: { id: true, conceptId: true },
    take: 100,
  });
  const concepts = await prisma.growthViralConcept.findMany({
    where: { id: { in: conversions.map((c) => c.conceptId) } },
    select: { id: true, title: true },
    take: 100,
  });
  return latest.flatMap((a) => {
    const status = (a.summary as { status?: string } | null)?.status;
    const conversion = conversions.find((c) => c.id === a.entityId);
    const concept = concepts.find((c) => c.id === conversion?.conceptId);
    return concept &&
      (status === "NATIVE_OUTPERFORMS" || status === "SOURCE_OUTPERFORMS")
      ? [{ conceptId: concept.id, title: concept.title, outcome: status }]
      : [];
  });
}
