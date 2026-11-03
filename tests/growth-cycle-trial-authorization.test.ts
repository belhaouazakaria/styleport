import { describe, expect, it } from "vitest";
import { validateGrowthCycleTrialRequest } from "../scripts/validate-growth-cycle-trial-request.mjs";

const sha = "a".repeat(40);
const owner = { login: "belhaouazakaria" };
const context = { repository: "belhaouazakaria/styleport", ref: "refs/heads/main", sha };
function approved() {
  return {
    action: "created",
    repository: { full_name: context.repository, default_branch: "main" },
    sender: owner,
    issue: {
      number: 1071, state: "open", user: owner,
      title: "SayTwist Growth cycle one-shot trial " + sha,
      body: "GROWTH_CYCLE_TRIAL_SHA=" + sha + "\nGROWTH_CYCLE_TRIAL_TARGET=saytwist.com",
    },
    comment: { user: owner, body: "RUN SAYTWIST GROWTH CYCLE TRIAL " + sha },
  };
}
describe("Phase14I strict one-shot production trial authorization", () => {
  it("accepts only owner and exact trusted main SHA", () => {
    expect(validateGrowthCycleTrialRequest(approved(), context))
      .toEqual({ sha, issueNumber: 1071 });
  });
  it("rejects spoofed sender, PR comment, bad target, stale SHA, wrong approval", () => {
    const bad = [
      e => { e.sender = { login: "attacker" }; },
      e => { e.comment.user = { login: "attacker" }; },
      e => { e.issue.user = { login: "attacker" }; },
      e => { e.issue.pull_request = {}; },
      e => { e.issue.body += "\nEXTRA=true"; },
      e => { e.issue.title = "Incorrect issue"; },
      e => { e.comment.body += " "; },
      e => { e.issue.state = "closed"; },
    ];
    for (const change of bad) {
      const e = approved();
      change(e);
      expect(() => validateGrowthCycleTrialRequest(e, context)).toThrow();
    }
    expect(() => validateGrowthCycleTrialRequest(approved(),
      { ...context, sha: "b".repeat(40) })).toThrow();
    expect(() => validateGrowthCycleTrialRequest(approved(),
      { ...context, ref: "refs/heads/feature" })).toThrow();
  });
});
