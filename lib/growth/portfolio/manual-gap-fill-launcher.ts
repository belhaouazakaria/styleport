import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HELPER = "/usr/local/sbin/saytwist-growth-gap-fill";

export async function isManualGapFillWorkerAvailable() {
  try {
    await execFileAsync("/usr/bin/sudo", ["-n", HELPER, "--check"], {
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function triggerManualGapFillWorker(requestId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    throw new Error("Invalid manual Gap Fill request ID.");
  }
  await execFileAsync("/usr/bin/sudo", ["-n", HELPER, requestId], {
    timeout: 15_000,
  });
}
