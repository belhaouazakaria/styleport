import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = "belhaouazakaria/styleport";
const OWNER = "belhaouazakaria";
const TARGET = "saytwist.com";

export function validateGrowthCycleTrialRequest(event, context) {
  const { repository, ref, sha } = context;
  if (repository !== REPO || ref !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(sha || "")) throw Error("TRUSTED_MAIN_REQUIRED");
  if (event?.action !== "created" || event?.repository?.full_name !== REPO ||
      event?.repository?.default_branch !== "main" ||
      event?.issue?.pull_request || event?.issue?.state !== "open" ||
      !Number.isSafeInteger(event?.issue?.number) || event.issue.number < 1) {
    throw Error("ISSUE_INVALID");
  }
  if (event?.sender?.login !== OWNER || event?.comment?.user?.login !== OWNER ||
      event?.issue?.user?.login !== OWNER) throw Error("OWNER_REQUIRED");
  if (event.issue.title !== "SayTwist Growth cycle one-shot trial " + sha ||
      event.issue.body !== "GROWTH_CYCLE_TRIAL_SHA=" + sha +
        "\nGROWTH_CYCLE_TRIAL_TARGET=" + TARGET ||
      event.comment.body !== "RUN SAYTWIST GROWTH CYCLE TRIAL " + sha) {
    throw Error("EXACT_APPROVAL_REQUIRED");
  }
  return { sha, issueNumber: event.issue.number };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.GROWTH_CYCLE_TRIAL_EVENT_PATH, "utf8"));
    const result = validateGrowthCycleTrialRequest(event, {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    });
    console.log("GROWTH_CYCLE_TRIAL_OWNER_APPROVED=" + result.sha);
  } catch {
    console.error("GROWTH_CYCLE_TRIAL_AUTH=BLOCKED");
    process.exitCode = 1;
  }
}
