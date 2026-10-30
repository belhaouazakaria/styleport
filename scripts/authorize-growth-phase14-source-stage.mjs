import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPOSITORY = "belhaouazakaria/styleport";
const OWNER = "belhaouazakaria";

export function authorizePhase14SourceStaging(event, context) {
  const sha = context.sha;
  if (context.repository !== REPOSITORY ||
      context.ref !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(sha || "") ||
      event?.action !== "created" ||
      event?.repository?.full_name !== REPOSITORY ||
      event?.repository?.default_branch !== "main" ||
      event?.issue?.pull_request ||
      event?.issue?.state !== "open" ||
      !Number.isSafeInteger(event?.issue?.number) ||
      event?.sender?.login !== OWNER ||
      event?.issue?.user?.login !== OWNER ||
      event?.comment?.user?.login !== OWNER ||
      event.issue.title !== "SayTwist Growth Phase14 clone staging " + sha ||
      event.issue.body !== "PHASE14_SOURCE_SHA=" + sha +
        "\nPHASE14_SOURCE_TARGET=saytwist-phase14-clone" ||
      event.comment.body !== "STAGE SAYTWIST PHASE14 CLONE SOURCE " + sha) {
    throw new Error("PHASE14_SOURCE_STAGE_NOT_AUTHORIZED");
  }
  return sha;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.PHASE14_STAGE_EVENT_PATH, "utf8"));
    console.log("PHASE14_SOURCE_STAGE_AUTHORIZED=" +
      authorizePhase14SourceStaging(event, {
        repository: process.env.GITHUB_REPOSITORY,
        ref: process.env.GITHUB_REF,
        sha: process.env.GITHUB_SHA,
      }));
  } catch {
    console.error("PHASE14_SOURCE_STAGE_NOT_AUTHORIZED");
    process.exitCode = 1;
  }
}
