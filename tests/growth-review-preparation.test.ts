// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  source: vi.fn(),
  prior: vi.fn(),
  candidate: vi.fn(),
  plan: vi.fn(),
  settings: vi.fn(),
  account: vi.fn(),
  schedule: vi.fn(),
  transaction: vi.fn(),
  activity: vi.fn(),
  sourceReview: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthPinCandidate: {
      findMany: mocks.native,
      findUniqueOrThrow: mocks.candidate,
    },
    growthViralPinTest: { findMany: mocks.source },
    growthApprovalRequest: { findMany: mocks.prior },
    growthSettings: { findUniqueOrThrow: mocks.settings },
    growthPinterestAccount: { findUniqueOrThrow: mocks.account },
    growthActivity: { create: mocks.activity },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/growth/publishing/service", () => ({
  recommendPinApprovalPlan: mocks.plan,
  approvePinCandidate: vi.fn(),
  rejectPinCandidate: vi.fn(),
}));
vi.mock("@/lib/growth/approvals/scheduling", () => ({
  recommendReviewSchedule: mocks.schedule,
}));
vi.mock("@/lib/growth/approvals/source-plan", () => ({
  prepareSourceReviewAutomatically: mocks.sourceReview,
}));
import { preparePendingOwnerReviews } from "@/lib/growth/approvals/service";

const now = new Date("2026-11-18T12:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_BASE_URL", "https://saytwist.com");
  mocks.native.mockResolvedValue([
    { id: "blocked" },
    { id: "ready" },
    { id: "later" },
  ]);
  mocks.source.mockResolvedValue([
    { id: "source1" },
    { id: "source2" },
    { id: "source3" },
  ]);
  mocks.prior.mockResolvedValue([]);
  mocks.candidate.mockResolvedValue({
    id: "ready",
    status: "READY",
    revision: 1,
    title: "Ready translator",
    description: "An original translator creative.",
    destinationPath: "/translators/ready",
    contentHash: "a".repeat(64),
    asset: {
      state: "READY",
      generationKind: "AI",
      mimeType: "image/png",
      width: 1000,
      height: 1500,
      checksum: "b".repeat(64),
      publicPath:
        "/generated/growth-creatives/creative-" + "b".repeat(64) + ".png",
    },
  });
  mocks.plan.mockImplementation(async (id: string) => {
    if (id === "blocked") throw Error("PIN_PLAN_BOARD_AMBIGUOUS");
    return { accountId: "account", boardId: "board", boardName: "Translators" };
  });
  mocks.settings.mockResolvedValue({
    defaultPinterestDestinationDomain: "saytwist.com",
  });
  mocks.account.mockResolvedValue({ username: "saytwist" });
  mocks.schedule.mockResolvedValue(new Date("2026-11-21T14:00:00Z"));
  mocks.transaction.mockResolvedValue({ id: "review", status: "PENDING" });
});
afterEach(() => vi.unstubAllEnvs());

it("prepares the next native draft when an older draft has no matching board", async () => {
  expect(await preparePendingOwnerReviews("owner", now)).toEqual({
    prepared: 3,
  });
  expect(mocks.plan.mock.calls.map((c) => c[0])).toEqual(["blocked", "ready"]);
  expect(mocks.transaction).toHaveBeenCalledTimes(1);
  expect(mocks.sourceReview.mock.calls.map((c) => c[0])).toEqual([
    "source1",
    "source2",
  ]);
  expect(mocks.activity).toHaveBeenCalledWith({
    data: expect.objectContaining({
      entityId: "blocked",
      summary: {
        source: false,
        providerWrites: 0,
        errorCode: "PIN_PLAN_BOARD_AMBIGUOUS",
      },
    }),
  });
});

it("keeps existing pending, approved and rejected subjects out of the queue", async () => {
  mocks.prior.mockResolvedValue([
    { subjectId: "blocked" },
    { subjectId: "ready" },
    { subjectId: "source1" },
  ]);
  expect(await preparePendingOwnerReviews("owner", now)).toEqual({
    prepared: 3,
  });
  expect(mocks.plan.mock.calls.map((c) => c[0])).toEqual(["later"]);
  expect(mocks.sourceReview.mock.calls.map((c) => c[0])).toEqual([
    "source2",
    "source3",
  ]);
});

it("records a bounded error code without persisting sensitive exception text", async () => {
  mocks.native.mockResolvedValue([{ id: "blocked" }]);
  mocks.source.mockResolvedValue([]);
  mocks.plan.mockRejectedValue(
    Error("Database failure containing private credentials"),
  );
  expect(await preparePendingOwnerReviews("owner", now)).toEqual({
    prepared: 0,
  });
  expect(mocks.activity).toHaveBeenCalledWith({
    data: expect.objectContaining({
      summary: {
        source: false,
        providerWrites: 0,
        errorCode: "REVIEW_PREPARATION_FAILED",
      },
    }),
  });
});
