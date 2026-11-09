import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runbook = readFileSync("scripts/growth-viral-clone-rehearsal.cjs", "utf8");
const workflow = readFileSync(".github/workflows/growth-viral-clone-stage.yml", "utf8");

describe("Protected viral production-clone qualification", () => {
  it("checks executable syntax and pins exactly the existing release and fresh clone", () => {
    execFileSync("node", ["--check", "scripts/growth-viral-clone-rehearsal.cjs"]);
    expect(runbook).toContain("saytwist_growth_viral_rehearsal_20261109");
    expect(runbook).toContain("a73ed6a4d4a5d3244fe5735bd7f027aa8a6d81ff");
    expect(runbook).toContain("names.length === 35");
    expect(runbook).toContain("prod.length === 33 && clone.length === 33");
    expect(runbook).toContain("20261109180000_growth_viral_intelligence_foundation");
    expect(runbook).toContain("20261109190000_growth_viral_pin_approval");
    expect(runbook).toContain("os.userInfo().username === \"saytwist\"");
  });
  it("only sends Prisma migrations to the clone and verifies production did not change", () => {
    expect(runbook).toContain("cloneUrl.pathname = \"/\" + CLONE");
    expect(runbook).toContain("DATABASE_URL: cloneUrl.toString()");
    expect(runbook).toContain("same(history(url, PROD), prod)");
    expect(runbook).toContain("safeOff(url, PROD); noViralTables(url, PROD)");
    expect(runbook).toContain("VIRAL_CLONE_PRODUCTION_UNCHANGED=true");
    expect(runbook).toContain("VIRAL_CLONE_PROGRAM_PAUSED=true");
    expect(runbook).toContain("VIRAL_CLONE_TWO_MIGRATIONS_APPLIED=true");
    expect(runbook).not.toContain('cloneUrl.pathname = "/" + PROD');
    expect(runbook).not.toContain('"migrate", "reset"');
    expect(runbook).not.toContain("UPDATE \"GrowthSettings\"");
  });
  it("does not automatically dispatch, deploy, activate any timer or publish pins", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.actor == 'belhaouazakaria'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("inputs.release_sha == github.sha");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("scripts/growth-viral-clone-rehearsal.cjs");
    expect(workflow).toContain("test ! -e \"$DIR\"");
    expect(workflow).not.toContain("issue_comment:");
    expect(workflow).not.toContain("systemctl");
    expect(workflow).not.toContain("deploy-hostinger");
    expect(workflow).not.toContain("createPinterestPin");
  });
});
