import {
  GrowthContentVersionAction, GrowthIdeaVersionAction,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertGrowthContentQuotaUnderLock, growthQuotaUtcStart, preflightGrowthContentQuota } from "@/lib/growth/economics/content-quotas";

const db = {
  growthSettings: { findUnique: vi.fn() },
  growthContentVersion: { count: vi.fn() },
  growthIdeaVersion: { count: vi.fn() },
};
const settings = { enabled: true, translatorCreatesPerDayCap: 1, translatorUpdatesPerDayCap: 3, ideaCreatesPerWeekCap: 2 };
const date = new Date("2026-10-25T12:00:00.000Z");

describe("Transactional Growth content quotas (under caller's settings row lock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.growthSettings.findUnique.mockResolvedValue(settings);
    db.growthContentVersion.count.mockResolvedValue(0);
    db.growthIdeaVersion.count.mockResolvedValue(0);
  });
  it("computes correct UTC day and Monday-start UTC week", () => {
    expect(growthQuotaUtcStart("TRANSLATOR_CREATE", date).toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(growthQuotaUtcStart("IDEA_CREATE", date).toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(growthQuotaUtcStart("IDEA_CREATE", new Date("2026-10-26T00:05:00Z")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
  it("allows one new Translator but refuses a second that UTC day", async () => {
    await expect(assertGrowthContentQuotaUnderLock(db as never, "TRANSLATOR_CREATE", date)).resolves.toBeUndefined();
    expect(db.growthContentVersion.count).toHaveBeenCalledWith({
      where: { action: GrowthContentVersionAction.CREATE, createdAt: { gte: new Date("2026-10-25T00:00:00Z") } },
    });
    db.growthContentVersion.count.mockResolvedValue(1);
    await expect(assertGrowthContentQuotaUnderLock(db as never, "TRANSLATOR_CREATE", date)).rejects.toThrow("TRANSLATOR_CREATE_LIMIT");
  });
  it("enforces three improvements/day separately from creations", async () => {
    db.growthContentVersion.count.mockResolvedValue(2);
    await expect(assertGrowthContentQuotaUnderLock(db as never, "TRANSLATOR_IMPROVE", date)).resolves.toBeUndefined();
    db.growthContentVersion.count.mockResolvedValue(3);
    await expect(assertGrowthContentQuotaUnderLock(db as never, "TRANSLATOR_IMPROVE", date)).rejects.toThrow("TRANSLATOR_IMPROVE_LIMIT");
    expect(db.growthContentVersion.count).toHaveBeenCalledWith({
      where: { action: GrowthContentVersionAction.IMPROVE, createdAt: { gte: new Date("2026-10-25T00:00:00Z") } },
    });
  });
  it("enforces two new Ideas per ISO-style UTC week", async () => {
    db.growthIdeaVersion.count.mockResolvedValue(2);
    await expect(assertGrowthContentQuotaUnderLock(db as never, "IDEA_CREATE", date)).rejects.toThrow("IDEA_CREATE_LIMIT");
    expect(db.growthIdeaVersion.count).toHaveBeenCalledWith({
      where: { action: GrowthIdeaVersionAction.CREATE, createdAt: { gte: new Date("2026-10-19T00:00:00Z") } },
    });
  });
  it("preflights a full quota without reserving AI spend, with the same UTC accounting", async () => {
    db.growthContentVersion.count.mockResolvedValue(1);
    await expect(preflightGrowthContentQuota("TRANSLATOR_CREATE", date, db as never))
      .rejects.toThrow("TRANSLATOR_CREATE_LIMIT");
    expect(db.growthContentVersion.count).toHaveBeenCalledWith({
      where: { action: GrowthContentVersionAction.CREATE, createdAt: { gte: new Date("2026-10-25T00:00:00Z") } },
    });
  });
  it("preflight is advisory: authoritative locked check still blocks a concurrent slot claim", async () => {
    db.growthIdeaVersion.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await expect(preflightGrowthContentQuota("IDEA_CREATE", date, db as never))
      .resolves.toBeUndefined();
    await expect(assertGrowthContentQuotaUnderLock(db as never, "IDEA_CREATE", date))
      .rejects.toThrow("IDEA_CREATE_LIMIT");
  });
  it("does not consume a quota for an Idea improvement", async () => {
    // Only CREATE_IDEA is subject to the accepted Ideas/week cap.
    db.growthIdeaVersion.count.mockResolvedValue(2);
    await expect(preflightGrowthContentQuota("TRANSLATOR_IMPROVE", date, db as never))
      .resolves.toBeUndefined();
    expect(db.growthIdeaVersion.count).not.toHaveBeenCalled();
  });
  it("fails closed on disabled Growth, invalid configuration, missing settings", async () => {
    db.growthSettings.findUnique.mockResolvedValueOnce({ ...settings, enabled: false });
    await expect(assertGrowthContentQuotaUnderLock(db as never, "IDEA_CREATE", date)).rejects.toThrow("GROWTH_DISABLED");
    db.growthSettings.findUnique.mockResolvedValueOnce({ ...settings, translatorCreatesPerDayCap: -1 });
    await expect(assertGrowthContentQuotaUnderLock(db as never, "TRANSLATOR_CREATE", date)).rejects.toThrow("INVALID_CONTENT_CAP");
    db.growthSettings.findUnique.mockResolvedValueOnce(null);
    await expect(assertGrowthContentQuotaUnderLock(db as never, "IDEA_CREATE", date)).rejects.toThrow("GROWTH_DISABLED");
    expect(db.growthContentVersion.count).not.toHaveBeenCalled();
  });
});
