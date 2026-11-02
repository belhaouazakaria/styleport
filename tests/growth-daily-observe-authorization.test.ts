import { describe, expect, it } from "vitest";
import { validateDailyObserveTrialApproval } from "../scripts/validate-growth-daily-observe-request.mjs";

const sha = "a".repeat(40);
const context = { repository: "belhaouazakaria/styleport", ref: "refs/heads/main", sha };
const event = {
  action: "created",
  repository: { full_name: "belhaouazakaria/styleport", default_branch: "main" },
  sender: { login: "belhaouazakaria" },
  issue: { number: 82, state: "open", user: { login: "belhaouazakaria" },
    title: "SayTwist Growth daily OBSERVE trial " + sha,
    body: "DAILY_OBSERVE_TRIAL_SHA=" + sha + "\nDAILY_OBSERVE_TRIAL_TARGET=saytwist.com" },
  comment: { user: { login: "belhaouazakaria" },
    body: "RUN SAYTWIST GROWTH DAILY OBSERVE TRIAL " + sha },
};

describe("Phase14G exact owner-approved daily OBSERVE trial", () => {
  it("accepts the exact current main SHA", () => {
    expect(validateDailyObserveTrialApproval(event, context)).toEqual({ sha, issueNumber: 82 });
  });
  it("rejects issue, SHA, author and approval changes", () => {
    expect(() => validateDailyObserveTrialApproval({ ...event, sender: { login: "stranger" } }, context)).toThrow();
    expect(() => validateDailyObserveTrialApproval({ ...event, issue: {
      ...event.issue, body: event.issue.body + "\nEXTRA" } }, context)).toThrow();
    expect(() => validateDailyObserveTrialApproval({ ...event, comment: {
      ...event.comment, body: event.comment.body + " anything" } }, context)).toThrow();
    expect(() => validateDailyObserveTrialApproval({ ...event, issue: {
      ...event.issue, pull_request: {} } }, context)).toThrow();
    expect(() => validateDailyObserveTrialApproval(event, { ...context, sha: "b".repeat(40) })).toThrow();
  });
});
