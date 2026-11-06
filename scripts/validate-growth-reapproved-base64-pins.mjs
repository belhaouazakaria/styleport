import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = "belhaouazakaria/styleport";
const OWNER = "belhaouazakaria";
const DEPLOYED = "1f7f0560661a86947c3ce7c49c7a4669d41736f2";
const CANDIDATES = "cmw5gcss30009a5ajv9pzwebg,cmw5gct1u0015a5ajt0gg6gza";

export function verifyReapprovedBase64OwnerGate(event, context) {
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
      event.issue.title !== "SayTwist reapproved direct PNG Pins " + sha ||
      event.issue.body !== "PIN_BASE64_SOURCE_SHA=" + sha +
        "\nPIN_BASE64_DEPLOYED_SHA=" + DEPLOYED +
        "\nPIN_BASE64_REAPPROVED_CANDIDATES=" + CANDIDATES +
        "\nPIN_BASE64_MAX_WRITES=2" ||
      event.comment.body !== "RUN SAYTWIST REAPPROVED BASE64 PINS " + sha + ":" + DEPLOYED) {
    throw Error("REAPPROVED_BASE64_OWNER_GATE_REJECTED");
  }
  return { sourceSha: sha };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.PIN_BASE64_EVENT_PATH, "utf8"));
    const result = verifyReapprovedBase64OwnerGate(event, {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    });
    console.log("PIN_BASE64_OWNER_GATE=PASSED");
    console.log("PIN_BASE64_SOURCE_SHA=" + result.sourceSha);
  } catch {
    console.error("PIN_BASE64_OWNER_GATE=BLOCKED");
    process.exitCode = 1;
  }
}
