import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts/hostinger-prepare-telegram-pin-review-migration.sh");
const source = readFileSync(script, "utf8");

describe("Telegram Pin review production migration runner", () => {
  it("parses under bash without executing operations", () => {
    expect(() => execFileSync("bash", ["-n", script])).not.toThrow();
  });
  it("applies only the approved additive migration after a verified backup", () => {
    expect(source).toContain("20261113100000_growth_telegram_pin_review");
    expect(source).toContain("validate_exact_pending_migration");
    expect(source).toContain("create_verified_backup");
    expect(source).toContain("migrate deploy");
    expect(source).toContain("PG_RESTORE_BIN");
  });
  it("requires exact release state and all 12 timers held", () => {
    expect(source).toContain("3122aaf16c8b862f3860c586489f1843533369f1");
    expect(source).toContain("new=$RELEASE_SHA");
    expect(source).toContain("status=HELD");
    expect(source).toContain("migrations=31");
    expect(source).toContain("0:0:700");
    for (const name of [
      "lease-watchdog","daily-observe","autonomous-cycle","approved-publisher",
      "daily-fresh","private-report","autonomous-content","daily-account-analytics",
      "auto-translator-publish","viral-discovery","viral-source","pin-maintenance",
    ]) expect(source).toContain(name);
  });
});
