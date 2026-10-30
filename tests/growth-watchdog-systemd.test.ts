import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireCjs = createRequire(import.meta.url);
const { validatedDatabaseUrl } = requireCjs("../workers/growth-lease-watchdog-launch.cjs") as {
  validatedDatabaseUrl: (source: unknown) => string;
};
const validUrl = "postgresql://saytwist:nonsecret-placeholder@127.0.0.1:5433/saytwist";

function pm2(url = validUrl) {
  return [{ name: "saytwist", pid: 123,
    pm2_env: {
      status: "online",
      pm_cwd: "/home/saytwist/htdocs/saytwist.com",
      pm_exec_path: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/npm",
      NODE_ENV: "production", PORT: "3001",
      DATABASE_URL: url,
    },
  }];
}

describe("independent growth lease watchdog launch", () => {
  it("reads only an exact trusted live PM2 process", () => {
    expect(validatedDatabaseUrl(JSON.stringify(pm2()))).toBe(validUrl);
    expect(() => validatedDatabaseUrl([])).toThrow();
    expect(() => validatedDatabaseUrl([...pm2(), ...pm2()])).toThrow();
    expect(() => validatedDatabaseUrl([{ ...pm2()[0], name: "other" }])).toThrow();
    expect(() => validatedDatabaseUrl([{ ...pm2()[0], pm2_env: {
      ...pm2()[0].pm2_env, status: "stopped",
    } }])).toThrow();
  });

  it("rejects connections outside the exact production loopback database", () => {
    for (const candidate of [
      "postgresql://saytwist:pw@localhost:5433/saytwist",
      "postgresql://saytwist:pw@127.0.0.1:5432/saytwist",
      "postgresql://saytwist:pw@127.0.0.1:5433/clone",
      "postgresql://saytwist:pw@127.0.0.1:5433/saytwist?host=external",
      "postgresql://saytwist:pw@192.168.1.2:5433/saytwist",
      "mysql://saytwist:pw@127.0.0.1:5433/saytwist",
    ]) {
      expect(() => validatedDatabaseUrl(pm2(candidate)), candidate).toThrow();
    }
  });

  it("ships a reviewed root-authorized system timer with no embedded credential", () => {
    const installer = readFileSync("workers/install-growth-lease-watchdog-systemd.sh", "utf8");
    const launcher = readFileSync("workers/growth-lease-watchdog-launch.cjs", "utf8");
    execFileSync("bash", ["-n", "workers/install-growth-lease-watchdog-systemd.sh"]);
    execFileSync("node", ["--check", "workers/growth-lease-watchdog-launch.cjs"]);
    expect(installer).toContain('[[ "$(id -un)" == "root" ]]');
    expect(installer).toContain("HOSTINGER_WATCHDOG_INSTALL_APPROVAL");
    expect(installer).toContain("OnCalendar=*-*-* *:*:00");
    expect(installer).toContain("Persistent=true");
    expect(installer).toContain("User=saytwist");
    expect(installer).toContain("GROWTH_LEASE_CLEANUP_ENABLED=true");
    expect(installer).not.toContain("DATABASE_URL=");
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA");
    expect(launcher).toContain("node_modules/tsx/dist/cli.mjs");
    expect(launcher).not.toContain("console.error(error)");
    expect(launcher).not.toContain("execSync(");
  });
});
