export const APPROVED_LEGACY_EVIDENCE_HOSTS = [
  "translator.whattypeof.com",
] as const;

export type LegacyPinMatch = {
  translatorId: string;
  translatorSlug: string;
  canonicalPath: string;
  sourceHost: string;
};

export type LegacyPinMatchFailure =
  | "MISSING_URL"
  | "MALFORMED_URL"
  | "INSECURE_SCHEME"
  | "EXPLICIT_PORT"
  | "URL_CREDENTIALS"
  | "URL_FRAGMENT"
  | "UNAPPROVED_HOST"
  | "AMBIGUOUS_PATH"
  | "INVALID_PATH_ENCODING"
  | "NON_CANONICAL_SLUG_ENCODING"
  | "INACTIVE_OR_UNKNOWN_TARGET"
  | "AMBIGUOUS_TARGET";

export type DailyMetricEvidence = {
  metricDate: Date;
  dataStatus: string;
  impressions: bigint | number | null;
  outboundClicks: bigint | number | null;
  saves: bigint | number | null;
};

export function validateLegacyPinDestination(
  destinationUrl: string | null,
  translators: readonly { id: string; slug: string }[],
  canonicalOrigin = "https://saytwist.com",
):
  | { match: LegacyPinMatch; reason: null }
  | { match: null; reason: LegacyPinMatchFailure } {
  if (!destinationUrl) return { match: null, reason: "MISSING_URL" };
  try {
    const url = new URL(destinationUrl);
    const canonical = new URL(canonicalOrigin);
    const host = url.hostname.toLowerCase();
    const approvedHosts = new Set([
      canonical.hostname.toLowerCase(),
      `www.${canonical.hostname.toLowerCase().replace(/^www\./, "")}`,
      ...APPROVED_LEGACY_EVIDENCE_HOSTS,
    ]);
    if (url.protocol !== "https:")
      return { match: null, reason: "INSECURE_SCHEME" };
    if (url.port) return { match: null, reason: "EXPLICIT_PORT" };
    if (url.username || url.password)
      return { match: null, reason: "URL_CREDENTIALS" };
    if (url.hash) return { match: null, reason: "URL_FRAGMENT" };
    if (!approvedHosts.has(host))
      return { match: null, reason: "UNAPPROVED_HOST" };
    const match = url.pathname.match(/^\/translators\/([^/]+)\/?$/);
    if (!match) return { match: null, reason: "AMBIGUOUS_PATH" };
    let decoded: string;
    try {
      decoded = decodeURIComponent(match[1]);
    } catch {
      return { match: null, reason: "INVALID_PATH_ENCODING" };
    }
    if (
      !decoded ||
      decoded !== decoded.toLowerCase() ||
      encodeURIComponent(decoded).toLowerCase() !== match[1].toLowerCase()
    )
      return { match: null, reason: "NON_CANONICAL_SLUG_ENCODING" };
    const matches = translators.filter((row) => row.slug === decoded);
    if (!matches.length)
      return { match: null, reason: "INACTIVE_OR_UNKNOWN_TARGET" };
    if (matches.length !== 1)
      return { match: null, reason: "AMBIGUOUS_TARGET" };
    return {
      match: {
        translatorId: matches[0].id,
        translatorSlug: matches[0].slug,
        canonicalPath: `/translators/${matches[0].slug}`,
        sourceHost: host,
      },
      reason: null,
    };
  } catch {
    return { match: null, reason: "MALFORMED_URL" };
  }
}

export function matchLegacyPinToTranslator(
  destinationUrl: string | null,
  translators: readonly { id: string; slug: string }[],
  canonicalOrigin = "https://saytwist.com",
) {
  return validateLegacyPinDestination(
    destinationUrl,
    translators,
    canonicalOrigin,
  ).match;
}

export function potentialLegacyTranslatorSlug(destinationUrl: string | null) {
  if (!destinationUrl) return null;
  try {
    const url = new URL(destinationUrl);
    const match = url.pathname.match(/^\/translators\/([^/]+)\/?$/i);
    if (!match) return null;
    return decodeURIComponent(match[1]).toLowerCase();
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
  const eligibleRows = expected
    ? rows.filter(
        (row) =>
          row.metricDate >= expectedStart! &&
          row.metricDate < expected.windowEndExclusive,
      )
    : rows;
  const completeMetrics = (
    row: DailyMetricEvidence,
  ): row is DailyMetricEvidence & {
    impressions: bigint | number;
    outboundClicks: bigint | number;
    saves: bigint | number;
  } =>
    row.impressions !== null &&
    row.outboundClicks !== null &&
    row.saves !== null;
  const ready = eligibleRows.filter(
    (row): row is DailyMetricEvidence & {
      impressions: bigint | number;
      outboundClicks: bigint | number;
      saves: bigint | number;
    } => row.dataStatus === "READY" && completeMetrics(row),
  );
  const incomplete = eligibleRows.filter(
    (row) => row.dataStatus !== "READY" || !completeMetrics(row),
  );
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
    eligibleRows.map((row) => row.metricDate.toISOString().slice(0, 10)),
  ).size;
  const missingDays =
    expectedDays == null
      ? eligibleRows.length
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
