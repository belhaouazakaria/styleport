import { describe, expect, it } from "vitest";
import { authorizePhase14SourceStaging } from "../scripts/authorize-growth-phase14-source-stage.mjs";

const sha = "a".repeat(40);
const context = { repository: "belhaouazakaria/styleport", ref: "refs/heads/main", sha };
const request = {
  action: "created", repository: { full_name: "belhaouazakaria/styleport", default_branch: "main" },
  sender: { login: "belhaouazakaria" },
  issue: { number: 900, state: "open", user: { login: "belhaouazakaria" },
    title: "SayTwist Growth Phase14 clone staging " + sha,
    body: "PHASE14_SOURCE_SHA=" + sha + "\nPHASE14_SOURCE_TARGET=saytwist-phase14-clone" },
  comment: { user: { login: "belhaouazakaria" },
    body: "STAGE SAYTWIST PHASE14 CLONE SOURCE " + sha },
};

describe("Phase14 protected source staging authorization", () => {
  it("accepts an exact current-main owner issue and owner comment", () => {
    expect(authorizePhase14SourceStaging(request, context)).toBe(sha);
  });
  it("rejects third parties, altered release identities and wrong branch", () => {
    expect(() => authorizePhase14SourceStaging(
      { ...request, sender: { login: "other" } }, context)).toThrow();
    expect(() => authorizePhase14SourceStaging(request, { ...context, sha: "b".repeat(40) })).toThrow();
    expect(() => authorizePhase14SourceStaging(request, { ...context, ref: "refs/heads/staging" })).toThrow();
    expect(() => authorizePhase14SourceStaging(
      { ...request, issue: { ...request.issue, user: { login: "other" } } }, context)).toThrow();
  });
  it("rejects PRs and extra or modified approval text", () => {
    expect(() => authorizePhase14SourceStaging(
      { ...request, issue: { ...request.issue, pull_request: {} } }, context)).toThrow();
    expect(() => authorizePhase14SourceStaging(
      { ...request, comment: { ...request.comment, body: request.comment.body + " extra" } }, context)).toThrow();
    expect(() => authorizePhase14SourceStaging(
      { ...request, issue: { ...request.issue, body: request.issue.body.replace("clone","production") } },
      context)).toThrow();
  });
});
