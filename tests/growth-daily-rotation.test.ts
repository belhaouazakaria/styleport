import { describe, expect, it } from "vitest";
import {
  ROTATION_ROLES, assertActiveRotationAccount, planDailyRotation, utcDayIndex,
  type EligibleRotationAccount,
} from "@/lib/growth/portfolio/daily-rotation";

const accounts: EligibleRotationAccount[] = ROTATION_ROLES.map((role, i) => ({
  id: "account" + (i + 1), role, connected: true, hasWritableBoard: true,
}));
const day = "2026-11-10";

describe("4-5 daily Pins on only one of three rotating accounts", () => {
  it("rotates deterministically across all three roles without simultaneous activity", () => {
    const start = utcDayIndex(day);
    const rows = Array.from({ length: 6 }, (_, i) => {
      const d = new Date((start + i) * 86_400_000).toISOString().slice(0, 10);
      const plan = planDailyRotation(d, [...accounts].reverse());
      expect(plan.accountCount).toBe(3);
      expect(plan.targetPins).toBeGreaterThanOrEqual(4);
      expect(plan.targetPins).toBeLessThanOrEqual(5);
      expect(plan.original + plan.source).toBe(plan.targetPins);
      expect(plan.original).toBeGreaterThanOrEqual(2);
      expect(plan.source).toBeGreaterThanOrEqual(2);
      expect(plan.perPinOwnerApprovalRequired).toBe(true);
      return plan.accountId;
    });
    expect(new Set(rows.slice(0, 3)).size).toBe(3);
    expect(rows.slice(0,3)).toEqual(rows.slice(3,6));
  });
  it("rotates across only currently connected accounts; one account may run alone", () => {
    const one = planDailyRotation(day, [accounts[0], {
      ...accounts[1], connected: false,
    }, { ...accounts[2], hasWritableBoard: false }]);
    expect(one).toMatchObject({ accountId: accounts[0].id, accountCount: 1 });
    const two = [accounts[0], accounts[1]];
    const ids = Array.from({ length: 4 }, (_, i) =>
      planDailyRotation(new Date((utcDayIndex(day) + i) * 86_400_000)
        .toISOString().slice(0,10), two).accountId);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toBe(ids[2]);
    expect(planDailyRotation(day, accounts.map(a => ({
      ...a, connected: false,
    })))).toMatchObject({
      accountId: null, targetPins: 0,
      status: "NO_CONNECTED_ACCOUNTS",
    });
  });
  it("will not authorize a Pin for a non-rotating account", () => {
    const plan = planDailyRotation(day, accounts);
    expect(() => assertActiveRotationAccount(plan, plan.accountId!)).not.toThrow();
    const other = accounts.find(a => a.id !== plan.accountId)!;
    expect(() => assertActiveRotationAccount(plan, other.id))
      .toThrow("ROTATION_ACCOUNT_NOT_SCHEDULED_TODAY");
  });
  it("rejects duplicate role, duplicate account and impossible UTC calendar dates", () => {
    expect(() => planDailyRotation("2026-02-30", accounts)).toThrow("ROTATION_DAY_INVALID");
    expect(() => planDailyRotation(day, [accounts[0], accounts[0]])).toThrow(
      "ROTATION_ACCOUNT_INVALID");
    expect(() => planDailyRotation(day, [accounts[0], {
      ...accounts[1], role: accounts[0].role,
    }])).toThrow("ROTATION_ACCOUNT_INVALID");
    expect(() => planDailyRotation(day, [{
      ...accounts[0], id: "not valid",
    }])).toThrow("ROTATION_ACCOUNT_INVALID");
  });
});
