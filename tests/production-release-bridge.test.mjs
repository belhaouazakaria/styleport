import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateProductionReleaseRequest } from "../scripts/authorize-production-release.mjs";

const sha = "a".repeat(40);
const context = {
  repository: "belhaouazakaria/styleport",
  ref: "refs/heads/main",
  sha,
};
const owner = { login: "belhaouazakaria" };

function approvedEvent() {
  return {
    action: "created",
    repository: { full_name: context.repository, default_branch: "main" },
    sender: owner,
    issue: {
      number: 42,
      state: "open",
      user: owner,
      title: "SayTwist production release " + sha,
      body: "RELEASE_SHA=" + sha + "\nRELEASE_TARGET=saytwist.com",
    },
    comment: {
      user: owner,
      body: "APPROVE SAYTWIST PRODUCTION DEPLOY " + sha,
    },
  };
}

describe("SayTwist production release bridge authorization", () => {
  it("accepts a genuine, exact-SHA owner issue comment", () => {
    expect(validateProductionReleaseRequest(approvedEvent(), context)).toEqual({
      sha,
      issueNumber: 42,
    });
  });

  it.each([
    ["different repository", { repository: "attacker/styleport" }],
    ["non-main ref", { ref: "refs/heads/staging" }],
    ["malformed SHA", { sha: "bad" }],
  ])("rejects %s", (_name, patch) => {
    expect(() => validateProductionReleaseRequest(approvedEvent(), { ...context, ...patch })).toThrow();
  });

  it.each([
    ["untrusted sender", e => { e.sender = { login: "stranger" }; }],
    ["untrusted commenter", e => { e.comment.user = { login: "stranger" }; }],
    ["untrusted issue author", e => { e.issue.user = { login: "stranger" }; }],
    ["wrong repository", e => { e.repository.full_name = "someone/else"; }],
    ["wrong default branch", e => { e.repository.default_branch = "develop"; }],
    ["edited rather than created comment", e => { e.action = "edited"; }],
    ["closed issue", e => { e.issue.state = "closed"; }],
    ["PR comment", e => { e.issue.pull_request = { url: "https://github.com/example/pull/1" }; }],
    ["wrong issue title", e => { e.issue.title += "!"; }],
    ["wrong issue SHA", e => { e.issue.body = "RELEASE_SHA=" + "b".repeat(40) + "\nRELEASE_TARGET=saytwist.com"; }],
    ["extra issue text", e => { e.issue.body += "\nUNREVIEWED=1"; }],
    ["other deployment target", e => { e.issue.body = "RELEASE_SHA=" + sha + "\nRELEASE_TARGET=staging"; }],
    ["wrong approval SHA", e => { e.comment.body = "APPROVE SAYTWIST PRODUCTION DEPLOY " + "b".repeat(40); }],
    ["extra comment text", e => { e.comment.body += "\n--force"; }],
    ["no explicit approval", e => { e.comment.body = "ship it"; }],
  ])("rejects %s", (_name, edit) => {
    const event = approvedEvent();
    edit(event);
    expect(() => validateProductionReleaseRequest(event, context)).toThrow();
  });

  it("requires the current exact main SHA to be independently checked in the workflow", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const bridge = readFileSync(path.join(root, ".github/workflows/production-release-bridge.yml"), "utf8");
    const original = readFileSync(path.join(root, ".github/workflows/deploy-hostinger.yml"), "utf8");
    expect(bridge).toContain("  issue_comment:");
    expect(bridge).toContain("types: [created]");
    expect(bridge).toContain("  actions: write");
    expect(bridge).toContain("  contents: read");
    expect(bridge).toContain("github.event.sender.login == 'belhaouazakaria'");
    expect(bridge).toContain("github.event.comment.user.login == 'belhaouazakaria'");
    expect(bridge).toContain("scripts/authorize-production-release.mjs");
    expect(bridge).toContain('gh api "repos/$GITHUB_REPOSITORY/branches/main"');
    expect(bridge).toContain('if [ "$CURRENT_MAIN_SHA" != "$GITHUB_SHA" ]; then');
    expect(bridge).toContain('gh workflow run deploy-hostinger.yml --ref main -f expected_release_sha="$GITHUB_SHA"');
    expect(bridge).not.toContain("HOSTINGER_SSH_PRIVATE_KEY");
    expect(bridge).not.toContain("hostinger-prepare-migration");
    expect(original).toContain("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'");
    expect(original).toContain('[ "$EXPECTED_RELEASE_SHA" != "$GITHUB_SHA" ]');
  });
});
