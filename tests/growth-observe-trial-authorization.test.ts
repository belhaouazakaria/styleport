import { describe, expect, it } from "vitest";
import { validateGrowthObserveTrialRequest } from "../scripts/validate-growth-observe-trial-request.mjs";

const sha = "a".repeat(40);
const context = { repository: "belhaouazakaria/styleport", ref: "refs/heads/main", sha };
const event = {
  action: "created",
  repository: { full_name: "belhaouazakaria/styleport", default_branch: "main" },
  sender: { login: "belhaouazakaria" },
  issue: {
    number: 74, state: "open", user: { login: "belhaouazakaria" },
    title: "SayTwist Growth OBSERVE one-shot " + sha,
    body: "OBSERVE_TRIAL_SHA=" + sha + "\nOBSERVE_TRIAL_TARGET=saytwist.com",
  },
  comment: {
    user: { login: "belhaouazakaria" },
    body: "RUN SAYTWIST GROWTH OBSERVE ONE SHOT " + sha,
  },
};

describe("One-shot OBSERVE owner authorization", () => {
  it("accepts exact owner-created issue + comment on trusted main", () => {
    expect(validateGrowthObserveTrialRequest(event, context)).toEqual({ sha, issueNumber: 74 });
  });

  it("rejects other users, changed issue body, PRs and stale release hashes", () => {
    expect(() => validateGrowthObserveTrialRequest({
      ...event, sender: { login: "not-owner" },
    }, context)).toThrow();
    expect(() => validateGrowthObserveTrialRequest({
      ...event, issue: { ...event.issue, user: { login: "not-owner" } },
    }, context)).toThrow();
    expect(() => validateGrowthObserveTrialRequest({
      ...event, issue: { ...event.issue, body: event.issue.body + "\nEXTRA=yes" },
    }, context)).toThrow();
    expect(() => validateGrowthObserveTrialRequest({
      ...event, issue: { ...event.issue, pull_request: {} },
    }, context)).toThrow();
    expect(() => validateGrowthObserveTrialRequest(event, { ...context, sha: "b".repeat(40) })).toThrow();
  });

  it("rejects partial or extra approval text and non-main events", () => {
    expect(() => validateGrowthObserveTrialRequest({
      ...event, comment: { ...event.comment, body: event.comment.body + " extra" },
    }, context)).toThrow();
    expect(() => validateGrowthObserveTrialRequest(event, {
      ...context, ref: "refs/heads/feature",
    })).toThrow();
  });
});
