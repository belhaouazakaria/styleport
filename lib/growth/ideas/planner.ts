import { GrowthDecisionType, GrowthOpportunityEvidenceQuality, GrowthOpportunityStatus, GrowthOpportunityType } from "@prisma/client";

import { IDEA_CREATE_CONFIDENCE_MIN, IDEA_CREATE_SCORE_MIN, IDEA_DECISION_REASON, IDEA_IMPROVE_CONFIDENCE_MIN, IDEA_IMPROVE_SCORE_MIN } from "@/lib/growth/ideas/constants";
import { CONTENT_CLUSTERING_VERSION, OPPORTUNITY_INTELLIGENCE_VERSION } from "@/lib/growth/opportunity/constants";

export interface IdeaPlannerInput {
  type: GrowthOpportunityType;
  status: GrowthOpportunityStatus;
  score: number;
  confidence: number;
  evidenceQuality: GrowthOpportunityEvidenceQuality;
  intelligenceModelVersion: string;
  analysisClusteringModelVersion: string;
  opportunityClusteringModelVersion: string;
  clusterName: string | null;
  representativeEvidenceCount: number;
  mappedIdeaIds: string[];
  obviousCoverage: "NONE" | "RELATED" | "EXACT_OR_NEAR";
}

const GENERIC = new Set(["translator", "translators", "historical", "roleplay", "funny", "social", "professional", "casual", "marketing"]);

export function planIdeaAction(input: IdeaPlannerInput) {
  const mapped = [...new Set(input.mappedIdeaIds)].sort();
  const base = { targetIdeaId: null as string | null, confidence: input.confidence };
  if (input.status !== GrowthOpportunityStatus.OPEN) return { ...base, type: GrowthDecisionType.NO_ACTION, reasonCodes: [IDEA_DECISION_REASON.OPPORTUNITY_NOT_OPEN] };
  if (
    input.intelligenceModelVersion !== OPPORTUNITY_INTELLIGENCE_VERSION
    || input.analysisClusteringModelVersion !== CONTENT_CLUSTERING_VERSION
    || input.opportunityClusteringModelVersion !== CONTENT_CLUSTERING_VERSION
  ) return { ...base, type: GrowthDecisionType.NO_ACTION, reasonCodes: [IDEA_DECISION_REASON.SOURCE_MODEL_OUTDATED] };
  if (input.evidenceQuality !== GrowthOpportunityEvidenceQuality.KNOWN) return { ...base, type: GrowthDecisionType.WAIT_FOR_MORE_DATA, reasonCodes: [IDEA_DECISION_REASON.EVIDENCE_NOT_KNOWN] };
  const generic = !input.clusterName || GENERIC.has(input.clusterName.trim().toLowerCase());
  if (generic) return { ...base, type: GrowthDecisionType.WAIT_FOR_MORE_DATA, reasonCodes: [IDEA_DECISION_REASON.GENERIC_TOPIC_INSUFFICIENT] };
  if (mapped.length > 1) return { ...base, type: GrowthDecisionType.WAIT_FOR_MORE_DATA, reasonCodes: [IDEA_DECISION_REASON.MULTIPLE_IDEAS_AMBIGUOUS] };
  if (mapped.length === 1 && input.score >= IDEA_IMPROVE_SCORE_MIN && input.confidence >= IDEA_IMPROVE_CONFIDENCE_MIN) {
    return { ...base, type: GrowthDecisionType.IMPROVE_IDEA, targetIdeaId: mapped[0], reasonCodes: [IDEA_DECISION_REASON.ACTIONABLE_IMPROVE] };
  }
  if (input.type === GrowthOpportunityType.INVESTIGATE_FATIGUE) return { ...base, type: GrowthDecisionType.WAIT_FOR_MORE_DATA, reasonCodes: [IDEA_DECISION_REASON.FATIGUE_REQUIRES_TARGET] };
  if (input.obviousCoverage === "EXACT_OR_NEAR") return { ...base, type: GrowthDecisionType.NO_ACTION, reasonCodes: [IDEA_DECISION_REASON.ALREADY_WELL_COVERED] };
  if (input.representativeEvidenceCount < 2) return { ...base, type: GrowthDecisionType.WAIT_FOR_MORE_DATA, reasonCodes: [IDEA_DECISION_REASON.GENERIC_TOPIC_INSUFFICIENT] };
  if (input.score < IDEA_CREATE_SCORE_MIN || input.confidence < IDEA_CREATE_CONFIDENCE_MIN) return { ...base, type: GrowthDecisionType.NO_ACTION, reasonCodes: [IDEA_DECISION_REASON.SCORE_OR_CONFIDENCE_LOW] };
  const createTypes: GrowthOpportunityType[] = [GrowthOpportunityType.AMPLIFY_WINNER, GrowthOpportunityType.FILL_INVENTORY_GAP, GrowthOpportunityType.EXPLORE_RISING_TOPIC, GrowthOpportunityType.HIGH_CONVERSION_LOW_REACH];
  if (createTypes.includes(input.type)) {
    return { ...base, type: GrowthDecisionType.CREATE_IDEA, reasonCodes: [IDEA_DECISION_REASON.ACTIONABLE_CREATE] };
  }
  return { ...base, type: GrowthDecisionType.NO_ACTION, reasonCodes: [IDEA_DECISION_REASON.SCORE_OR_CONFIDENCE_LOW] };
}
