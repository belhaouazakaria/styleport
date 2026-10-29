import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPOSITORY = "belhaouazakaria/styleport";
const OWNER = "belhaouazakaria";
const EXPECTED_TARGET = "saytwist.com";

export function validateGrowthPreflightRequest(event, context) {
  const { repository, ref, sha } = context;
  if (repository !== REPOSITORY || ref !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(sha || "")) {
    throw new Error("Expected trusted main and immutable SHA.");
  }
  if (event?.action !== "created" ||
      event?.repository?.full_name !== REPOSITORY ||
      event?.repository?.default_branch !== "main" ||
      event?.issue?.pull_request ||
      event?.issue?.state !== "open" ||
      !Number.isSafeInteger(event?.issue?.number)) {
    throw new Error("Expected open owner-created issue comment.");
  }
  if (event?.sender?.login !== OWNER ||
      event?.comment?.user?.login !== OWNER ||
      event?.issue?.user?.login !== OWNER) {
    throw new Error("Expected repository owner request and approval.");
  }
  if (event.issue.title !== "SayTwist Growth preflight " + sha ||
      event.issue.body !== "PREFLIGHT_SHA=" + sha +
        "\nPREFLIGHT_TARGET=" + EXPECTED_TARGET ||
      event.comment.body !== "RUN SAYTWIST GROWTH READONLY PREFLIGHT " + sha) {
    throw new Error("Exact SHA, issue body and approval mismatch.");
  }
  return { sha, issueNumber: event.issue.number };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.GROWTH_PREFLIGHT_EVENT_PATH, "utf8"));
    const result = validateGrowthPreflightRequest(event, {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    });
    console.log("OWNER_APPROVED_READONLY_PREFLIGHT:", result.sha);
  } catch (error) {
    console.error("::error::Growth preflight not authorized:", error instanceof Error ? error.message : "unknown");
    process.exitCode = 1;
  }
}
