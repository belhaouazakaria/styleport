/**
 * Deterministic, read-only Pinterest board lifecycle recommendations.
 * Never creates/renames/merges/deletes boards or publishes a Pin.
 * Caller must supply synchronized, trusted account-owned evidence.
 */
export type BoardEvidence = {
  id: string;
  accountId: string;
  name: string;
  topicKeys: readonly string[];
  visibility: "PUBLIC" | "SECRET" | "UNKNOWN";
  active: boolean;
  blocked: boolean;
  pinCount: number | null;
  qualifiedConversions: number | null;
  observationsComplete: boolean;
  lastSyncedAt: string | null;
};
export type BoardTopicDemand = {
  topicKey: string;
  eligibleContentCount: number;
  distinctConceptCount: number;
  qualifiedConversions: number | null;
  observationsComplete: boolean;
};
export type BoardRecommendation = {
  action: "REVIEW_OVERLAP" | "REVIEW_INACTIVE" | "REVIEW_TOPIC_GAP" | "KEEP";
  accountId: string;
  boardIds: string[];
  topicKey: string | null;
  reason: string;
  requiresOwnerApproval: true;
  providerMutation: false;
};

const key = (s: string) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);
const id = (s: string) => /^[A-Za-z0-9_-]{1,80}$/.test(s);
const count = (n: number | null) =>
  n === null || (Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000);
const sorted = (a: string, b: string) => a.localeCompare(b, "en");
const fresh = (value: string | null, now: Date) => {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value &&
    date.getTime() <= now.getTime() && now.getTime() - date.getTime() <= 72 * 3_600_000;
};

/** Bounded output, stable order and fail-closed data quality. */
export function adviseBoardLifecycle(input: {
  accountId: string;
  boards: readonly BoardEvidence[];
  demand: readonly BoardTopicDemand[];
  now: Date;
}): BoardRecommendation[] {
  const { accountId, boards, demand, now } = input;
  if (!id(accountId) || !Number.isFinite(now.getTime()) ||
      boards.length > 250 || demand.length > 100) throw Error("BOARD_ADVISOR_INVALID_INPUT");
  const ids = new Set<string>();
  const topics = new Set<string>();
  for (const b of boards) {
    if (!id(b.id) || ids.has(b.id) || b.accountId !== accountId ||
        b.name.trim().length < 2 || b.name.length > 100 ||
        b.topicKeys.length > 20 || new Set(b.topicKeys).size !== b.topicKeys.length ||
        !b.topicKeys.every(key) || !count(b.pinCount) || !count(b.qualifiedConversions)) {
      throw Error("BOARD_ADVISOR_INVALID_BOARD");
    }
    ids.add(b.id);
  }
  for (const d of demand) {
    if (!key(d.topicKey) || topics.has(d.topicKey) ||
        !Number.isSafeInteger(d.eligibleContentCount) || d.eligibleContentCount < 0 ||\n        d.eligibleContentCount > 1_000_000_000 ||\n        !Number.isSafeInteger(d.distinctConceptCount) || d.distinctConceptCount < 0 ||\n        d.distinctConceptCount > 1_000_000_000 ||
        !count(d.qualifiedConversions)) throw Error("BOARD_ADVISOR_INVALID_DEMAND");
    topics.add(d.topicKey);
  }
  const eligible = boards.filter(b => b.active && !b.blocked &&
    b.visibility === "PUBLIC" && b.observationsComplete && fresh(b.lastSyncedAt, now));
  const result: BoardRecommendation[] = [];
  // Overlap is advisory, not proof that two boards should merge. Require
  // a shared majority of each board's tagged topics and a real inventory.
  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i];
    if (!a.topicKeys.length || (a.pinCount ?? 0) < 5) continue;
    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j];
      if (!b.topicKeys.length || (b.pinCount ?? 0) < 5) continue;
      const shared = a.topicKeys.filter(t => b.topicKeys.includes(t));
      if (shared.length < 1 ||
          shared.length / a.topicKeys.length < 0.8 ||
          shared.length / b.topicKeys.length < 0.8) continue;
      result.push({
        action: "REVIEW_OVERLAP", accountId,
        boardIds: [a.id, b.id].sort(sorted), topicKey: null,
        reason: "HIGH_TOPIC_OVERLAP_REQUIRES_HUMAN_EDITORIAL_REVIEW",
        requiresOwnerApproval: true, providerMutation: false,
      });
    }
  }
  for (const b of boards) {
    // Never propose deletion, including for private or blocked boards.
    if (b.active || b.visibility !== "PUBLIC" || b.blocked ||
        !b.observationsComplete || !fresh(b.lastSyncedAt, now) ||
        b.pinCount === null || b.pinCount > 0) continue;
    result.push({
      action: "REVIEW_INACTIVE", accountId, boardIds: [b.id], topicKey: null,
      reason: "EMPTY_INACTIVE_BOARD_REQUIRES_HUMAN_REVIEW",
      requiresOwnerApproval: true, providerMutation: false,
    });
  }
  for (const d of demand) {
    if (!d.observationsComplete || d.qualifiedConversions === null ||
        d.qualifiedConversions < 3 || d.eligibleContentCount < 12 ||
        d.distinctConceptCount < 5) continue;
    // Incomplete board inventory means unknown coverage, not a topic gap.
    if (!boards.length || boards.some(b =>
      !b.observationsComplete || !fresh(b.lastSyncedAt, now))) continue;
    if (eligible.some(b => b.topicKeys.includes(d.topicKey))) continue;
    result.push({
      action: "REVIEW_TOPIC_GAP", accountId, boardIds: [],
      topicKey: d.topicKey, reason: "SUSTAINED_TOPIC_DEMAND_WITHOUT_ELIGIBLE_PUBLIC_BOARD",
      requiresOwnerApproval: true, providerMutation: false,
    });
  }
  if (!result.length) {
    result.push({
      action: "KEEP", accountId, boardIds: [], topicKey: null,
      reason: "NO_ACTIONABLE_BOARD_LIFECYCLE_EVIDENCE",
      requiresOwnerApproval: true, providerMutation: false,
    });
  }
  return result.sort((a, b) =>
    a.action.localeCompare(b.action) ||
    a.boardIds.join(",").localeCompare(b.boardIds.join(",")) ||
    (a.topicKey ?? "").localeCompare(b.topicKey ?? "")).slice(0, 100);
}
