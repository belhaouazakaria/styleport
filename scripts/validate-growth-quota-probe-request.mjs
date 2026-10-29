import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateQuotaProbeRequest(event, context) {
  const sha = context.sha;
  const repository = "belhaouazakaria/styleport";
  const owner = "belhaouazakaria";
  if (context.repository !== repository || context.ref !== "refs/heads/main" ||
      !/^[a-f0-9]{40}$/.test(sha || "") ||
      event?.action !== "created" ||
      event?.repository?.full_name !== repository ||
      event?.repository?.default_branch !== "main" ||
      event?.issue?.pull_request || event?.issue?.state !== "open" ||
      !Number.isSafeInteger(event?.issue?.number) ||
      event?.sender?.login !== owner || event?.comment?.user?.login !== owner ||
      event?.issue?.user?.login !== owner ||
      event.issue.title !== "SayTwist Growth quota probe " + sha ||
      event.issue.body !== "QUOTA_PROBE_SHA=" + sha + "\nQUOTA_PROBE_TARGET=saytwist.com" ||
      event.comment.body !== "RUN SAYTWIST GROWTH ONE GET QUOTA PROBE " + sha) {
    throw new Error("Exact-SHA owner-only quota probe authorization rejected");
  }
  return sha;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const event = JSON.parse(readFileSync(process.env.GROWTH_QUOTA_PROBE_EVENT_PATH, "utf8"));
    const sha = validateQuotaProbeRequest(event, {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
    });
    console.log("OWNER_APPROVED_QUOTA_PROBE=" + sha);
  } catch {
    console.error("OWNER_QUOTA_PROBE_AUTHORIZATION_FAILED");
    process.exitCode = 1;
  }
}
