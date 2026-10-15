export const APPROVED_LEGACY_EVIDENCE_HOSTS = [
  "translator.whattypeof.com",
] as const;

export type LegacyPinMatch = {
  translatorId: string;
  translatorSlug: string;
  canonicalPath: string;
  sourceHost: string;
};

export type DailyMetricEvidence = {
  metricDate: Date;
  dataStatus: string;
  impressions: bigint | number;
  outboundClicks: bigint | number;
  saves: bigint | number;
};

export function matchLegacyPinToTranslator(
  destinationUrl: string | null,
  translators: readonly { id: string; slug: string }[],
  canonicalOrigin = "https://saytwist.com",
): LegacyPinMatch | null {
  if (!destinationUrl) return null;
  try {
    const url = new URL(destinationUrl);
    const canonical = new URL(canonicalOrigin);
    const host = url.hostname.toLowerCase();
    const approvedHosts = new Set([
      canonical.hostname.toLowerCase(),
      `www.${canonical.hostname.toLowerCase().replace(/^www\./, "")}`,
      ...APPROVED_LEGACY_EVIDENCE_HOSTS,
    ]);
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      !approvedHosts.has(host)
    )
      return null;
    const match = url.pathname.match(/^\/translators\/([^/]+)\/?$/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    if (
      !decoded ||
      decoded !== decoded.toLowerCase() ||
      encodeURIComponent(decoded).toLowerCase() !== match[1].toLowerCase()
    )
      return null;
    const matches = translators.filter((row) => row.slug === decoded);
    if (matches.length !== 1) return null;
    return {
      translatorId: matches[0].id,
      translatorSlug: matches[0].slug,
      canonicalPath: `/translators/${matches[0].slug}`,
      sourceHost: host,
    };
  } catch {
    return null;
  }
}

export function selectFinalizedMetricEvidence(
  rows: readonly DailyMetricEvidence[],
  expected?: {
    windowStart: Date;
    windowEndExclusive: Date;
    publishedAt: Date | null;
  },
) {
  const ready = rows.filter((row) => row.dataStatus === "READY");
  const incomplete = rows.filter((row) => row.dataStatus !== "READY");
  const publishedDay = expected?.publishedAt
    ? new Date(
        Date.UTC(
          expected.publishedAt.getUTCFullYear(),
          expected.publishedAt.getUTCMonth(),
          expected.publishedAt.getUTCDate(),
        ) + 86_400_000,
      )
    : null;
  const expectedStart = expected
    ? new Date(
        Math.max(
          expected.windowStart.getTime(),
          publishedDay?.getTime() || expected.windowStart.getTime(),
        ),
      )
    : null;
  const expectedDays =
    expected && expectedStart
      ? Math.max(
          0,
          Math.ceil(
            (expected.windowEndExclusive.getTime() - expectedStart.getTime()) /
              86_400_000,
          ),
        )
      : null;
  const observedDays = new Set(
    rows.map((row) => row.metricDate.toISOString().slice(0, 10)),
  ).size;
  const missingDays =
    expectedDays == null
      ? rows.length
        ? 0
        : 1
      : Math.max(0, expectedDays - observedDays);
  return {
    ready,
    incomplete,
    observedReadyDays: new Set(
      ready.map((row) => row.metricDate.toISOString().slice(0, 10)),
    ).size,
    expectedDays,
    missingDays,
    evidenceComplete: missingDays === 0 && incomplete.length === 0,
    reasonCodes: [
      ...(missingDays ? ["PIN_METRICS_MISSING"] : []),
      ...(incomplete.length ? ["PIN_METRICS_INCOMPLETE"] : []),
    ],
  };
}

export function deduplicatePinterestEvidence<
  M extends { pinterestPinId: string },
  L extends { pinterestPinId: string },
>(managed: readonly M[], legacy: readonly L[]) {
  const seen = new Set<string>();
  const managedUnique = managed.filter((row) => {
    if (seen.has(row.pinterestPinId)) return false;
    seen.add(row.pinterestPinId);
    return true;
  });
  const legacyUnique = legacy.filter((row) => {
    if (seen.has(row.pinterestPinId)) return false;
    seen.add(row.pinterestPinId);
    return true;
  });
  return { managed: managedUnique, legacy: legacyUnique };
}

export function selectBoundedPinterestEvidence<T>(
  rows: readonly T[],
  cap: number,
) {
  return {
    selected: rows.slice(0, cap),
    capExhausted: rows.length > cap,
  };
}
