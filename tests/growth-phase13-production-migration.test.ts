import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/growth-phase13-production-migration.cjs");

describe("Phase 13 production migration release gates", () => {
  it("parses in Node before transfer to a restricted source-only bundle", () => {
    const r = spawnSync(process.execPath, ["--check", script], {
      encoding: "utf8", timeout: 10000,
    });
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
  });

  it("fails closed in a regular checkout before PM2 or database access", () => {
    for (const operation of ["preflight", "apply"]) {
      const r = spawnSync(process.execPath, [script, operation], {
        encoding: "utf8", timeout: 10000,
        env: {
          ...process.env,
          GROWTH_PHASE13_RELEASE_SHA: "a".repeat(40),
          GROWTH_PHASE13_PRODUCTION_APPROVAL:
            "APPLY FOUR PHASE13 MIGRATIONS " + "a".repeat(40),
          DATABASE_URL: "postgresql://private:secret@127.0.0.1:5433/saytwist",
        },
      });
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("RELEASE_SHA_NOT_VERIFIED");
      expect(r.stdout + r.stderr).not.toContain("secret");
      expect(r.stdout + r.stderr).not.toContain("postgresql://");
    }
  });

  it("rejects unknown operations without creating backups or running migrations", () => {
    const r = spawnSync(process.execPath, [script, "run-everything"], {
      encoding: "utf8", timeout: 10000,
    });
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("INVALID_ARGUMENTS");
  });
});
