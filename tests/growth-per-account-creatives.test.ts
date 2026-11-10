import { describe, expect, it } from "vitest";
import {
  DAILY_DESIGN_TARGET_PER_ACCOUNT, DAILY_PIN_TARGET_PER_ACCOUNT,
  planPerAccountCreatives, type AccountCreativeLane,
} from "@/lib/growth/portfolio/per-account-creatives";

function account(i: number): AccountCreativeLane {
  return {
    accountId: "account_" + i, persona: "publication " + i,
    connected: true, publicationsCommittedToday: 0,
    designsCommittedToday: 0,
    ideas: Array.from({ length: 12 }, (_, j) => ({
      topicKey: "translator-" + j,
      conceptKey: "angle-" + i + "-" + j,
      visualDirection: "layout-" + i + "-" + j,
    })),
  };
}
describe("account-specific daily creative planning", () => {
  it("targets ten distinct designs per connected account, not ten globally", () => {
    expect(DAILY_PIN_TARGET_PER_ACCOUNT).toBe(10);
    expect(DAILY_DESIGN_TARGET_PER_ACCOUNT).toBe(10);
    const one = planPerAccountCreatives([account(1)], 50);
    expect(one.accounts.map(x => x.scheduledDesigns.length)).toEqual([10]);
    expect(one.globalBudgetRemaining).toBe(40);
    const three = planPerAccountCreatives([account(1), account(2), account(3)], 50);
    expect(three.accounts.map(x => x.scheduledDesigns.length)).toEqual([10, 10, 10]);
    expect(three.globalBudgetRemaining).toBe(20);
    expect(three.publishAuthorizationsCreated).toBe(0);
    const eight = planPerAccountCreatives(Array.from({ length: 8 }, (_, i) => account(i + 1)), 100);
    expect(eight.accounts).toHaveLength(8);
    expect(eight.accounts.reduce((sum, x) => sum + x.scheduledDesigns.length, 0)).toBe(80);
  });
  it("allocates scarce AI budget round robin without multiplying permissions", () => {
    const plan = planPerAccountCreatives([account(3), account(2), account(1)], 7);
    expect(plan.accounts.map(x => x.scheduledDesigns.length)).toEqual([3, 2, 2]);
    expect(plan.globalBudgetRemaining).toBe(0);
    expect(plan.publishAuthorizationsCreated).toBe(0);
  });
  it("allows the same translator only with different ideas AND art direction", () => {
    const first = account(1);
    const second = account(2);
    first.ideas = [{ topicKey: "royal", conceptKey: "sample", visualDirection: "collage" }];
    second.ideas = [
      { topicKey: "royal", conceptKey: "sample", visualDirection: "editorial" },
      { topicKey: "royal", conceptKey: "new idea", visualDirection: "collage" },
      { topicKey: "royal", conceptKey: "new idea", visualDirection: "editorial" },
    ];
    const plan = planPerAccountCreatives([first, second], 10);
    expect(plan.accounts.map(x => x.scheduledDesigns.length)).toEqual([1, 1]);
    expect(plan.accounts[1].scheduledDesigns[0].conceptKey).toBe("new idea");
    expect(plan.accounts[1].scheduledDesigns[0].visualDirection).toBe("editorial");
  });
  it("counts existing commitments, excludes disconnected accounts and refuses malformed resource data", () => {
    const one = account(1);
    one.publicationsCommittedToday = 9;
    one.designsCommittedToday = 7;
    const two = account(2);
    two.connected = false;
    const plan = planPerAccountCreatives([one, two], 100);
    expect(plan.accounts).toHaveLength(1);
    expect(plan.accounts[0].scheduledDesigns).toHaveLength(1);
    expect(() => planPerAccountCreatives([account(1), account(1)], 100))
      .toThrow("ACCOUNT_LANE_INVALID");
    expect(() => planPerAccountCreatives([account(1)], -1))
      .toThrow("GLOBAL_BUDGET_INVALID");
  });
});
