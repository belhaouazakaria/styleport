import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_CADENCE_POLICY,
  dailyCadencePolicySchema } from "@/lib/growth/portfolio/daily-cadence";

const migration = readFileSync(
  "prisma/migrations/20261105150000_growth_daily_cadence_controls/migration.sql",
  "utf8",
);
const route = readFileSync(
  "app/api/admin/growth/cadence/route.ts", "utf8",
);
const service = readFileSync(
  "lib/growth/portfolio/cadence-settings.ts", "utf8",
);
const page = readFileSync(
  "app/(admin)/admin/growth/cadence/page.tsx", "utf8",
);

describe("Phase14K cadence preference storage boundaries", () => {
  it("defaults to one-to-ten agent-selected planning targets without enabling jobs", () => {
    expect(dailyCadencePolicySchema.parse(DEFAULT_DAILY_CADENCE_POLICY))
      .toEqual({
        pinCreatives: { mode: "AUTO", minimum: 1, maximum: 10, fixed: null },
        translatorCreates: { mode: "AUTO", minimum: 1, maximum: 10, fixed: null },
      });
    expect(service).not.toContain("workerActivationExpiresAt:");
    expect(service).not.toContain("GROWTH_WORKER_RUN_ENABLED");
  });

  it("requires admin, same-origin and exact JSON validation on updates", () => {
    expect(route).toContain("adminRouteGuard()");
    expect(route).toContain("isSameOriginMutation(request)");
    expect(route).toContain("dailyCadencePolicySchema.safeParse(body)");
    expect(route).toContain("getSessionOrNull()");
    expect(route).toContain("planningOnly: true, publishingEnabled: false");
    expect(page).toContain("requireAdminRoute()");
  });

  it("keeps database enums and fixed-value safeguards fail-closed", () => {
    expect(migration).toContain('CREATE TABLE "GrowthDailyCadencePreference"');
    for (const prefix of ["pin", "translator"]) {
      expect(migration).toContain(
        `"${prefix}Mode" IN ('AUTO','FIXED','PAUSED')`,
      );
      expect(migration).toContain(
        `"${prefix}Minimum" BETWEEN 1 AND 10`,
      );
      expect(migration).toContain(
        `"${prefix}Maximum" BETWEEN 1 AND 10`,
      );
      expect(migration).toContain(
        `"${prefix}Mode" = 'FIXED' AND "${prefix}Fixed" IS NOT NULL`,
      );
      expect(migration).toContain(
        `"${prefix}Mode" <> 'FIXED' AND "${prefix}Fixed" IS NULL`,
      );
    }
    expect(migration).not.toContain('"enabled"');
    expect(migration).not.toContain('"GrowthJob"');
  });

  it("persists audit and prevents ordinary preference edits from enabling Growth", () => {
    expect(service).toContain("recordGrowthActivity(");
    expect(service).toContain("CADENCE_POLICY_UPDATED");
    expect(service).toContain("configVersion: { increment: 1 }");
    expect(service).not.toContain("enabled: true");
    expect(service).not.toContain("runGrowthWorker");
    expect(service).not.toContain("CREATE_PIN");
  });
});
