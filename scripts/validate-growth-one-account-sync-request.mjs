import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateOneAccountSyncApproval(event, context) {
  const sha = context.sha;
  const repo = "belhaouazakaria/styleport";
  const owner = "belhaouazakaria";
  if (context.repository !== repo || context.ref !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(sha || "") ||
      event?.action !== "created" || event?.repository?.full_name !== repo ||
      event?.repository?.default_branch !== "main" ||
      event?.issue?.pull_request || event?.issue?.state !== "open" ||
      !Number.isSafeInteger(event?.issue?.number) ||
      event?.sender?.login !== owner ||
      event?.comment?.user?.login !== owner ||
      event?.issue?.user?.login !== owner ||
      event.issue.title !== "SayTwist Growth one account sync " + sha ||
      event.issue.body !== "ONE_SYNC_SHA=" + sha + "\nONE_SYNC_TARGET=saytwist.com" ||
      event.comment.body !== "RUN SAYTWIST GROWTH ONE ACCOUNT SYNC " + sha) {
    throw Error("ONE_SYNC_OWNER_APPROVAL_REJECTED");
  }
  return { sha, issueNumber: event.issue.number };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.GROWTH_ONE_SYNC_EVENT_PATH, "utf8"));
    const result = validateOneAccountSyncApproval(event, {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    });
    console.log("GROWTH_ONE_SYNC_APPROVED=" + result.sha);
  } catch {
    console.error("GROWTH_ONE_SYNC_AUTH=BLOCKED");
    process.exitCode = 1;
  }
}
