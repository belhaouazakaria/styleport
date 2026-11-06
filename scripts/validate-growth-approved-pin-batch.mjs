import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = "belhaouazakaria/styleport";
const OWNER = "belhaouazakaria";
const DEPLOYED = "1f7f0560661a86947c3ce7c49c7a4669d41736f2";

export function verifyApprovedPinBatch(event, context) {
  const sha = context.sha;
  if (context.repository !== REPO || context.ref !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(sha || "") ||
      event?.action !== "created" ||
      event?.repository?.full_name !== REPO ||
      event?.repository?.default_branch !== "main" ||
      event?.issue?.pull_request || event?.issue?.state !== "open" ||
      !Number.isSafeInteger(event?.issue?.number) ||
      event?.sender?.login !== OWNER ||
      event?.issue?.user?.login !== OWNER ||
      event?.comment?.user?.login !== OWNER ||
      event.issue.title !== "SayTwist approved Pins exact batch " + sha ||
      event.issue.body !== "APPROVED_PIN_SOURCE_SHA=" + sha +
        "\nAPPROVED_PIN_DEPLOYED_SHA=" + DEPLOYED +
        "\nAPPROVED_PIN_CANDIDATES=cmw5gct1u0015a5ajt0gg6gza,cmw5gcsxc000pa5aju6j8g8uv,cmw5gcss30009a5ajv9pzwebg" ||
      event.comment.body !== "RUN SAYTWIST APPROVED PIN BATCH " + sha + ":" + DEPLOYED) {
    throw Error("APPROVED_PIN_AUTH_REJECTED");
  }
  return { sourceSha: sha };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.APPROVED_PIN_EVENT_PATH, "utf8"));
    const result = verifyApprovedPinBatch(event, {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    });
    console.log("APPROVED_PIN_OWNER_AUTH=PASSED");
    console.log("APPROVED_PIN_SOURCE_SHA=" + result.sourceSha);
  } catch {
    console.error("APPROVED_PIN_OWNER_AUTH=BLOCKED");
    process.exitCode = 1;
  }
}
