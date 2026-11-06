import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = "belhaouazakaria/styleport";
const OWNER = "belhaouazakaria";
const DEPLOYED = "1f7f0560661a86947c3ce7c49c7a4669d41736f2";
const CANDIDATES = "cmw5gcsxc000pa5aju6j8g8uv,cmw5gcss30009a5ajv9pzwebg";

export function validatePin400DiagnosticIssue(event, context) {
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
      event.issue.title !== "SayTwist Pinterest 400 exact approved diagnostic " + sha ||
      event.issue.body !==
        "PIN_400_SOURCE_SHA=" + sha +
        "\nPIN_400_DEPLOYED_SHA=" + DEPLOYED +
        "\nPIN_400_ELIGIBLE_CANDIDATES=" + CANDIDATES +
        "\nPIN_400_REPAIR_CANDIDATE=cmw5gct1u0015a5ajt0gg6gza" ||
      event.comment.body !== "RUN SAYTWIST PIN 400 DIAGNOSTIC " + sha + ":" + DEPLOYED) {
    throw Error("PIN_400_OWNER_APPROVAL_REJECTED");
  }
  return { sourceSha: sha };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.PIN_400_EVENT_PATH, "utf8"));
    const result = validatePin400DiagnosticIssue(event, {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    });
    console.log("PIN_400_OWNER_GATE=PASSED");
    console.log("PIN_400_SOURCE_SHA=" + result.sourceSha);
  } catch {
    console.error("PIN_400_OWNER_GATE=BLOCKED");
    process.exitCode = 1;
  }
}
