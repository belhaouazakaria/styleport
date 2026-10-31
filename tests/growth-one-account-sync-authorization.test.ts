import { describe, expect, it } from "vitest";
import { validateOneAccountSyncApproval } from "../scripts/validate-growth-one-account-sync-request.mjs";

const sha = "a".repeat(40);
const context = { repository: "belhaouazakaria/styleport", ref: "refs/heads/main", sha };
const event = {
  action: "created",
  repository: { full_name: "belhaouazakaria/styleport", default_branch: "main" },
  sender: { login: "belhaouazakaria" },
  issue: { number: 82, state: "open", user: { login: "belhaouazakaria" },
    title: "SayTwist Growth one account sync " + sha,
    body: "ONE_SYNC_SHA=" + sha + "\nONE_SYNC_TARGET=saytwist.com" },
  comment: { user: { login: "belhaouazakaria" },
    body: "RUN SAYTWIST GROWTH ONE ACCOUNT SYNC " + sha },
};

describe("Phase14E exact owner-approved one account sync", () => {
  it("accepts the exact current main SHA", () => {
    expect(validateOneAccountSyncApproval(event, context)).toEqual({ sha, issueNumber: 82 });
  });
  it("rejects issue, SHA, author and approval changes", () => {
    expect(() => validateOneAccountSyncApproval({ ...event, sender: { login: "stranger" } }, context)).toThrow();
    expect(() => validateOneAccountSyncApproval({ ...event, issue: {
      ...event.issue, body: event.issue.body + "\nEXTRA" } }, context)).toThrow();
    expect(() => validateOneAccountSyncApproval({ ...event, comment: {
      ...event.comment, body: event.comment.body + " anything" } }, context)).toThrow();
    expect(() => validateOneAccountSyncApproval({ ...event, issue: {
      ...event.issue, pull_request: {} } }, context)).toThrow();
    expect(() => validateOneAccountSyncApproval(event, { ...context, sha: "b".repeat(40) })).toThrow();
  });
});
