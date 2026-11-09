import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const executeRaw = vi.fn(async () => 1);
  const queryRawUnsafe = vi.fn(async () => { throw new Error("POSTGRES_VOID_DESERIALIZATION"); });
  const settingsUpdate = vi.fn(async () => ({
    mode: "REVIEW", sourceSharePercent: 50, maxPinsPerDay: 3, configVersion: 2,
  }));
  const settingsFindUnique = vi.fn(async () => ({ mode: "REVIEW" }));
  const activityFindFirst = vi.fn(async () => null);
  const activityCreate = vi.fn(async () => ({ id: "activity" }));
  const conceptFindFirst = vi.fn(async () => null);
  const conceptCreate = vi.fn(async () => ({ id: "concept" }));
  const conceptUpdate = vi.fn(async () => ({ id: "concept" }));
  const translatorFindMany = vi.fn(async () => []);
  const tx = {
    $executeRaw: executeRaw,
    $queryRawUnsafe: queryRawUnsafe,
    growthViralProgramSettings: { update: settingsUpdate, findUnique: settingsFindUnique },
    growthActivity: { findFirst: activityFindFirst, create: activityCreate },
    growthViralConcept: {
      findFirst: conceptFindFirst, create: conceptCreate, update: conceptUpdate,
    },
  };
  const transaction = vi.fn(async (callback: (arg: typeof tx) => Promise<unknown>) => callback(tx));
  return {
    tx, transaction, executeRaw, queryRawUnsafe, settingsUpdate,
    activityCreate, conceptCreate, translatorFindMany,
    discover: vi.fn(async () => [{
      source: "ANYTHING_TRANSLATE" as const,
      sourceUrl: "https://anythingtranslate.com/translators/royal-english/",
      title: "Royal English Translator",
    }]),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    translator: { findMany: mocks.translatorFindMany },
    growthViralConcept: { findFirst: mocks.tx.growthViralConcept.findFirst,
      create: mocks.conceptCreate, update: mocks.tx.growthViralConcept.update },
    growthActivity: { create: mocks.activityCreate },
  },
}));
vi.mock("@/lib/growth/viral/catalog", () => ({
  discoverAnythingTranslateTopics: mocks.discover,
}));

import {
  scanViralSourceCatalog, updateViralProgramSettings,
} from "@/lib/growth/viral/store";

describe("Viral Intelligence policy and catalog advisory-lock regression", () => {
  beforeEach(() => {
    for (const value of [
      mocks.transaction, mocks.executeRaw, mocks.queryRawUnsafe,
      mocks.settingsUpdate, mocks.activityCreate, mocks.conceptCreate,
      mocks.discover,
    ]) value.mockClear();
  });

  it("commits REVIEW policy update and audit with executable void-returning lock", async () => {
    const result = await updateViralProgramSettings(
      { mode: "REVIEW", sourceSharePercent: 50, maxPinsPerDay: 3 },
      "admin-test-user",
    );
    expect(result).toMatchObject({ mode: "REVIEW", configVersion: 2 });
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
    expect(mocks.queryRawUnsafe).not.toHaveBeenCalled();
    expect(mocks.settingsUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "global" },
      data: expect.objectContaining({ mode: "REVIEW", updatedById: "admin-test-user" }),
    }));
    expect(mocks.activityCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "VIRAL_PROGRAM_POLICY_CHANGED",
        correlationKey: "viral-settings-v2",
      }),
    }));
  });

  it("reserves a single daily research scan without querying a void lock result", async () => {
    const result = await scanViralSourceCatalog(new Date("2026-11-09T22:00:00Z"));
    expect(result).toMatchObject({ inspected: 1, created: 1, pinsPublished: 0, linksChanged: 0 });
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
    expect(mocks.queryRawUnsafe).not.toHaveBeenCalled();
    expect(mocks.activityCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "CATALOG_SCAN_RESERVED",
        correlationKey: "viral-catalog:2026-11-09" }),
    }));
    expect(mocks.activityCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "CATALOG_SCAN_ARCHIVED",
        correlationKey: "viral-catalog:2026-11-09" }),
    }));
    expect(mocks.conceptCreate).toHaveBeenCalledOnce();
  });

  it("rejects invalid policy input before any database write", async () => {
    await expect(updateViralProgramSettings(
      { mode: "ACTIVE", sourceSharePercent: 101, maxPinsPerDay: 3 },
      "admin-test-user",
    )).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });
});
