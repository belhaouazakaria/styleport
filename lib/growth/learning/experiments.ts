import {
  GrowthExperimentStatus,
  GrowthLearningEvidenceQuality,
} from "@prisma/client";

export type ExperimentVariantEvidence = {
  key: string;
  publications: number;
  ageDays: number;
  impressions: number;
  outboundClicks: number;
  topPublicationImpressionPercent?: number;
};

export function evaluateExperiment(variants: ExperimentVariantEvidence[]) {
  const mature =
    variants.length >= 2 &&
    variants.every(
      (variant) =>
        variant.publications >= 2 &&
        variant.ageDays >= 7 &&
        variant.impressions >= 500,
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
      (variant) => (variant.topPublicationImpressionPercent || 0) > 80,
    )
  )
    return {
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      confidence: 35,
      evidenceQuality: GrowthLearningEvidenceQuality.PARTIAL,
      reasonCodes: ["OUTLIER_CONCENTRATION"],
      winnerKey: null,
    };
  const ranked = variants
    .map((variant) => ({
      ...variant,
      rate: variant.impressions
        ? variant.outboundClicks / variant.impressions
        : 0,
    }))
    .sort((a, b) => b.rate - a.rate || a.key.localeCompare(b.key));
  const lift = ranked[1].rate
    ? (ranked[0].rate - ranked[1].rate) / ranked[1].rate
    : ranked[0].rate > 0
      ? 1
      : 0;
  if (lift < 0.2)
    return {
      outcome: GrowthExperimentStatus.INCONCLUSIVE,
      confidence: 55,
      evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
      reasonCodes: ["NO_QUALIFIED_WINNER"],
      winnerKey: null,
    };
  return {
    outcome: GrowthExperimentStatus.COMPLETED,
    confidence: Math.min(90, Math.round(60 + lift * 20)),
    evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
    reasonCodes: ["QUALIFIED_WINNER", "EXPOSURE_NORMALIZED"],
    winnerKey: ranked[0].key,
  };
}
