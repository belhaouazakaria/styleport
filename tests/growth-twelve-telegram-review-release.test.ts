import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const file = path.join(process.cwd(), "workers/coordinate-growth-twelve-timer-telegram-review-release.sh");
const source = readFileSync(file, "utf8");

describe("migration-aware 12-timer Telegram review release", () => {
  it("parses under bash and is an exact old release gate", () => {
    expect(() => execFileSync("bash", ["-n", file])).not.toThrow();
    expect(source).toContain("3122aaf16c8b862f3860c586489f1843533369f1");
    expect(source).toContain("0:0:700");
  });
  it("holds all twelve scheduled services without running generic workers", () => {
    for (const n of [
      "lease-watchdog", "daily-observe", "autonomous-cycle",
      "approved-publisher", "daily-fresh", "private-report",
      "autonomous-content", "daily-account-analytics",
      "auto-translator-publish", "viral-discovery", "viral-source",
      "pin-maintenance",
    ]) expect(source).toContain(n);
    expect(source).toContain("systemctl disable --now $TIMERS");
    expect(source).toContain("systemctl enable --now $TIMERS");
    expect(source).toContain("check_timers disabled");
    expect(source).not.toContain("pm2 start");
  });
  it("fails closed on nonexact database migration state and requires operator approval", () => {
    expect(source).toContain('audit|hold) [[ "$MIGRATIONS" == 31 ]]');
    expect(source).toContain('restore) [[ "$MIGRATIONS" == 32 ]]');
    expect(source).toContain("20261113100000_growth_telegram_pin_review");
    expect(source).toContain('migrations=%s');
    expect(source).toContain('HOLD:$OLD:$NEW');
    expect(source).toContain('RESTORE:%s:%s');
    expect(source).toContain("GROWTH_TWELVE_RESTORE=PASSED");
    expect(source).toContain("GROWTH_TWELVE_RELEASE_APPROVAL");
  });
  it("preserves safe-off / empty Growth queue and all release-specific approvals", () => {
    expect(source).toContain('"workerActivationExpiresAt" IS NULL');
    expect(source).toContain('NOT EXISTS(SELECT 1 FROM "GrowthJob"');
    expect(source).toContain("SAYTWIST_PRIVATE_DAILY_REPORT");
    expect(source).toContain("SAYTWIST_VIRAL_DISCOVERY");
    expect(source).toContain("SAYTWIST_VIRAL_SOURCE");
    expect(source).toContain("SAYTWIST_PIN_MAINTENANCE");
  });
});
