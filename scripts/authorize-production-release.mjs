import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPOSITORY = "belhaouazakaria/styleport";
const OWNER = "belhaouazakaria";
const REF = "refs/heads/main";

export function validateProductionReleaseRequest(event, { repository, ref, sha }) {
  if (repository !== REPOSITORY || ref !== REF) {
    throw new Error("Production release bridge only permits the trusted main branch.");
  }
  if (!/^[a-f0-9]{40}$/.test(sha || "")) {
    throw new Error("Production release SHA must be exactly 40 lowercase hexadecimal characters.");
  }
  if (event?.action !== "created" || event?.repository?.full_name !== REPOSITORY ||
      event?.repository?.default_branch !== "main") {
    throw new Error("Untrusted release event or repository.");
  }
  if (!Number.isSafeInteger(event?.issue?.number) || event.issue.number < 1 ||
      event?.issue?.state !== "open" || event?.issue?.pull_request) {
    throw new Error("A new approval comment on an open issue is required.");
  }
  if (event?.sender?.login !== OWNER || event?.comment?.user?.login !== OWNER ||
      event?.issue?.user?.login !== OWNER) {
    throw new Error("Release requests and approvals must originate from the repository owner.");
  }
  if (event.issue.title !== "SayTwist production release " + sha ||
      event.issue.body !== "RELEASE_SHA=" + sha + "\nRELEASE_TARGET=saytwist.com") {
    throw new Error("Release request must contain the exact current commit and target.");
  }
  if (event.comment.body !== "APPROVE SAYTWIST PRODUCTION DEPLOY " + sha) {
    throw new Error("Explicit, exact-SHA owner approval is required.");
  }
  return { sha, issueNumber: event.issue.number };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.RELEASE_EVENT_PATH, "utf8"));
    const accepted = validateProductionReleaseRequest(event, {
      repository: process.env.RELEASE_REPOSITORY,
      ref: process.env.RELEASE_REF,
      sha: process.env.RELEASE_SHA,
    });
    process.stdout.write("Release request authorized for " + accepted.sha + "\n");
  } catch (error) {
    process.stderr.write("::error::Release bridge authorization rejected: " +
      (error instanceof Error ? error.message : "Unknown error") + "\n");
    process.exitCode = 1;
  }
}
