/**
 * Account-level creative planning. No database mutations, AI calls or Pin
 * approvals. Each connected publication has its own maximum of ten.
 *
 * Account identities are supplied from authenticated Pinterest connections.
 * Existing account-specific limits, global spend and provider budgets remain
 * separate, stricter admission gates at execution time.
 */
export const DAILY_PIN_TARGET_PER_ACCOUNT = 10;
export const DAILY_DESIGN_TARGET_PER_ACCOUNT = 10;

export type AccountCreativeLane = {
  accountId: string;
  persona: string;
  connected: boolean;
  publicationsCommittedToday: number;
  designsCommittedToday: number;
  ideas: Array<{
    topicKey: string;
    conceptKey: string;
    visualDirection: string;
  }>;
};
export type PlannedAccountCreative = {
  accountId: string;
  persona: string;
  scheduledDesigns: Array<{
    topicKey: string;
    conceptKey: string;
    visualDirection: string;
  }>;
  remainingPublicationSlots: number;
  remainingDesignSlots: number;
  status: "READY" | "BUDGET_LIMITED" | "NO_UNIQUE_IDEAS" | "SATISFIED";
};
export type PerAccountCreativePlan = {
  accounts: PlannedAccountCreative[];
  globalBudgetRemaining: number;
  publishAuthorizationsCreated: 0;
};

/**
 * Deterministically distributes global paid image budget across all healthy
 * accounts, round-robin. Never silently copies one account's creative to
 * another: a translator topic may repeat only with a different concept AND
 * different visual direction. This planner doesn't claim that any candidate
 * is approved for publishing.
 */
export function planPerAccountCreatives(
  lanes: readonly AccountCreativeLane[],
  globalBudgetedAdditionalDesigns: number,
): PerAccountCreativePlan {
  if (!Number.isSafeInteger(globalBudgetedAdditionalDesigns) ||
      globalBudgetedAdditionalDesigns < 0) throw Error("GLOBAL_BUDGET_INVALID");
  const ids = new Set<string>();
  const ready = lanes.filter(lane => lane.connected).sort((a,b) =>
    a.accountId.localeCompare(b.accountId));
  for (const lane of lanes) {
    if (!/^[A-Za-z0-9_-]{1,191}$/.test(lane.accountId) ||
        ids.has(lane.accountId) || !lane.persona.trim() ||
        lane.persona.length > 100 ||
        ![lane.publicationsCommittedToday, lane.designsCommittedToday].every(n =>
          Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000)) {
      throw Error("ACCOUNT_LANE_INVALID");
    }
    ids.add(lane.accountId);
  }
  const distinct = new Map<string, Array<{ conceptKey: string;
    visualDirection: string }>>();
  const queues = ready.map(lane => {
    const candidates = lane.ideas.filter(idea => {
      if (!idea.topicKey.trim() || !idea.conceptKey.trim() ||
          !idea.visualDirection.trim() ||
          [idea.topicKey, idea.conceptKey, idea.visualDirection]
            .some(value => value.length > 160)) {
        throw Error("ACCOUNT_CREATIVE_IDEA_INVALID");
      }
      return true;
    });
    return { lane, candidates,
      slots: Math.min(
        Math.max(0, DAILY_PIN_TARGET_PER_ACCOUNT - lane.publicationsCommittedToday),
        Math.max(0, DAILY_DESIGN_TARGET_PER_ACCOUNT - lane.designsCommittedToday),
      ),
      chosen: [] as typeof candidates,
    };
  });
  let remaining = globalBudgetedAdditionalDesigns;
  // A useful design must have both a distinct editorial concept and visual
  // treatment for a reused topic. Across accounts, disallow the same concept
  // or the same visual direction for that same topic.
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (remaining === 0) break;
      if (queue.chosen.length >= queue.slots) continue;
      while (queue.candidates.length) {
        const item = queue.candidates.shift()!;
        const key = item.topicKey.trim().toLowerCase();
        const concept = item.conceptKey.trim().toLowerCase();
        const direction = item.visualDirection.trim().toLowerCase();
        const previous = distinct.get(key) ?? [];
        if (previous.some(p => p.conceptKey === concept ||
            p.visualDirection === direction)) continue;
        const entry = { ...item };
        queue.chosen.push(entry);
        distinct.set(key, [...previous, { conceptKey: concept,
          visualDirection: direction }]);
        remaining--;
        progressed = true;
        break;
      }
    }
  }
  const accounts = queues.map(({ lane, chosen }) => {
    const remainingPublicationSlots = Math.max(
      0, DAILY_PIN_TARGET_PER_ACCOUNT - lane.publicationsCommittedToday);
    const remainingDesignSlots = Math.max(
      0, DAILY_DESIGN_TARGET_PER_ACCOUNT - lane.designsCommittedToday);
    const status = remainingPublicationSlots === 0 || remainingDesignSlots === 0
      ? "SATISFIED" as const
      : chosen.length > 0
        ? "READY" as const
        : remaining === 0
          ? "BUDGET_LIMITED" as const
          : "NO_UNIQUE_IDEAS" as const;
    return { accountId: lane.accountId, persona: lane.persona,
      scheduledDesigns: chosen, remainingPublicationSlots,
      remainingDesignSlots, status };
  });
  return { accounts, globalBudgetRemaining: remaining,
    publishAuthorizationsCreated: 0 };
}
