import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = "workers/coordinate-growth-nine-timer-review-hotfix.sh";
const text = readFileSync(shell, "utf8");
const source = readFileSync("lib/growth/viral/store.ts", "utf8");
const route = readFileSync("app/api/admin/growth/viral/route.ts", "utf8");

describe("Viral review-mode no-migration protected release", () => {
  it("executes, rather than queries, the PostgreSQL void advisory locks", () => {
    expect(source).toContain("await tx.$executeRaw(Prisma.sql");
    expect(source).toContain("growth-viral-catalog-v1");
    expect(source).toContain("growth-viral-settings-v1");
    expect(source).not.toContain("$queryRawUnsafe(");
  });

  it("only handles the known 35-migration production baseline", () => {
    execFileSync("bash", ["-n", shell]);
    expect(text).toContain("1e71d26de11b0529dfeee3862bb9da47c4fe7fdf");
    expect(text).toContain("STATE=/etc/saytwist-growth-nine-review-hotfix-state");
    expect(text).toContain('bool_and(mode=\'PAUSED\')');
    expect(text.match(/count_migrations saytwist\)" == 35/g)?.length).toBe(3);
    expect(text).toContain("GROWTH_NINE_RESTORE=PASSED");
    expect(text).toContain("GROWTH_NINE_AUDIT=PASSED");
    expect(text).toContain("GROWTH_NINE_RECOVER_OLD=PASSED");
    expect(text).toContain("PARTIAL_RESTORE_OPERATOR_REQUIRED");
    expect(text).toContain("PARTIAL_RECOVERY_OPERATOR_REQUIRED");
    expect(text).toContain("GROWTH_NINE_RELEASE_APPROVAL");
    expect(text).toContain("PINTEREST_ACCOUNT_SYNC");
    expect(text).toContain("PINTEREST_BOARD_SYNC");
    expect(text).toContain('AND "attemptCount"=0 AND "maxAttempts"=3');
    expect(text).toContain('"workerId" IS NULL');
    expect(text).toContain("count(*) <= 2");
    expect(text).toContain("2026-11-09 22:47:00");
    expect(text).not.toContain('UPDATE "GrowthJob"');
    expect(text).not.toContain("DELETE FROM");
    expect(text).toContain("OnCalendar=");
    expect(text).toContain("Persistent=$persist");
    expect(text).toContain("quiet_window");
    expect(text).toContain("systemctl start saytwist-growth-lease-watchdog.service");
    expect(text).not.toContain("install-growth-viral-source");
    expect(text).not.toContain("migrate deploy");
  });

  it("explains expected scan failures without triggering publishing", () => {
    expect(route).toContain("VIRAL_SOURCE_OWNER_PAUSED");
    expect(route).toContain("VIRAL_SOURCE_ALREADY_SCANNED_TODAY");
    expect(route).toContain("VIRAL_CATALOG_SOURCE_UNAVAILABLE");
    expect(route).toContain("No publishing or paid AI action was attempted");
  });
});
