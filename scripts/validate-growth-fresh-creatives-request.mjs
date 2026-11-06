import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = "belhaouazakaria/styleport";
const OWNER = "belhaouazakaria";
const DEPLOYED = "1f7f0560661a86947c3ce7c49c7a4669d41736f2";

export function validateFreshCreativeIssue(event, context) {
  const sha = context.sha;
  if (context.repository !== REPO ||
      context.ref !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(sha || "") ||
      event?.action !== "created" ||
      event?.repository?.full_name !== REPO ||
      event?.repository?.default_branch !== "main" ||
      event?.issue?.pull_request ||
      event?.issue?.state !== "open" ||
      !Number.isSafeInteger(event?.issue?.number) ||
      event?.sender?.login !== OWNER ||
      event?.issue?.user?.login !== OWNER ||
      event?.comment?.user?.login !== OWNER ||
      event.issue.title !== "SayTwist fresh creatives one-shot " + sha ||
      event.issue.body !== "FRESH_CREATIVE_SOURCE_SHA=" + sha +
        "\nFRESH_CREATIVE_DEPLOYED_SHA=" + DEPLOYED +
        "\nFRESH_CREATIVE_MAX_NEW=3" ||
      event.comment.body !==
        "RUN SAYTWIST FRESH CREATIVES " + sha + ":" + DEPLOYED) {
    throw Error("FRESH_CREATIVE_OWNER_APPROVAL_REJECTED");
  }
  return { sourceSha: sha, deployedSha: DEPLOYED };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.FRESH_CREATIVE_EVENT_PATH, "utf8"));
    const result = validateFreshCreativeIssue(event, {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    });
    console.log("FRESH_CREATIVE_OWNER_APPROVED=" + result.sourceSha);
  } catch {
    console.error("FRESH_CREATIVE_AUTH=BLOCKED");
    process.exitCode = 1;
  }
}
