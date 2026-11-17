import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const coordinator = readFileSync(
  "workers/coordinate-growth-genz-source-release.py",
  "utf8",
);

it("pins the 14-timer code-only release to the operator-confirmed production baseline", () => {
  expect(coordinator).toContain(
    'OLD = "145215b742916b81ff1b1fc86bd3882fb516385a"',
  );
  const names = coordinator.match(/NAMES = "([^"]+)"\.split\(\)/)?.[1].split(" ") ?? [];
  expect(names).toHaveLength(14);
  expect(coordinator).toContain("assert len(history) == 41");
  expect(coordinator).toContain('q["cloneMigrations"] == 41');
  expect(coordinator).toContain("GROWTH_GENZ_SOURCE_RELEASE_APPROVAL");
  expect(coordinator).toContain("configs(OLD, True)");
  expect(coordinator).toContain("configs(OLD, False)");
});

it("does not change timer cadence, AI budget, or database state during SHA rotation", () => {
  expect(coordinator).not.toContain("OnBootSec=");
  expect(coordinator).not.toContain("TimeoutStartSec=");
  expect(coordinator).not.toContain("prisma migrate");
  expect(coordinator).not.toContain("GrowthSettings");
  expect(coordinator).toContain('subprocess.run(["systemctl", "disable", "--now"] + TIMERS');
  expect(coordinator).toContain('subprocess.run(["systemctl", "enable", "--now"] + TIMERS');
});
