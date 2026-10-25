import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runner = resolve(process.cwd(), "scripts/growth-phase13-clone-rehearsal.cjs");

describe("Phase 13 populated production-clone rehearsal safeguards", () => {
  it("parses with Node before anyone can transfer the reviewed bundle", () => {
    const check = spawnSync(process.execPath, ["--check", runner], {
      encoding: "utf8",
      timeout: 10000,
    });
    expect(check.error).toBeUndefined();
    expect(check.status).toBe(0);
  });

  it("fails closed in a normal checkout before reading PM2 or contacting a database", () => {
    const run = spawnSync(process.execPath, [runner], {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, DATABASE_URL: "postgresql://nope:fake@127.0.0.1:5433/saytwist" },
    });
    expect(run.error).toBeUndefined();
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/SOURCE_BUNDLE_OUTSIDE_PRIVATE_DIRECTORY|UNSAFE_EXECUTION_USER/);
    expect(run.stdout).not.toContain("postgresql://");
    expect(run.stderr).not.toContain("postgresql://");
  });
});
