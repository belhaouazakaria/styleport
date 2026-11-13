import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  pins: vi.fn(),
  latest: vi.fn(),
  snapshots: vi.fn(),
  members: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthPinterestPin: { findMany: m.pins },
    growthOpportunityAnalysisRun: { findFirst: m.latest },
    growthContentClusterSnapshot: { findMany: m.snapshots },
    growthContentClusterMembership: { findMany: m.members },
  },
}));

import {
  chooseMaintenancePinId,
  selectMaintenancePinId,
  selectPrioritySnapshots,
} from "@/lib/growth/pinterest/maintenance-priority";

const cutoff = new Date("2026-11-13T20:00:00.000Z");
const old = new Date("2026-10-17T13:00:00.000Z");
const oneHourLater = new Date("2026-10-17T14:00:00.000Z");
const severalDaysLater = new Date("2026-10-21T14:00:00.000Z");
const accountId = "owned-account";

describe("pure bounded-maintenance Pin prioritization", () => {
  it("prefers the researched Pin only among similarly overdue requests", () => {
    expect(chooseMaintenancePinId([
      { id: "baseline", lastAnalyticsSyncAt: old },
      { id: "high-value", lastAnalyticsSyncAt: oneHourLater },
      { id: "too-new", lastAnalyticsSyncAt: severalDaysLater },
    ], new Set(["high-value", "too-new"]))).toBe("high-value");
  });

  it("cannot starve substantially older Pins for a more recent candidate", () => {
    expect(chooseMaintenancePinId([
      { id: "baseline", lastAnalyticsSyncAt: old },
      { id: "priority", lastAnalyticsSyncAt: severalDaysLater },
    ], new Set(["priority"]))).toBe("baseline");
  });

  it("gives never-synced Pins absolute precedence over previously fetched Pins", () => {
    expect(chooseMaintenancePinId([
      { id: "never", lastAnalyticsSyncAt: null },
      { id: "priority", lastAnalyticsSyncAt: old },
    ], new Set(["priority"]))).toBe("never");
    expect(chooseMaintenancePinId([
      { id: "never", lastAnalyticsSyncAt: null },
      { id: "never-priority", lastAnalyticsSyncAt: null },
      { id: "previous", lastAnalyticsSyncAt: old },
    ], new Set(["never-priority"]))).toBe("never-priority");
  });

  it("falls back deterministically on no match or an empty list", () => {
    expect(chooseMaintenancePinId([
      { id: "oldest", lastAnalyticsSyncAt: old },
    ], new Set())).toBe("oldest");
    expect(chooseMaintenancePinId([], new Set(["arbitrary"]))).toBeNull();
  });

  it("ranks clusters by observed outbound clicks per Pin, not total clicks", () => {
    const snapshots = [
      { id: "large", pinCount: 39, outboundClicks: 62n },
      { id: "focused", pinCount: 16, outboundClicks: 61n },
      { id: "zero", pinCount: 20, outboundClicks: 0n },
      { id: "small", pinCount: 2, outboundClicks: 2n },
    ];
    expect(selectPrioritySnapshots(snapshots)).toEqual(["focused", "large"]);
    expect(snapshots[0].id).toBe("large");
  });
});

describe("bounded-maintenance database selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.pins.mockResolvedValue([
      { id: "baseline", lastAnalyticsSyncAt: old },
      { id: "high-value", lastAnalyticsSyncAt: oneHourLater },
    ]);
    m.latest.mockResolvedValue({ id: "run-1" });
    m.snapshots.mockResolvedValue([
      { id: "cluster-1", pinCount: 39, outboundClicks: 62n },
      { id: "cluster-2", pinCount: 16, outboundClicks: 61n },
    ]);
    m.members.mockResolvedValue([{ pinId: "high-value" }]);
  });

  it("selects an owned active eligible Pin with only read-only queries", async () => {
    const id = await selectMaintenancePinId({
      accountId, initialBackfill: false, cutoff,
    });
    expect(id).toBe("high-value");
    expect(m.pins).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        accountId, isActive: true, analyticsEligible: true,
      }),
      take: 501,
    }));
    expect(m.latest).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        intelligenceModelVersion: "opportunity_intelligence_v2",
      }),
    }));
    expect(m.members).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        snapshotId: { in: ["cluster-2", "cluster-1"] },
      }),
    }));
    expect(m.pins).toHaveBeenCalledTimes(1);
  });

  it("honors the initial-backfill null-only scope", async () => {
    m.pins.mockResolvedValue([{ id: "never", lastAnalyticsSyncAt: null }]);
    const id = await selectMaintenancePinId({
      accountId, initialBackfill: true, cutoff,
    });
    expect(id).toBe("never");
    expect(m.pins).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ lastAnalyticsSyncAt: null }),
    }));
  });

  it("falls back to age ordering with no recent analysis", async () => {
    m.latest.mockResolvedValue(null);
    expect(await selectMaintenancePinId({
      accountId, initialBackfill: false, cutoff,
    })).toBe("baseline");
    expect(m.snapshots).not.toHaveBeenCalled();
    expect(m.members).not.toHaveBeenCalled();
  });

  it("falls back on snapshot/membership caps without partial prioritization", async () => {
    m.snapshots.mockResolvedValue(Array.from({ length: 101 }, (_, i) => ({
      id: String(i), pinCount: 2, outboundClicks: 1n,
    })));
    expect(await selectMaintenancePinId({
      accountId, initialBackfill: false, cutoff,
    })).toBe("baseline");
    expect(m.members).not.toHaveBeenCalled();
    m.snapshots.mockResolvedValue([
      { id: "cluster-1", pinCount: 39, outboundClicks: 62n },
    ]);
    m.members.mockResolvedValue(Array.from({ length: 501 }, () => ({
      pinId: "high-value",
    })));
    expect(await selectMaintenancePinId({
      accountId, initialBackfill: false, cutoff,
    })).toBe("baseline");
  });

  it("delegates to old selection if eligible pool exceeds the safe scan cap", async () => {
    m.pins.mockResolvedValue(Array.from({ length: 501 }, (_, i) => ({
      id: String(i), lastAnalyticsSyncAt: old,
    })));
    expect(await selectMaintenancePinId({
      accountId, initialBackfill: false, cutoff,
    })).toBeNull();
    expect(m.latest).not.toHaveBeenCalled();
  });

  it("returns no target when there is no due Pin, without extra queries", async () => {
    m.pins.mockResolvedValue([]);
    expect(await selectMaintenancePinId({
      accountId, initialBackfill: false, cutoff,
    })).toBeNull();
    expect(m.latest).not.toHaveBeenCalled();
  });
});
