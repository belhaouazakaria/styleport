import type { GrowthPinterestPublicationRole } from "@prisma/client";

import type {
  BoardEligibility,
  IntentAlignment,
  StrategyReasonCode,
} from "@/lib/growth/strategy/contracts";

export function evaluateBoardEligibility(input: {
  accountConnected: boolean;
  accountBlocked: boolean;
  accountAlignment: IntentAlignment;
  active: boolean;
  privacy: string | null;
  pinCount: number;
  relevantPinCount: number;
}) {
  const reasons: StrategyReasonCode[] = [];
  if (!input.accountConnected)
    return {
      eligibility: "NOT_ELIGIBLE" as BoardEligibility,
      reasonCodes: ["ROLE_NOT_CONNECTED"] as StrategyReasonCode[],
    };
  if (input.accountBlocked)
    return {
      eligibility: "NOT_ELIGIBLE" as BoardEligibility,
      reasonCodes: ["ROLE_REAUTH_REQUIRED"] as StrategyReasonCode[],
    };
  if (!input.active)
    return {
      eligibility: "NOT_ELIGIBLE" as BoardEligibility,
      reasonCodes: ["BOARD_INACTIVE"] as StrategyReasonCode[],
    };
  const privacy = input.privacy?.toUpperCase() || null;
  if (privacy && privacy !== "PUBLIC")
    return {
      eligibility: "NOT_ELIGIBLE" as BoardEligibility,
      reasonCodes: ["BOARD_NOT_PUBLIC"] as StrategyReasonCode[],
    };
  if (input.pinCount === 0)
    return {
      eligibility: "INSUFFICIENT_DATA" as BoardEligibility,
      reasonCodes: ["BOARD_HAS_NO_PINS"] as StrategyReasonCode[],
    };
  if (
    !privacy ||
    input.relevantPinCount === 0 ||
    input.accountAlignment === "INSUFFICIENT_DATA"
  )
    reasons.push("BOARD_RELEVANCE_UNCLEAR");
  if (input.accountAlignment === "MIXED") reasons.push("INTENT_MIXED");
  if (input.accountAlignment === "MISALIGNED")
    reasons.push("INTENT_MISALIGNED");
  return reasons.length
    ? { eligibility: "NEEDS_REVIEW" as BoardEligibility, reasonCodes: reasons }
    : {
        eligibility: "ELIGIBLE" as BoardEligibility,
        reasonCodes: [] as StrategyReasonCode[],
      };
}

export function boardKey(
  accountRole: GrowthPinterestPublicationRole,
  pinterestBoardId: string,
) {
  return `${accountRole}:${pinterestBoardId}`;
}
