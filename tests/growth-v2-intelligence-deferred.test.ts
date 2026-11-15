// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  readiness: vi.fn(),
  activity: vi.fn(),
  notification: vi.fn(),
  learning: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthViralProgramSettings: {
      findUnique: async () => ({ mode: "ACTIVE" }),
    },
    growthActivity: { create: m.activity },
    growthNotification: { upsert: m.notification },
  },
}));
vi.mock("@/lib/growth/google/sync", () => ({
  synchronizeGoogleAnalytics: async () => ({ status: "DISABLED" }),
}));
vi.mock("@/lib/growth/pinterest/account-readiness", () => ({
  auditPinterestReadiness: m.readiness,
}));
vi.mock("@/lib/growth/pinterest/coverage", () => ({
  refreshGrowthAnalyticsCoverage: async () => ({}),
}));
vi.mock("@/lib/growth/pinterest/queued-inventory", () => ({
  consumeQueuedPinterestInventory: vi.fn(),
}));
vi.mock("@/lib/growth/pinterest/automatic-recovery", () => ({
  runAutomaticAnalyticsRecovery: vi.fn(),
}));
vi.mock("@/lib/growth/viral/source-analytics", () => ({
  collectSourceExperimentAnalytics: vi.fn(),
}));
vi.mock("@/lib/growth/viral/analytics", () => ({
  evaluateTrackedViralPins: async () => ({}),
}));
vi.mock("@/lib/growth/viral/conversion", () => ({
  prepareViralWinnerConversions: async () => ({}),
  reconcileViralConversions: async () => ({}),
}));
vi.mock("@/lib/growth/viral/native-learning", () => ({
  learnViralNativeOutcomes: m.learning,
}));
import { runGrowthV2Intelligence } from "@/lib/growth/operations/v2-intelligence";
import { PinterestGlobalBudgetBlocked } from "@/lib/growth/pinterest/global-budget";
import { RetryableGrowthJobError } from "@/lib/growth/errors";
beforeEach(() => {
  vi.clearAllMocks();
  m.learning.mockResolvedValue({});
});
describe("Recoverable intelligence stages", () => {
  it.each([
    new PinterestGlobalBudgetBlocked("GLOBAL_QUOTA_EXHAUSTED"),
    new PinterestGlobalBudgetBlocked("PROVIDER_COOLDOWN"),
    new RetryableGrowthJobError("private provider detail", 60000),
  ])(
    "defers a bounded read and continues independent work without paging the owner",
    async (error) => {
      m.readiness.mockRejectedValueOnce(error);
      expect(
        (await runGrowthV2Intelligence(new Date(), {})).accountReadiness,
      ).toMatchObject({ status: "RETRY_LATER" });
      expect(m.learning).toHaveBeenCalledOnce();
      expect(m.notification).not.toHaveBeenCalled();
      expect(m.activity).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "GROWTH_V2_STAGE_DEFERRED" }),
        }),
      );
    },
  );
  it("still escalates an unsafe endpoint or nonrecoverable configuration error", async () => {
    m.readiness.mockRejectedValueOnce(
      new PinterestGlobalBudgetBlocked("UNSAFE_ENDPOINT"),
    );
    expect(
      (await runGrowthV2Intelligence(new Date(), {})).accountReadiness,
    ).toMatchObject({ status: "BLOCKED" });
    expect(m.notification).toHaveBeenCalledOnce();
    expect(m.learning).toHaveBeenCalledOnce();
  });
});
