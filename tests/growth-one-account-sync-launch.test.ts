import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const launcher = path.join(process.cwd(), "workers/growth-one-account-sync-launch.cjs");
const directories: string[] = [];
const validKey = Buffer.alloc(32, 9).toString("base64");
const redirect = "https://saytwist.com/api/admin/growth/pinterest/oauth/callback";

function fixture(productionLocal: string, local = "") {
  const directory = mkdtempSync(path.join(tmpdir(), "saytwist-one-sync-launch-"));
  directories.push(directory);
  writeFileSync(path.join(directory, ".env.production.local"), productionLocal);
  if (local) writeFileSync(path.join(directory, ".env.local"), local);
  const harness = path.join(directory, "check.cjs");
  // Deliberately report predicates only. No secrets or production environment values
  // are ever logged by this harness or the launcher.
  writeFileSync(harness, [
    `const { loadPinterestRuntimeEnv } = require(${JSON.stringify(launcher)});`,
    "try {",
    `  const env = loadPinterestRuntimeEnv(${JSON.stringify(directory)});`,
    "  console.log(JSON.stringify({",
    "    names: Object.keys(env).sort(),",
    "    explicitPrecedence: env.PINTEREST_APP_ID === 'explicit-process-app',",
    "    productionLocalPrecedence: env.PINTEREST_APP_SECRET === 'production-local-secret',",
    `    redirectValid: env.PINTEREST_REDIRECT_URI === ${JSON.stringify(redirect)},`,
    "    environmentValid: env.PINTEREST_API_ENVIRONMENT === 'production',",
    "    keyValid: Buffer.from(env.GROWTH_CREDENTIAL_ENCRYPTION_KEY, 'base64').length === 32,",
    "    noDatabase: !Object.hasOwn(env, 'DATABASE_URL'),",
    "  }));",
    "} catch { console.log('BLOCKED'); process.exitCode = 1; }",
  ].join("\n"));
  return harness;
}

function run(harness: string, explicitAppId?: string) {
  return spawnSync(process.execPath, [harness], {
    cwd: process.cwd(), encoding: "utf8",
    env: {
      NODE_ENV: "production", PATH: process.env.PATH || "",
      ...(explicitAppId ? { PINTEREST_APP_ID: explicitAppId } : {}),
    },
  });
}

afterEach(() => {
  for (const dir of directories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Phase14E account-sync launch environment isolation", () => {
  it("uses standard Next production env precedence and forwards only five whitelisted values", () => {
    const harness = fixture([
      "PINTEREST_APP_ID=production-local-app",
      "PINTEREST_APP_SECRET=production-local-secret",
      "PINTEREST_API_ENVIRONMENT=production",
      `GROWTH_CREDENTIAL_ENCRYPTION_KEY=${validKey}`,
    ].join("\n"), [
      "PINTEREST_APP_ID=local-app",
      "PINTEREST_APP_SECRET=local-secret",
      `PINTEREST_REDIRECT_URI=${redirect}`,
      "DATABASE_URL=should-not-be-forwarded",
    ].join("\n"));

    const result = run(harness, "explicit-process-app");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      names: [
        "GROWTH_CREDENTIAL_ENCRYPTION_KEY", "PINTEREST_API_ENVIRONMENT",
        "PINTEREST_APP_ID", "PINTEREST_APP_SECRET", "PINTEREST_REDIRECT_URI",
      ],
      explicitPrecedence: true, productionLocalPrecedence: true,
      redirectValid: true, environmentValid: true, keyValid: true,
      noDatabase: true,
    });
  });

  it("fails closed on missing encryption key before any worker starts", () => {
    const harness = fixture([
      "PINTEREST_APP_ID=one",
      "PINTEREST_APP_SECRET=two",
      `PINTEREST_REDIRECT_URI=${redirect}`,
      "PINTEREST_API_ENVIRONMENT=production",
    ].join("\n"));
    const result = run(harness);
    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe("BLOCKED");
    expect(result.stderr).toBe("");
  });

  it("fails closed on sandbox environment and an invalid encryption key", () => {
    const badEnv = fixture([
      "PINTEREST_APP_ID=one",
      "PINTEREST_APP_SECRET=two",
      `PINTEREST_REDIRECT_URI=${redirect}`,
      "PINTEREST_API_ENVIRONMENT=sandbox",
      `GROWTH_CREDENTIAL_ENCRYPTION_KEY=${validKey}`,
    ].join("\n"));
    const badKey = fixture([
      "PINTEREST_APP_ID=one",
      "PINTEREST_APP_SECRET=two",
      `PINTEREST_REDIRECT_URI=${redirect}`,
      "PINTEREST_API_ENVIRONMENT=production",
      "GROWTH_CREDENTIAL_ENCRYPTION_KEY=not-a-valid-32-byte-key",
    ].join("\n"));
    for (const file of [badEnv, badKey]) {
      const result = run(file);
      expect(result.status).toBe(1);
      expect(result.stdout.trim()).toBe("BLOCKED");
      expect(result.stderr).toBe("");
    }
  });
});
