import { describe, expect, it } from "vitest";
import { validateGrowthPreflightRequest } from "../scripts/validate-growth-preflight-request.mjs";

const sha = "a".repeat(40);
const ctx = { repository: "belhaouazakaria/styleport", ref: "refs/heads/main", sha };
const event = {
  action: "created", repository: { full_name: "belhaouazakaria/styleport", default_branch: "main" },
  sender: { login: "belhaouazakaria" },
  issue: {
    number: 90, state: "open", user: { login: "belhaouazakaria" },
    title: "SayTwist Growth preflight " + sha,
    body: "PREFLIGHT_SHA=" + sha + "\nPREFLIGHT_TARGET=saytwist.com",
  },
  comment: { user: { login: "belhaouazakaria" },
    body: "RUN SAYTWIST GROWTH READONLY PREFLIGHT " + sha },
};
describe("Production Growth preflight owner-approval gate", () => {
  it("accepts exact trusted owner request", () => {
    expect(validateGrowthPreflightRequest(event, ctx)).toEqual({ sha, issueNumber: 90 });
  });
  it("rejects third-party requests, PR comments, a changed default branch and SHA mismatch", () => {
    expect(() => validateGrowthPreflightRequest({ ...event, sender: { login: "attacker" } }, ctx)).toThrow();
    expect(() => validateGrowthPreflightRequest({
      ...event, issue: { ...event.issue, pull_request: { url: "x" } },
    }, ctx)).toThrow();
    expect(() => validateGrowthPreflightRequest({
      ...event, repository: { ...event.repository, default_branch: "staging" },
    }, ctx)).toThrow();
    expect(() => validateGrowthPreflightRequest(event, { ...ctx, sha: "b".repeat(40) })).toThrow();
  });
  it("rejects partial approval strings and changed issue bodies", () => {
    expect(() => validateGrowthPreflightRequest({
      ...event, comment: { ...event.comment, body: event.comment.body + " extra" },
    }, ctx)).toThrow();
    expect(() => validateGrowthPreflightRequest({
      ...event, issue: { ...event.issue, body: event.issue.body + "\nEXTRA=1" },
    }, ctx)).toThrow();
  });
});
