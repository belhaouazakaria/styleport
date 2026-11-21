// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  pending: vi.fn(),
  native: vi.fn(),
  sources: vi.fn(),
  rotation: vi.fn(),
  policy: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthApprovalRequest: { findMany: m.pending },
    growthPinPublication: { findMany: m.native },
    growthViralPinTest: { findMany: m.sources },
    growthViralProgramSettings: { findUnique: m.policy },
  },
}));
vi.mock("@/lib/growth/portfolio/daily-rotation-store", () => ({
  readDailyRotation: m.rotation,
}));
vi.mock("@/lib/growth/publishing/service", async () => {
  const { planPublicationTiming } =
    await import("@/lib/growth/publishing/timing");
  return {
    recommendPublicationTiming: async (
      _account: string,
      stableKey: string,
      now: Date,
      collisions: { scheduledAt: Date }[] = [],
    ) => planPublicationTiming({ stableKey, now, history: [], collisions }),
  };
});
import { recommendReviewSchedule } from "@/lib/growth/approvals/scheduling";
import { assertPublicationSpacing } from "@/lib/growth/approvals/spacing";
import { Prisma } from "@prisma/client";
const now = new Date("2026-11-16T08:00:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  m.pending.mockResolvedValue([]);
  m.native.mockResolvedValue([]);
  m.sources.mockResolvedValue([]);
  m.rotation.mockResolvedValue({
    accountId: "account",
    targetPins: 5,
    source: 3,
    original: 2,
  });
  m.policy.mockResolvedValue({ mode: "ACTIVE", maxPinsPerDay: 5 });
});
it("reserves pending review times across both channels before offering another Pin", async () => {
  const first = await recommendReviewSchedule(
    "account",
    "first",
    "SOURCE",
    now,
  );
  m.pending.mockResolvedValue([
    { kind: "SOURCE_PIN", snapshot: { scheduledAt: first.toISOString() } },
  ]);
  const second = await recommendReviewSchedule(
    "account",
    "first",
    "NATIVE",
    now,
  );
  expect(Math.abs(second.getTime() - first.getTime())).toBeGreaterThanOrEqual(
    90 * 60000,
  );
});
it("honors a source's anchored editorial waiting period", async () => {
  const earliest = new Date("2026-11-18T08:00:00Z");
  expect(
    (
      await recommendReviewSchedule(
        "account",
        "source",
        "SOURCE",
        now,
        undefined,
        earliest,
      )
    ).getTime(),
  ).toBeGreaterThanOrEqual(earliest.getTime());
});
it("offers source Pins only at the isolated publisher's actual UTC dispatch times", async () => {
  const scheduled = await recommendReviewSchedule(
    "account",
    "patrick-jane",
    "SOURCE",
    now,
  );
  expect(scheduled.toISOString()).toBe("2026-11-16T15:17:00.000Z");
});
it("fits two source dispatches around three committed native Pins on the same day", async () => {
  m.rotation.mockResolvedValue({
    accountId: "account",
    targetPins: 5,
    source: 2,
    original: 3,
  });
  m.native.mockResolvedValue(
    [14, 18, 23].map((hour) => ({
      scheduledAt: new Date(`2026-11-16T${hour}:00:00Z`),
    })),
  );
  const first = await recommendReviewSchedule(
    "account",
    "first-source",
    "SOURCE",
    now,
  );
  expect(first.toISOString()).toBe("2026-11-16T16:17:00.000Z");
  m.pending.mockResolvedValue([
    { kind: "SOURCE_PIN", snapshot: { scheduledAt: first.toISOString() } },
  ]);
  const second = await recommendReviewSchedule(
    "account",
    "second-source",
    "SOURCE",
    now,
  );
  expect(second.toISOString()).toBe("2026-11-16T20:17:00.000Z");
});
it("skips elapsed source ticks and respects a waiting period within the current day", async () => {
  const afterTick = new Date("2026-11-16T15:18:00Z");
  const earliest = new Date("2026-11-16T18:30:00Z");
  expect(
    (
      await recommendReviewSchedule(
        "account",
        "source",
        "SOURCE",
        afterTick,
        undefined,
        earliest,
      )
    ).toISOString(),
  ).toBe("2026-11-16T19:17:00.000Z");
});
it("moves to the next eligible rotation day after the last source dispatch", async () => {
  const late = new Date("2026-11-16T23:10:00Z");
  m.rotation.mockImplementation(async (day: Date) => ({
    accountId: day.toISOString().startsWith("2026-11-17")
      ? "other-account"
      : "account",
    targetPins: 5,
    source: 2,
    original: 3,
  }));
  expect(
    (
      await recommendReviewSchedule("account", "source", "SOURCE", late)
    ).toISOString(),
  ).toBe("2026-11-18T15:17:00.000Z");
});
it("rechecks both channels under the approval lock", async () => {
  const native = vi.fn().mockResolvedValue(0),
    source = vi.fn().mockResolvedValue(1);
  const tx = {
    growthPinPublication: { count: native },
    growthViralPinTest: { count: source },
  } as unknown as Prisma.TransactionClient;
  await expect(assertPublicationSpacing(tx, now)).rejects.toThrow(
    "REVIEW_SCHEDULE_COLLISION",
  );
  source.mockResolvedValue(0);
  await expect(assertPublicationSpacing(tx, now)).resolves.toBeUndefined();
  expect(source).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        scheduledAt: {
          gt: new Date(now.getTime() - 90 * 60000),
          lt: new Date(now.getTime() + 90 * 60000),
        },
      }),
    }),
  );
});
