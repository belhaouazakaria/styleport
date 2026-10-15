import {
  GrowthExperimentStatus,
  GrowthLearningEvidenceQuality,
} from "@prisma/client";

import {
  MAX_EXPERIMENT_EXPOSURE_RATIO,
  MAX_EXPERIMENT_PUBLICATION_SHARE,
  MIN_EXPERIMENT_AGE_DAYS,
  MIN_EXPERIMENT_PUBLICATIONS,
  MIN_EXPERIMENT_RELATIVE_LIFT,
} from "@/lib/growth/learning/constants";

export type ExperimentVariantEvidence = {
  key: string;
  publications: number;
  ageDays: number;
  impressions: number;
  outboundClicks: number;
  saves?: number;
  qualifiedConversions?: number | null;
  topPublicationImpressionPercent?: number;
};

export type ExperimentEvaluationOptions = {
  primaryKpi?:
    "OUTBOUND_CLICKS" | "OUTBOUND_CTR" | "SAVES" | "QUALIFIED_CONVERSIONS";
  minimumImpressions?: number;
  minimumOutboundClicks?: number;
  attributionAvailable?: boolean;
  evidenceComplete?: boolean;
};

function criticalZ(comparisons: number) {
  if (comparisons <= 1) return 1.96;
  if (comparisons === 2) return 2.24;
  return 2.4;
}

function twoProportionZ(
  winnerSuccesses: number,
  winnerExposure: number,
  otherSuccesses: number,
  otherExposure: number,
) {
  if (winnerExposure <= 0 || otherExposure <= 0) return 0;
  const a = Math.min(winnerExposure, Math.max(0, winnerSuccesses));
  const b = Math.min(otherExposure, Math.max(0, otherSuccesses));
  const pooled = (a + b) / (winnerExposure + otherExposure);
  const standardError = Math.sqrt(
    pooled * (1 - pooled) * (1 / winnerExposure + 1 / otherExposure),
  );
  return standardError
    ? (a / winnerExposure - b / otherExposure) / standardError
    : 0;
}

export function evaluateExperiment(
  variants: ExperimentVariantEvidence[],
  options: ExperimentEvaluationOptions = {},
) {
  const minimumImpressions = Math.max(500, options.minimumImpressions || 0);
  const minimumOutboundClicks = Math.max(
    10,
    options.minimumOutboundClicks || 0,
  );
  if (!options.evidenceComplete && options.evidenceComplete !== undefined)
    return {
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      confidence: 15,
      evidenceQuality: GrowthLearningEvidenceQuality.PARTIAL,
      reasonCodes: ["EVIDENCE_SELECTION_INCOMPLETE"],
      winnerKey: null,
    };
  if (
    options.primaryKpi === "QUALIFIED_CONVERSIONS" &&
    (!options.attributionAvailable ||
      variants.some((variant) => variant.qualifiedConversions == null))
  )
    return {
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      confidence: 10,
      evidenceQuality: GrowthLearningEvidenceQuality.INSUFFICIENT_DATA,
      reasonCodes: ["CONVERSION_EVIDENCE_UNAVAILABLE"],
      winnerKey: null,
    };
  if (
    options.primaryKpi === "QUALIFIED_CONVERSIONS" &&
    variants.some((variant) => (variant.qualifiedConversions || 0) < 10)
  )
    return {
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      confidence: 20,
      evidenceQuality: GrowthLearningEvidenceQuality.INSUFFICIENT_DATA,
      reasonCodes: ["LOW_CONVERSION_COUNT"],
      winnerKey: null,
    };
  const mature =
    variants.length >= 2 &&
    variants.every(
      (variant) =>
        variant.publications >= MIN_EXPERIMENT_PUBLICATIONS &&
        variant.ageDays >= MIN_EXPERIMENT_AGE_DAYS &&
        variant.impressions >= minimumImpressions &&
        variant.outboundClicks >= minimumOutboundClicks,
    );
  if (!mature)
    return {
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      confidence: 25,
      evidenceQuality: GrowthLearningEvidenceQuality.INSUFFICIENT_DATA,
      reasonCodes: ["VARIANTS_NOT_MATURE"],
      winnerKey: null,
    };
  if (
    variants.some(
      (variant) =>
        (variant.topPublicationImpressionPercent || 0) >
        MAX_EXPERIMENT_PUBLICATION_SHARE * 100,
    )
  )
    return {
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      confidence: 35,
      evidenceQuality: GrowthLearningEvidenceQuality.PARTIAL,
      reasonCodes: ["OUTLIER_CONCENTRATION"],
      winnerKey: null,
    };
  const exposures = variants.map((variant) => variant.impressions);
  if (
    Math.max(...exposures) / Math.min(...exposures) >
    MAX_EXPERIMENT_EXPOSURE_RATIO
  )
    return {
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      confidence: 30,
      evidenceQuality: GrowthLearningEvidenceQuality.PARTIAL,
      reasonCodes: ["UNEQUAL_EXPOSURE"],
      winnerKey: null,
    };
  const primaryKpi = options.primaryKpi || "OUTBOUND_CTR";
  const ranked = variants
    .map((variant) => {
      const successes =
        primaryKpi === "SAVES"
          ? variant.saves || 0
          : primaryKpi === "QUALIFIED_CONVERSIONS"
            ? variant.qualifiedConversions || 0
            : variant.outboundClicks;
      const exposure =
        primaryKpi === "QUALIFIED_CONVERSIONS"
          ? variant.outboundClicks
          : variant.impressions;
      return {
        ...variant,
        successes,
        exposure,
        rate: exposure ? successes / exposure : 0,
      };
    })
    .sort((a, b) => b.rate - a.rate || a.key.localeCompare(b.key));
  const lift = ranked[1].rate
    ? (ranked[0].rate - ranked[1].rate) / ranked[1].rate
    : ranked[0].rate > 0
      ? 1
      : 0;
  const tied = ranked.length > 1 && ranked[0].rate === ranked[1].rate;
  const significant = ranked
    .slice(1)
    .every(
      (other) =>
        twoProportionZ(
          ranked[0].successes,
          ranked[0].exposure,
          other.successes,
          other.exposure,
        ) >= criticalZ(ranked.length - 1),
    );
  if (tied || lift < MIN_EXPERIMENT_RELATIVE_LIFT || !significant)
    return {
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      confidence: 55,
      evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
      reasonCodes: [tied ? "TIED_RESULT" : "NO_STATISTICALLY_QUALIFIED_WINNER"],
      winnerKey: null,
    };
  return {
    outcome: GrowthExperimentStatus.COMPLETED,
    confidence: Math.min(95, Math.round(75 + lift * 10)),
    evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
    reasonCodes: [
      "QUALIFIED_WINNER",
      "EXPOSURE_NORMALIZED",
      "MULTIPLE_COMPARISON_THRESHOLD_MET",
    ],
    winnerKey: ranked[0].key,
  };
}
