import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const accountStore = readFileSync("lib/growth/portfolio/daily-rotation-store.ts", "utf8");
const ownedPublisher = readFileSync("lib/growth/publishing/service.ts", "utf8");
const sourceApproval = readFileSync("lib/growth/viral/source-publishing.ts", "utf8");
const sourceDrafts = readFileSync("lib/growth/viral/daily-source-drafts.ts", "utf8");
const dailyRunner = readFileSync("workers/growth-viral-discovery.ts", "utf8");
const fresh = readFileSync("workers/growth-daily-fresh-creatives.ts", "utf8");

describe("rotating source and owned creative separation", () => {
  it("selects production-only connected accounts with write scope and active boards", () => {
    expect(accountStore).toContain('apiEnvironment: "PRODUCTION"');
    expect(accountStore).toContain('connectionStatus: "CONNECTED"');
    expect(accountStore).toContain('encryptedCredentials: { not: null }');
    expect(accountStore).toContain('"pins:write"');
    expect(accountStore).toContain('boards: { some: { isActive: true } }');
    expect(accountStore).toContain("planDailyRotation");
  });
  it("never approves a creative for another account", () => {
    expect(ownedPublisher).toContain('candidate.accountId !== input.accountId');
    expect(ownedPublisher).toContain('row.candidate.accountId !== row.accountId');
    expect(ownedPublisher).toContain('assertViralPortfolioApproval(tx, "SAYTWIST", requestedAt, input.accountId)');
    expect(sourceApproval).toContain('assertActiveRotationAccount(rotation, input.accountId)');
    expect(sourceApproval).toContain('rotatingTarget: { source: rotation.source, saytwist: rotation.original }');
  });
  it("researches daily, produces only system-authored approved-for-review source art", () => {
    expect(dailyRunner).toContain('scanViralSourceCatalog(now)');
    expect(dailyRunner).toContain('mode === "ACTIVE"');
    expect(dailyRunner).toContain("prepareDailySourceCreativeDrafts(now)");
    expect(sourceDrafts).toContain('status: "DISCOVERED"');
    expect(sourceDrafts).toContain('item.rating.decision === "PRIORITY"');
    expect(sourceDrafts).toContain('prepareOriginalSourcePinDraft(concept.id, null)');
    expect(sourceDrafts).toContain('pinterestWrites: 0');
    expect(sourceDrafts).toContain('aiCalls: 0');
    expect(sourceApproval).toContain('userId === null ? GrowthActivityActorKind.SYSTEM');
  });
  it("generates AI designs only for the active account original share", () => {
    expect(fresh).toContain('readDailyRotation(dayStart)');
    expect(fresh).toContain('rotatingOwnedTarget: rotation.original');
    expect(fresh).toContain('accountId: rotation.accountId');
    expect(fresh).toContain('console.log("GROWTH_DAILY_FRESH_PINS_PUBLISHED=" + result.pinsPublished)');
    expect(fresh).toContain("pinsPublished: 0");
  });
});
