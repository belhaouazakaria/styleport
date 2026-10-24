import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  transitionList: vi.fn(),
  lock: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthActivity: { findMany: mocks.list },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      $queryRaw: mocks.lock,
      growthActivity: { findMany: mocks.transitionList, create: mocks.activity },
    }),
  },
}));
import { stateFromWarningActions, listGrowthBudgetWarnings, transitionGrowthBudgetWarning } from "@/lib/growth/economics/warnings";

const input = { warningId: "warn_1", transition: "ACKNOWLEDGE" as const, actorUserId: "admin_1" };
describe("Growth budget warning audit transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lock.mockResolvedValue([{ id: "warn_1" }]);
    mocks.transitionList.mockResolvedValue([]);
    mocks.activity.mockResolvedValue({ id: "new-activity" });
  });
  it("derives status from append-only events", () => {
    expect(stateFromWarningActions([])).toBe("OPEN");
    expect(stateFromWarningActions(["AI_BUDGET_WARNING_ACKNOWLEDGED"])).toBe("ACKNOWLEDGED");
    expect(stateFromWarningActions(["AI_BUDGET_WARNING_ACKNOWLEDGED","AI_BUDGET_WARNING_RESOLVED"])).toBe("RESOLVED");
  });
  it("acknowledges only with actor provenance under row lock", async () => {
    await expect(transitionGrowthBudgetWarning(input)).resolves.toEqual({ state: "ACKNOWLEDGED", reused: false });
    expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "AI_BUDGET_WARNING_ACKNOWLEDGED", actorUserId: "admin_1",
        fromState: "OPEN", toState: "ACKNOWLEDGED", entityId: "warn_1",
      }),
    }));
  });
  it("rejects resolution before acknowledgement and resolved-to-open", async () => {
    await expect(transitionGrowthBudgetWarning({ ...input, transition: "RESOLVE" }))
      .rejects.toThrow("ACKNOWLEDGMENT_REQUIRED");
    mocks.transitionList.mockResolvedValue([{ action: "AI_BUDGET_WARNING_RESOLVED" }]);
    await expect(transitionGrowthBudgetWarning(input)).rejects.toThrow("WARNING_ALREADY_RESOLVED");
  });
  it("treats repeated acknowledgment as idempotent, not another activity entry", async () => {
    mocks.transitionList.mockResolvedValue([{ action: "AI_BUDGET_WARNING_ACKNOWLEDGED" }]);
    await expect(transitionGrowthBudgetWarning(input)).resolves.toMatchObject({ state: "ACKNOWLEDGED", reused: true });
    expect(mocks.activity).not.toHaveBeenCalled();
    await expect(transitionGrowthBudgetWarning({ ...input, transition: "RESOLVE" })).resolves.toMatchObject({ state: "RESOLVED", reused: false });
  });
  it("requires an existing warning and safe IDs", async () => {
    mocks.lock.mockResolvedValue([]);
    await expect(transitionGrowthBudgetWarning(input)).rejects.toThrow("WARNING_NOT_FOUND");
    await expect(transitionGrowthBudgetWarning({ ...input, actorUserId: "../bad" })).rejects.toThrow("INVALID_TRANSITION");
  });
  it("lists bounded alert events and their acknowledgments", async () => {
    mocks.list.mockResolvedValueOnce([{ id: "warn_1", createdAt: new Date("2026-10-24T11:00:00Z"), entityId: "r1", summary: { thresholdPercent: 70 } }])
      .mockResolvedValueOnce([{ entityId: "warn_1", action: "AI_BUDGET_WARNING_ACKNOWLEDGED" }]);
    await expect(listGrowthBudgetWarnings()).resolves.toMatchObject([{
      id: "warn_1", thresholdPercent: 70, state: "ACKNOWLEDGED",
    }]);
    expect(mocks.list.mock.calls[0][0].take).toBe(50);
  });
});
