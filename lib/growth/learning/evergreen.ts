import {
  GrowthCreativeArchetype,
  GrowthEvergreenRecommendation,
  GrowthLearningEvidenceQuality,
} from "@prisma/client";

import {
  DEFAULT_EVERGREEN_COOLDOWN_DAYS,
  MIN_EVERGREEN_IMPRESSIONS,
  MIN_EVERGREEN_OBSERVED_DAYS,
  MIN_EVERGREEN_OUTBOUND_CLICKS,
} from "@/lib/growth/learning/constants";
import type { EvergreenTargetEvidence } from "@/lib/growth/learning/contracts";

const TRANSLATOR_ROTATION = [
  GrowthCreativeArchetype.MINIMAL_STATEMENT,
  GrowthCreativeArchetype.BEFORE_AFTER,
] as const;

export type EvergreenEvaluation = {
  recommendation: GrowthEvergreenRecommendation;
  confidence: number;
  evidenceQuality: GrowthLearningEvidenceQuality;
  reasonCodes: string[];
  cooldownUntil: Date | null;
  proposedArchetype: GrowthCreativeArchetype | null;
  proposedAngle: string | null;
};

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function chooseRotatedArchetype(
  previous: GrowthCreativeArchetype[],
  destinationKind = "TRANSLATOR",
) {
  const rotation =
    destinationKind === "IDEA"
      ? [GrowthCreativeArchetype.MINIMAL_STATEMENT]
      : TRANSLATOR_ROTATION;
  return rotation.find((archetype) => !previous.includes(archetype)) || null;
}

export function evaluateEvergreenTarget(
  evidence: EvergreenTargetEvidence,
  now: Date,
  cooldownDays = DEFAULT_EVERGREEN_COOLDOWN_DAYS,
): EvergreenEvaluation {
  const reasons: string[] = [];
  const cooldownUntil = evidence.lastPublishedAt
    ? addDays(evidence.lastPublishedAt, cooldownDays)
    : null;
  const rotated = chooseRotatedArchetype(
    evidence.previousArchetypes,
    evidence.destinationKind,
  );

  if (!evidence.activeAndPublic) {
    return {
      recommendation: GrowthEvergreenRecommendation.SKIP,
      confidence: 100,
      evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
      reasonCodes: ["DESTINATION_NOT_PUBLIC"],
      cooldownUntil,
      proposedArchetype: null,
      proposedAngle: null,
    };
  }
  if (evidence.unresolvedAccountIssue) {
    return {
      recommendation: GrowthEvergreenRecommendation.SKIP,
      confidence: 95,
      evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
      reasonCodes: ["UNRESOLVED_ACCOUNT_ISSUE"],
      cooldownUntil,
      proposedArchetype: null,
      proposedAngle: null,
    };
  }
  if (evidence.strongFatigue) {
    return {
      recommendation: GrowthEvergreenRecommendation.SKIP,
      confidence: 90,
      evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
      reasonCodes: ["STRONG_FATIGUE"],
      cooldownUntil,
      proposedArchetype: null,
      proposedAngle: null,
    };
  }
  if (!evidence.analyticsFresh) {
    return {
      recommendation: GrowthEvergreenRecommendation.INSUFFICIENT_DATA,
      confidence: 20,
      evidenceQuality: GrowthLearningEvidenceQuality.STALE,
      reasonCodes: ["ANALYTICS_STALE"],
      cooldownUntil,
      proposedArchetype: null,
      proposedAngle: null,
    };
  }
  if (!evidence.evidenceComplete) {
    return {
      recommendation: GrowthEvergreenRecommendation.INSUFFICIENT_DATA,
      confidence: 15,
      evidenceQuality: GrowthLearningEvidenceQuality.PARTIAL,
      reasonCodes: ["BOUNDED_EVIDENCE_CAP_REACHED"],
      cooldownUntil,
      proposedArchetype: null,
      proposedAngle: null,
    };
  }
  if (
    evidence.publicationCount < 1 ||
    evidence.observedMetricDays < MIN_EVERGREEN_OBSERVED_DAYS ||
    evidence.impressions < MIN_EVERGREEN_IMPRESSIONS ||
    evidence.outboundClicks < MIN_EVERGREEN_OUTBOUND_CLICKS
  ) {
    return {
      recommendation: GrowthEvergreenRecommendation.INSUFFICIENT_DATA,
      confidence: 25,
      evidenceQuality: GrowthLearningEvidenceQuality.INSUFFICIENT_DATA,
      reasonCodes: ["HISTORICAL_EVIDENCE_BELOW_MINIMUM"],
      cooldownUntil,
      proposedArchetype: null,
      proposedAngle: null,
    };
  }
  if (cooldownUntil && cooldownUntil > now) reasons.push("COOLDOWN_ACTIVE");
  if (evidence.activeEquivalentCount > 0)
    reasons.push("EQUIVALENT_ACTIVE_PUBLICATION");
  if (evidence.activeCandidateCount > 0)
    reasons.push("EQUIVALENT_ACTIVE_CANDIDATE");
  if (!evidence.meaningfulAngleAvailable || !rotated)
    reasons.push("NO_MEANINGFULLY_DIFFERENT_ANGLE");
  if (reasons.length) {
    return {
      recommendation: GrowthEvergreenRecommendation.WAIT,
      confidence: 85,
      evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
      reasonCodes: reasons,
      cooldownUntil,
      proposedArchetype: null,
      proposedAngle: null,
    };
  }

  const conversionReason = evidence.attributionAvailable
    ? evidence.qualifiedConversions == null
      ? "CONVERSION_EVIDENCE_MISSING"
      : "CONVERSION_EVIDENCE_AVAILABLE"
    : "ATTRIBUTION_NOT_COLLECTING";
  return {
    recommendation: GrowthEvergreenRecommendation.REVIVE,
    confidence:
      evidence.attributionAvailable && evidence.qualifiedConversions != null
        ? 85
        : 75,
    evidenceQuality: GrowthLearningEvidenceQuality.KNOWN,
    reasonCodes: [
      "PROVEN_HISTORICAL_PERFORMANCE",
      "COOLDOWN_COMPLETE",
      "DISTINCT_CREATIVE_REQUIRED",
      conversionReason,
    ],
    cooldownUntil,
    proposedArchetype: rotated!,
    proposedAngle: `Fresh ${rotated!.toLowerCase().replaceAll("_", " ")} angle based on retained historical evidence`,
  };
}
