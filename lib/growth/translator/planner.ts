import {
  GrowthDecisionType,
  GrowthOpportunityEvidenceQuality,
  GrowthOpportunityStatus,
  GrowthOpportunityType,
} from "@prisma/client";

import {
  CREATE_CONFIDENCE_MIN,
  CREATE_SCORE_MIN,
  DECISION_REASON,
  IMPROVE_CONFIDENCE_MIN,
  IMPROVE_SCORE_MIN,
} from "@/lib/growth/translator/constants";
import type { TranslatorPlan } from "@/lib/growth/translator/contracts";

export interface PlannerOpportunity {
  type: GrowthOpportunityType;
  status: GrowthOpportunityStatus;
  score: number;
  confidence: number;
  evidenceQuality: GrowthOpportunityEvidenceQuality;
  clusterName: string | null;
  mappedTranslatorIds: string[];
  distinctDestinationCount: number;
  representativeEvidenceCount: number;
}

const genericTopics = new Set(["roleplay", "historical", "funny", "professional", "casual", "social", "marketing"]);

export function planTranslatorAction(input: PlannerOpportunity): TranslatorPlan {
  const mapped = [...new Set(input.mappedTranslatorIds)].sort();
  if (input.status !== GrowthOpportunityStatus.OPEN) {
    return { type: GrowthDecisionType.NO_ACTION, targetTranslatorId: null, confidence: input.confidence, reasonCodes: [DECISION_REASON.OPPORTUNITY_NOT_OPEN] };
  }
  if (input.evidenceQuality !== GrowthOpportunityEvidenceQuality.KNOWN) {
    return { type: GrowthDecisionType.WAIT_FOR_MORE_DATA, targetTranslatorId: null, confidence: input.confidence, reasonCodes: [DECISION_REASON.EVIDENCE_NOT_KNOWN] };
  }
  if (mapped.length > 1) {
    return { type: GrowthDecisionType.WAIT_FOR_MORE_DATA, targetTranslatorId: null, confidence: input.confidence, reasonCodes: [DECISION_REASON.MULTIPLE_TARGETS_AMBIGUOUS] };
  }

  const improveEligible = input.score >= IMPROVE_SCORE_MIN && input.confidence >= IMPROVE_CONFIDENCE_MIN;
  if (mapped.length === 1 && improveEligible) {
    if (input.type === GrowthOpportunityType.INVESTIGATE_FATIGUE || input.type === GrowthOpportunityType.AMPLIFY_WINNER || input.type === GrowthOpportunityType.EXPLORE_RISING_TOPIC) {
      return { type: GrowthDecisionType.IMPROVE_TRANSLATOR, targetTranslatorId: mapped[0], confidence: input.confidence, reasonCodes: [DECISION_REASON.ACTIONABLE_IMPROVE] };
    }
  }

  if (input.type === GrowthOpportunityType.INVESTIGATE_FATIGUE) {
    return { type: GrowthDecisionType.WAIT_FOR_MORE_DATA, targetTranslatorId: null, confidence: input.confidence, reasonCodes: [DECISION_REASON.FATIGUE_REQUIRES_CLEAR_TARGET] };
  }
  if (input.type === GrowthOpportunityType.AMPLIFY_WINNER) {
    return { type: GrowthDecisionType.NO_ACTION, targetTranslatorId: null, confidence: input.confidence, reasonCodes: [DECISION_REASON.AMPLIFY_REQUIRES_EXISTING_TARGET] };
  }

  const creationType = input.type === GrowthOpportunityType.FILL_INVENTORY_GAP || input.type === GrowthOpportunityType.EXPLORE_RISING_TOPIC;
  const createEligible = input.score >= CREATE_SCORE_MIN && input.confidence >= CREATE_CONFIDENCE_MIN;
  const genericOnly = !input.clusterName || (genericTopics.has(input.clusterName.toLowerCase()) && input.representativeEvidenceCount < 2);
  if (creationType && createEligible && !genericOnly && input.distinctDestinationCount > 0) {
    return { type: GrowthDecisionType.CREATE_TRANSLATOR, targetTranslatorId: null, confidence: input.confidence, reasonCodes: [DECISION_REASON.ACTIONABLE_CREATE] };
  }
  return {
    type: createEligible ? GrowthDecisionType.WAIT_FOR_MORE_DATA : GrowthDecisionType.NO_ACTION,
    targetTranslatorId: null,
    confidence: input.confidence,
    reasonCodes: [genericOnly ? DECISION_REASON.GENERIC_TOPIC_INSUFFICIENT : DECISION_REASON.SCORE_OR_CONFIDENCE_LOW],
  };
}

