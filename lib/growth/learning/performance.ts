import { GrowthLearningEvidenceQuality } from "@prisma/client";

export type PerformanceObservation = {
  dimension: string;
  value: string;
  impressions: number;
  outboundClicks: number;
  saves: number;
  qualifiedConversions: number | null;
};

export type PerformanceComparisonOptions = {
  attributionAvailable: boolean;
  evidenceComplete: boolean;
  incompletenessReasonCodes?: string[];
};

export function comparePerformance(
  observations: PerformanceObservation[],
  input: boolean | PerformanceComparisonOptions,
) {
  const options: PerformanceComparisonOptions =
    typeof input === "boolean"
      ? { attributionAvailable: input, evidenceComplete: true }
      : input;
  const attributionAvailable = options.attributionAvailable;
  const grouped = new Map<
    string,
    {
      dimension: string;
      value: string;
      samples: number;
      impressions: number;
      outboundClicks: number;
      saves: number;
      qualifiedConversions: number | null;
      conversionSamples: number;
      maximumImpressions: number;
    }
  >();
  for (const row of observations) {
    const key = `${row.dimension}:${row.value}`;
    const current = grouped.get(key) || {
      dimension: row.dimension,
      value: row.value,
      samples: 0,
      impressions: 0,
      outboundClicks: 0,
      saves: 0,
      qualifiedConversions: null,
      conversionSamples: 0,
      maximumImpressions: 0,
    };
    current.samples += 1;
    current.impressions += Math.max(0, row.impressions);
    current.outboundClicks += Math.max(0, row.outboundClicks);
    current.saves += Math.max(0, row.saves);
    current.maximumImpressions = Math.max(
      current.maximumImpressions,
      Math.max(0, row.impressions),
    );
    if (attributionAvailable && row.qualifiedConversions != null) {
      current.qualifiedConversions =
        (current.qualifiedConversions || 0) + row.qualifiedConversions;
      current.conversionSamples += 1;
    }
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((row) => {
      const conversionEvidenceComplete =
        !attributionAvailable || row.conversionSamples === row.samples;
      const concentrated =
        row.samples >= 3 &&
        row.impressions > 0 &&
        row.maximumImpressions / row.impressions > 0.8;
      const sufficient =
        row.samples >= 3 && row.impressions >= 500 && !concentrated;
      const baseEvidenceQuality = sufficient
        ? GrowthLearningEvidenceQuality.KNOWN
        : concentrated
          ? GrowthLearningEvidenceQuality.PARTIAL
          : GrowthLearningEvidenceQuality.INSUFFICIENT_DATA;
      const evidenceQuality =
        options.evidenceComplete && conversionEvidenceComplete
          ? baseEvidenceQuality
          : GrowthLearningEvidenceQuality.PARTIAL;
      const reasonCodes =
        options.evidenceComplete && conversionEvidenceComplete
          ? sufficient
            ? ["EXPOSURE_NORMALIZED"]
            : concentrated
              ? ["OUTLIER_CONCENTRATION"]
              : ["SAMPLE_BELOW_MINIMUM"]
          : [
              ...(!options.evidenceComplete
                ? options.incompletenessReasonCodes || [
                    "EVIDENCE_SELECTION_INCOMPLETE",
                  ]
                : []),
              ...(!conversionEvidenceComplete
                ? ["CONVERSION_EVIDENCE_INCOMPLETE"]
                : []),
              ...(concentrated ? ["OUTLIER_CONCENTRATION"] : []),
            ];
      return {
        ...row,
        outboundRate: row.impressions
          ? Number((row.outboundClicks / row.impressions).toFixed(6))
          : null,
        saveRate: row.impressions
          ? Number((row.saves / row.impressions).toFixed(6))
          : null,
        conversionRate:
          attributionAvailable &&
          conversionEvidenceComplete &&
          row.conversionSamples > 0 &&
          row.qualifiedConversions != null &&
          row.outboundClicks
            ? Number((row.qualifiedConversions / row.outboundClicks).toFixed(6))
            : null,
        evidenceQuality,
        confidence:
          options.evidenceComplete && conversionEvidenceComplete
            ? sufficient
              ? Math.min(90, 50 + row.samples * 5)
              : Math.min(40, row.samples * 10)
            : Math.min(30, row.samples * 5),
        reasonCodes,
      };
    })
    .sort(
      (a, b) =>
        a.dimension.localeCompare(b.dimension) ||
        b.confidence - a.confidence ||
        (b.outboundRate || 0) - (a.outboundRate || 0) ||
        a.value.localeCompare(b.value),
    );
}
