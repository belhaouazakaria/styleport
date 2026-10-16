import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validatePm2CliPath, validatePm2ProcessList } from "../scripts/pm2-process-contract.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const deployScript = path.join(repositoryRoot, "scripts/hostinger-deploy.sh");
const migrationScript = path.join(repositoryRoot, "scripts/hostinger-prepare-migration.sh");
const npmPath = "/home/saytwist/.nvm/versions/node/v24.20.0/bin/npm";
const appPath = "/home/saytwist/htdocs/saytwist.com";
const pm2Home = "/home/saytwist/.pm2";
const temporaryDirectories = [];

function processList(overrides = {}) {
  const envOverrides = overrides.pm2_env || {};
  return [
    {
      name: "saytwist",
      pid: 271001,
      ...overrides,
      pm2_env: {
        status: "online",
        pm_exec_path: npmPath,
        pm_cwd: appPath,
        restart_time: 9,
        PM2_HOME: pm2Home,
        PORT: "3001",
        NODE_ENV: "production",
        args: ["start"],
        ...envOverrides,
      },
    },
  ];
}

function expectedContract() {
  return { processName: "saytwist", npmPath, cwd: appPath, pm2Home, port: "3001" };
}

function runSourcedBash(body, env = {}) {
  return spawnSync(
    "bash",
    ["-c", `set -Eeuo pipefail\nexport HOSTINGER_DEPLOY_SOURCE_ONLY=1\nsource "$DEPLOY_SCRIPT"\n${body}`],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, DEPLOY_SCRIPT: deployScript, ...env },
    },
  );
}

function runSourcedMigrationBash(body, env = {}) {
  return spawnSync(
    "bash",
    ["-c", `set -Eeuo pipefail\nexport HOSTINGER_MIGRATION_SOURCE_ONLY=1\nsource "$MIGRATION_SCRIPT"\n${body}`],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, MIGRATION_SCRIPT: migrationScript, ...env },
    },
  );
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("Hostinger PM2 process contract", () => {
  it("accepts the existing npm start process on production port 3001", () => {
    expect(validatePm2ProcessList(processList(), expectedContract())).toMatchObject({
      pid: 271001,
      execPath: npmPath,
      cwd: appPath,
      port: "3001",
      pm2Home,
      args: ["start"],
    });
  });

  it("rejects an incorrect PM2_HOME", () => {
    expect(() =>
      validatePm2ProcessList(processList({ pm2_env: { PM2_HOME: "/tmp/other-pm2" } }), expectedContract()),
    ).toThrow("unexpected PM2_HOME");
  });

  it("rejects an incorrect application working directory", () => {
    expect(() =>
      validatePm2ProcessList(processList({ pm2_env: { pm_cwd: "/tmp/wrong-app" } }), expectedContract()),
    ).toThrow("unexpected working directory");
  });

  it("rejects a process not registered as npm start", () => {
    expect(() =>
      validatePm2ProcessList(
        processList({ pm2_env: { pm_exec_path: `${appPath}/server.js`, args: [] } }),
        expectedContract(),
      ),
    ).toThrow("approved npm binary");
  });

  it("fails safely when the operator-supplied PM2 CLI is missing", async () => {
    await expect(validatePm2CliPath("/definitely/missing/pm2")).rejects.toThrow("missing or not executable");
    const result = runSourcedBash('PM2_CLI=""\nvalidate_pm2_cli');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("HOSTINGER_PM2_CLI must provide");
  });

  it("rejects a PM2 home other than the verified production daemon home", () => {
    const result = runSourcedBash(
      'PM2_CLI="$EXECUTABLE"\nPM2_HOME_DIR="/tmp/wrong-pm2"\nvalidate_pm2_cli',
      { EXECUTABLE: process.execPath },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not match the verified production daemon home");
  });

  it("accepts an executable absolute PM2 CLI path", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "saytwist-pm2-cli-"));
    temporaryDirectories.push(directory);
    const cli = path.join(directory, "pm2");
    writeFileSync(cli, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(cli, 0o700);
    await expect(validatePm2CliPath(cli)).resolves.toBe(cli);
  });
});

describe("Hostinger PostgreSQL backup-tool contract", () => {
  function createVersionExecutable(directory, name, major) {
    const executable = path.join(directory, name);
    writeFileSync(executable, `#!/usr/bin/env bash\nprintf '%s\\n' '${name} (PostgreSQL) ${major}.0'\n`);
    chmodSync(executable, 0o700);
    return executable;
  }

  function createBackupToolFixtures(dumpMajor = 18, restoreMajor = 18) {
    const directory = mkdtempSync(path.join(tmpdir(), "saytwist-postgresql-tools-"));
    temporaryDirectories.push(directory);
    return {
      dump: createVersionExecutable(directory, "pg_dump", dumpMajor),
      restore: createVersionExecutable(directory, "pg_restore", restoreMajor),
    };
  }

  function validateBackupTools(dump, restore) {
    return runSourcedBash(
      'PG_DUMP_BIN="$TEST_PG_DUMP"\nPG_RESTORE_BIN="$TEST_PG_RESTORE"\nvalidate_postgresql_backup_tools',
      { TEST_PG_DUMP: dump, TEST_PG_RESTORE: restore },
    );
  }

  it("accepts PostgreSQL 18 pg_dump and pg_restore executables", () => {
    const tools = createBackupToolFixtures();
    const result = validateBackupTools(tools.dump, tools.restore);
    expect(result.status, result.stderr).toBe(0);
  });

  it.each(["pg_dump", "pg_restore"])("rejects a missing %s executable", (missingTool) => {
    const tools = createBackupToolFixtures();
    tools[missingTool === "pg_dump" ? "dump" : "restore"] = "/definitely/missing/postgresql-tool";
    const result = validateBackupTools(tools.dump, tools.restore);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing or not executable");
  });

  it.each([
    ["pg_dump", 16, 18],
    ["pg_restore", 18, 17],
  ])("rejects an incompatible %s major version", (_tool, dumpMajor, restoreMajor) => {
    const tools = createBackupToolFixtures(dumpMajor, restoreMajor);
    const result = validateBackupTools(tools.dump, tools.restore);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must be PostgreSQL major 18");
  });
});

describe("Hostinger production migration contract", () => {
  it("keeps deployment read-only with respect to migrations and rejects pending state", () => {
    const script = readFileSync(deployScript, "utf8");
    expect(script).not.toMatch(/run_prisma\s+migrate\s+deploy/);
    expect(script).toContain("validate_no_pending_migrations");
    const result = runSourcedBash(
      "run_prisma() { return 1; }\nvalidate_no_pending_migrations",
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("separate operator-approved backup");
  });

  it("requires the exact reviewed migration, release SHA, approval, and verified backup", () => {
    const script = readFileSync(migrationScript, "utf8");
    expect(script).toContain("20261016120000_growth_analytics_gap_recovery");
    expect(script).toContain('APPLY $APPROVED_MIGRATION');
    expect(script).toContain("validate_exact_pending_migration");
    expect(script).toContain("create_verified_backup");
    expect(script).toContain('"$PG_RESTORE_BIN" --list');
    expect(script).toContain("check_runtime");
    expect(script).toContain("migrate deploy --schema prisma/schema.prisma");
    expect(script.match(/check_runtime/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps migration preparation out of the automatic deployment script", () => {
    const deploy = readFileSync(deployScript, "utf8");
    expect(deploy).not.toContain("hostinger-prepare-migration.sh");
    expect(deploy).not.toContain("HOSTINGER_MIGRATION_APPROVAL");
  });

  it("refuses to use the live application directory as migration staging", () => {
    const result = runSourcedMigrationBash(
      'APP_PATH="/home/saytwist/htdocs/saytwist.com"\nMIGRATION_ROOT="$APP_PATH"\nvalidate_inputs',
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("outside the live application directory");
  });

  it("validates both deployment scripts as Bash", () => {
    expect(() => execFileSync("bash", ["-n", deployScript])).not.toThrow();
    expect(() => execFileSync("bash", ["-n", migrationScript])).not.toThrow();
  });
});

describe("Hostinger restart and rollback safeguards", () => {
  it("rolls back when restarting the existing process fails", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "saytwist-restart-failure-"));
    temporaryDirectories.push(directory);
    const marker = path.join(directory, "rollback");
    const result = runSourcedBash(
      `PUBLISH_STARTED=1
rollback_application() { printf rollback > "$MARKER"; }
run_pm2() { return 1; }
restart_web_process`,
      { MARKER: marker },
    );
    expect(result.status).not.toBe(0);
    expect(readFileSync(marker, "utf8")).toBe("rollback");
  });

  it("rolls back when the restarted application fails readiness", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "saytwist-readiness-failure-"));
    temporaryDirectories.push(directory);
    const marker = path.join(directory, "rollback");
    const result = runSourcedBash(
      `PUBLISH_STARTED=1
OLD_WEB_PID=100
OLD_RESTART_COUNT=4
PM2_DAEMON_PID=200
rollback_application() { printf rollback > "$MARKER"; }
run_pm2() { return 0; }
get_pm2_process_info() { printf '101\\tonline\\t%s\\t%s\\t5\\t3001' "$NODE_BIN_DIR/npm" "$APP_PATH"; }
read_pm2_daemon_pid() { printf 200; }
wait_for_health() { return 1; }
restart_web_process`,
      { MARKER: marker },
    );
    expect(result.status).not.toBe(0);
    expect(readFileSync(marker, "utf8")).toBe("rollback");
  });

  it("restores the previous files and preserves the existing PM2 registration", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "saytwist-rollback-"));
    temporaryDirectories.push(directory);
    const currentApp = path.join(directory, "app");
    const rollback = path.join(directory, "rollback");
    mkdirSync(currentApp, { recursive: true });
    mkdirSync(rollback, { recursive: true });
    writeFileSync(path.join(currentApp, "server.js"), "failed release");
    writeFileSync(path.join(rollback, "server.js"), "previous release");

    const result = runSourcedBash(
      `APP_PATH="$APP_DIR"
ROLLBACK_DIR="$ROLLBACK_DIR_OVERRIDE"
STAGING_DIR="$APP_DIR/staging"
RELEASE_PATHS=("server.js")
BACKED_UP_PATHS=("server.js")
PUBLISHED_PATHS=("server.js")
PUBLISH_STARTED=1
run_pm2() { [[ "$1" == restart && "$2" == saytwist ]]; }
wait_for_health() { return 0; }
rollback_application`,
      { APP_DIR: currentApp, ROLLBACK_DIR_OVERRIDE: rollback },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(currentApp, "server.js"), "utf8")).toBe("previous release");
  });

  it("never starts or registers a persistent Growth worker", () => {
    const script = readFileSync(deployScript, "utf8");
    expect(script).not.toMatch(/run_pm2\s+(?:start|reload).*growth/i);
    expect(script).not.toMatch(/pm2\s+(?:start|reload).*growth/i);
    expect(script).not.toContain("growth:worker");
  });

  it("is valid Bash syntax", () => {
    expect(() => execFileSync("bash", ["-n", deployScript])).not.toThrow();
  });
});
