/** Conservative, deterministic reporting from complete, confirmed evidence only.
 * This module must not run AI, provider calls, publish Pins or mutate state.
 */
export interface DailyGrowthInsightEvidence {
  pinterestComplete: boolean;
  attributionComplete: boolean;
  topPin: { title: string; outboundClicks: number } | null;
}

export function deriveDailyGrowthInsights(evidence: DailyGrowthInsightEvidence) {
  const top = evidence.pinterestComplete && evidence.topPin &&
    Number.isSafeInteger(evidence.topPin.outboundClicks) &&
    evidence.topPin.outboundClicks > 0 ? evidence.topPin : null;

  const breakout = top
    ? `Top measured Pin: ${top.title} (${top.outboundClicks.toLocaleString("en-US")} outbound clicks)`
    : null;

  let nextAction: string;
  if (!evidence.pinterestComplete) {
    nextAction = "Review Pinterest analytics coverage before drawing performance conclusions.";
  } else if (!evidence.attributionComplete) {
    nextAction = "Review attribution readiness before optimizing for qualified translations.";
  } else if (top) {
    nextAction = "Review the leading Pin in Growth Analytics; any new Pin still requires individual approval.";
  } else {
    nextAction = "Review the complete daily metrics before proposing content changes.";
  }
  return { breakout, nextAction };
}
