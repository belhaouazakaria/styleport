import { describe, expect, it } from "vitest";
import { adviseBoardLifecycle, type BoardEvidence } from "@/lib/growth/portfolio/board-lifecycle";

const now = new Date("2026-11-07T03:00:00.000Z");
const board = (id: string, overrides: Partial<BoardEvidence> = {}): BoardEvidence => ({
  id, accountId: "account-1", name: "Language Ideas", topicKeys: ["language", "texting"],
  visibility: "PUBLIC", active: true, blocked: false, pinCount: 20,
  qualifiedConversions: 5, observationsComplete: true,
  lastSyncedAt: "2026-11-07T02:00:00.000Z", ...overrides,
});
const run = (boards: BoardEvidence[], demand: Parameters<typeof adviseBoardLifecycle>[0]["demand"] = []) =>
  adviseBoardLifecycle({ accountId: "account-1", boards, demand, now });

describe("Pinterest board lifecycle advisor", () => {
  it("flags genuine topic overlap for human review without mutating boards", () => {
    const r = run([board("one"), board("two", { name: "Texting Tips" })]);
    expect(r).toEqual([{
      action: "REVIEW_OVERLAP", accountId: "account-1",
      boardIds: ["one", "two"], topicKey: null,
      reason: "HIGH_TOPIC_OVERLAP_REQUIRES_HUMAN_EDITORIAL_REVIEW",
      requiresOwnerApproval: true, providerMutation: false,
    }]);
  });
  it("rejects overlap when board concepts are not substantively aligned", () => {
    expect(run([board("one"), board("two", { topicKeys: ["texting", "food"] })])[0].action)
      .toBe("KEEP");
  });
  it("only reviews a fresh empty inactive public board, never proposes deletion", () => {
    expect(run([board("one", { active: false, pinCount: 0 })])[0].action)
      .toBe("REVIEW_INACTIVE");
    for (const overrides of [
      { visibility: "SECRET" as const }, { blocked: true },
      { pinCount: 2 }, { lastSyncedAt: "2026-10-01T00:00:00.000Z" },
      { observationsComplete: false },
    ]) expect(run([board("one", { active: false, pinCount: 0, ...overrides })])[0].action)
      .toBe("KEEP");
  });
  it("requires real observed conversion and content depth before suggesting a topic board", () => {
    const signal = {
      topicKey: "birthday", eligibleContentCount: 15,
      distinctConceptCount: 6, qualifiedConversions: 5, observationsComplete: true,
    };
    expect(run([board("one")], [signal]).map(x => x.action)).toEqual(["REVIEW_TOPIC_GAP"]);
    for (const patch of [
      { qualifiedConversions: null }, { qualifiedConversions: 0 },
      { eligibleContentCount: 3 }, { distinctConceptCount: 2 },
      { observationsComplete: false },
    ]) expect(run([board("one")], [{ ...signal, ...patch }])[0].action).toBe("KEEP");
    expect(run([board("one", { topicKeys: ["birthday"] })], [signal])[0].action)
      .toBe("KEEP");
    expect(run([], [signal])[0].action).toBe("KEEP");
    expect(run([board("one", { lastSyncedAt: null })], [signal])[0].action)
      .toBe("KEEP");
  });
  it("rejects mixed-account inventory, duplicate identifiers and invalid counts", () => {
    expect(() => run([board("one", { accountId: "other" })])).toThrow();
    expect(() => run([board("one"), board("one")])).toThrow();
    expect(() => run([board("one", { pinCount: -1 })])).toThrow();
    expect(() => run([board("one", { topicKeys: ["language", "language"] })])).toThrow();
    expect(() => run([board("one")], [{
      topicKey: "bad key", eligibleContentCount: 15,
      distinctConceptCount: 5, qualifiedConversions: 4, observationsComplete: true,
    }])).toThrow();
  });
  it("is deterministic under board reorder and never performs provider mutations", () => {
    const a = [board("two"), board("one"), board("three", { topicKeys: ["food"] })];
    const b = [...a].reverse();
    expect(run(a)).toEqual(run(b));
    for (const advice of run(a)) {
      expect(advice.requiresOwnerApproval).toBe(true);
      expect(advice.providerMutation).toBe(false);
    }
  });
});
