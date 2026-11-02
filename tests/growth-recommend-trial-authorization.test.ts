import { describe, expect, it } from "vitest";
import { validateGrowthRecommendTrialRequest } from "../scripts/validate-growth-recommend-trial-request.mjs";

const sha = "a".repeat(40);
const context = { repository: "belhaouazakaria/styleport", ref: "refs/heads/main", sha };
const event = {
  action: "created",
  repository: { full_name: "belhaouazakaria/styleport", default_branch: "main" },
  sender: { login: "belhaouazakaria" },
  issue: {
    number: 74, state: "open", user: { login: "belhaouazakaria" },
    title: "SayTwist Growth RECOMMEND one-shot " + sha,
    body: "RECOMMEND_TRIAL_SHA=" + sha + "\nRECOMMEND_TRIAL_TARGET=saytwist.com",
  },
  comment: {
    user: { login: "belhaouazakaria" },
    body: "RUN SAYTWIST GROWTH RECOMMEND ONE SHOT " + sha,
  },
};

describe("One-shot RECOMMEND owner authorization", () => {
  it("accepts exact owner-created issue + comment on trusted main", () => {
    expect(validateGrowthRecommendTrialRequest(event, context)).toEqual({ sha, issueNumber: 74 });
  });

  it("rejects other users, changed issue body, PRs and stale release hashes", () => {
    expect(() => validateGrowthRecommendTrialRequest({
      ...event, sender: { login: "not-owner" },
    }, context)).toThrow();
    expect(() => validateGrowthRecommendTrialRequest({
      ...event, issue: { ...event.issue, user: { login: "not-owner" } },
    }, context)).toThrow();
    expect(() => validateGrowthRecommendTrialRequest({
      ...event, issue: { ...event.issue, body: event.issue.body + "\nEXTRA=yes" },
    }, context)).toThrow();
    expect(() => validateGrowthRecommendTrialRequest({
      ...event, issue: { ...event.issue, pull_request: {} },
    }, context)).toThrow();
    expect(() => validateGrowthRecommendTrialRequest(event, { ...context, sha: "b".repeat(40) })).toThrow();
  });

  it("rejects partial or extra approval text and non-main events", () => {
    expect(() => validateGrowthRecommendTrialRequest({
      ...event, comment: { ...event.comment, body: event.comment.body + " extra" },
    }, context)).toThrow();
    expect(() => validateGrowthRecommendTrialRequest(event, {
      ...context, ref: "refs/heads/feature",
    })).toThrow();
  });
});
