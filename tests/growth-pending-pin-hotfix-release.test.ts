import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const file = path.join(process.cwd(),
  "workers/coordinate-growth-twelve-timer-pending-pin-hotfix-release.sh");
const source = readFileSync(file, "utf8");

describe("2026-11-14 exact-SHA queued approved Pin production release", () => {
  it("has valid Bash syntax and is bound to the exact currently deployed SHA", () => {
    expect(() => execFileSync("bash", ["-n", file])).not.toThrow();
    expect(source).toContain("5ddbfc5f44814b80c34fcf048b59dcf1105e840e");
    expect(source).toContain('"$MIGRATIONS" == 36');
    expect(source).toContain("0:0:700");
    expect(source).toContain("/etc/saytwist-growth-20261114-pending-pin-release-state");
    expect(source).toContain("GROWTH_TWELVE_RELEASE_APPROVAL");
    expect(source).toContain("2026-11-14 17:30:00 UTC");
  });

  it("allows only the exact two untampered approved and future legacy-host Pins", () => {
    expect(source).toContain("WITH active AS (");
    expect(source).toContain('(SELECT count(*) FROM active)=2');
    expect(source).toContain('(SELECT count(*) FROM safe_pins)=2');
    expect(source).toContain('(SELECT count(DISTINCT "runAfter") FROM safe_pins)=2');
    expect(source).toContain("2026-11-14 18:00:00+00");
    expect(source).toContain("2026-11-14 23:00:00+00");
    expect(source).toContain("translator.whattypeof.com/%");
    expect(source).toContain('"attemptCount"=0');
    expect(source).toContain("pin_attempts=0");
    expect(source).toContain("provider_pin_id IS NULL");
    expect(source).toContain("pin_last_attempt IS NULL");
    expect(source).toContain("reconcile_job_id IS NULL");
    expect(source).toContain("approval_status='APPROVED'");
    expect(source).toContain("publication_status='SCHEDULED'");
    expect(source).toContain("candidate_status='READY'");
    expect(source).toContain("approval_candidate=pin_candidate");
    expect(source).toContain("approval_account=pin_account");
    expect(source).toContain("approval_board=pin_board");
    expect(source).toContain("approval_time=publication_time");
    expect(source).toContain('"runAfter"=publication_time');
    expect(source).toContain('"runAfter" > now() + interval \'30 minutes\'');
    expect(source).toContain("2026-11-06 20:53:59+00");
    expect(source).toContain("CLAIMED");
    expect(source).toContain("FAILED_RETRYABLE");
    expect(source).toContain("queue_fingerprint");
    expect(source).toContain('"snapshotChecksum"');
  });

  it("does not weaken independent watchdog, private reports or provider approval pins", () => {
    for (const name of [
      "lease-watchdog", "daily-observe", "autonomous-cycle",
      "approved-publisher", "daily-fresh", "private-report",
      "autonomous-content", "daily-account-analytics",
      "auto-translator-publish", "viral-discovery", "viral-source",
      "pin-maintenance",
    ]) expect(source).toContain(name);
    for (const token of [
      "SAYTWIST_PRIVATE_DAILY_REPORT",
      "SAYTWIST_VIRAL_DISCOVERY",
      "SAYTWIST_VIRAL_SOURCE",
      "SAYTWIST_PIN_MAINTENANCE",
      '"workerActivationExpiresAt" IS NULL',
      "systemctl daemon-reload",
      "check_units",
      "check_timers",
      "systemctl disable --now $TIMERS",
      "systemctl enable --now $TIMERS",
      'GROWTH_QUEUED_PIN_RELEASE_RESTORE=PASSED',
    ]) expect(source).toContain(token);
    expect(source).not.toContain("UPDATE \"GrowthPinPublication\"");
    expect(source).not.toContain("UPDATE \"GrowthJob\"");
    expect(source).not.toContain("prisma migrate deploy");
    expect(source).not.toContain("pm2 start");
  });
});
