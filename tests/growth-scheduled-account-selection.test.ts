import { describe, expect, it } from "vitest";
import {
  assertScheduledPinterestAccounts,
  chooseLeastRecentlyServed,
  isScheduledPinterestAccountReady,
  latestMaintenanceActivity,
} from "@/lib/growth/pinterest/scheduled-account-selection";

const now = new Date("2026-11-13T21:00:00.000Z");
function account(id: string, activeRole: string) {
  return {
    id, activeRole, encryptedCredentials: "encrypted",
    grantedScopes: ["user_accounts:read", "pins:read"],
    accessTokenExpiresAt: new Date("2026-12-01T00:00:00.000Z"),
    refreshTokenExpiresAt: null,
  };
}
const main = account("main", "SAYTWIST");
const ideas = account("ideas", "SAYTWIST_IDEAS");
const playground = account("playground", "SAYTWIST_PLAYGROUND");

describe("three-role scheduled Pinterest account scope", () => {
  it("accepts one, two, or three distinct assigned accounts", () => {
    for (const list of [[main], [main, ideas], [main, ideas, playground]]) {
      expect(() => assertScheduledPinterestAccounts(list)).not.toThrow();
    }
  });
  it("rejects empty, four-account, unassigned and duplicate-role sets", () => {
    for (const list of [
      [],
      [main, ideas, playground, account("fourth", "SAYTWIST")],
      [main, { ...ideas, activeRole: null }],
      [main, account("another", "SAYTWIST")],
      [main, { ...main }],
      [account("unknown", "SAYTWIST_COPY")],
    ]) {
      expect(() => assertScheduledPinterestAccounts(list)).toThrow(
        "SCHEDULED_PINTEREST_ACCOUNT_SCOPE_INVALID");
    }
  });
  it("accepts only credentialed, scoped, unexpired accounts", () => {
    expect(isScheduledPinterestAccountReady(main,
      ["pins:read"], now, 20 * 60_000)).toBe(true);
    for (const invalid of [
      { ...main, encryptedCredentials: null },
      { ...main, grantedScopes: ["pins:read"] },
      { ...main, accessTokenExpiresAt: new Date(now.getTime() + 5 * 60_000) },
      { ...main, refreshTokenExpiresAt: new Date(now.getTime() - 1) },
    ]) {
      expect(isScheduledPinterestAccountReady(invalid,
        ["user_accounts:read"], now, 20 * 60_000)).toBe(false);
    }
  });
});

describe("fairness across the one shared daily/maintenance slot", () => {
  it("selects least recently served, independent of input ordering", () => {
    const recent = new Date("2026-11-13T20:00:00.000Z");
    const old = new Date("2026-11-12T10:00:00.000Z");
    expect(chooseLeastRecentlyServed([
      { account: main, lastServedAt: recent },
      { account: playground, lastServedAt: old },
      { account: ideas, lastServedAt: null },
    ])).toBe(ideas);
    expect(chooseLeastRecentlyServed([
      { account: playground, lastServedAt: recent },
      { account: ideas, lastServedAt: old },
      { account: main, lastServedAt: recent },
    ])).toBe(ideas);
  });

  it("breaks equal timestamps in stable role order and never creates work", () => {
    expect(chooseLeastRecentlyServed([
      { account: playground, lastServedAt: null },
      { account: ideas, lastServedAt: null },
      { account: main, lastServedAt: null },
    ])).toBe(main);
    expect(chooseLeastRecentlyServed([])).toBeNull();
  });

  it("treats inventory or pin-analytics sync as work for fair maintenance", () => {
    const older = new Date("2026-11-10T00:00:00.000Z");
    const newer = new Date("2026-11-11T00:00:00.000Z");
    expect(latestMaintenanceActivity(older, newer)).toEqual(newer);
    expect(latestMaintenanceActivity(newer, older)).toEqual(newer);
    expect(latestMaintenanceActivity(null, older)).toEqual(older);
    expect(latestMaintenanceActivity(older, null)).toEqual(older);
    expect(latestMaintenanceActivity(null, null)).toBeNull();
  });
});
