import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const workspace = process.cwd();
const bootstrapPath = path.join(workspace, "workers/growth-worker-bootstrap.ts");
const configPath = path.join(workspace, "lib/growth/pinterest/config.ts");
const credentialsPath = path.join(workspace, "lib/growth/pinterest/credentials.ts");
const tsxCliPath = path.join(workspace, "node_modules/tsx/dist/cli.mjs");
const temporaryDirectories: string[] = [];
const encryptionKey = Buffer.alloc(32, 4).toString("base64");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Growth worker bootstrap", () => {
  it("loads Next environment files before Pinterest configuration and credential use", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "saytwist-growth-worker-"));
    temporaryDirectories.push(directory);
    writeFileSync(path.join(directory, ".env"), [
      "PINTEREST_APP_SECRET=from-env",
      "PINTEREST_REDIRECT_URI=https://saytwist.com/api/admin/growth/pinterest/oauth/callback",
      "PINTEREST_API_ENVIRONMENT=production",
      `GROWTH_CREDENTIAL_ENCRYPTION_KEY=${encryptionKey}`,
    ].join("\n"));
    writeFileSync(path.join(directory, ".env.production.local"), "PINTEREST_APP_SECRET=from-production-local\n");
    const harnessPath = path.join(directory, "worker-bootstrap-harness.ts");
    writeFileSync(harnessPath, [
      `import { loadGrowthWorkerEnvironment } from ${JSON.stringify(bootstrapPath)};`,
      'void (async () => {',
      `  loadGrowthWorkerEnvironment(${JSON.stringify(directory)});`,
      `  const { getPinterestConfigurationState } = await import(${JSON.stringify(configPath)});`,
      `  const { encryptPinterestCredentials, decryptPinterestCredentials } = await import(${JSON.stringify(credentialsPath)});`,
      '  const encrypted = encryptPinterestCredentials({ accessToken: "test-access", refreshToken: "test-refresh" });',
      '  const decrypted = decryptPinterestCredentials(encrypted);',
      '  process.stdout.write(JSON.stringify({',
      '    state: getPinterestConfigurationState(),',
      '    explicitEnvironmentPreserved: process.env.PINTEREST_APP_ID === "provided-by-process",',
      '    productionLocalPrecedence: process.env.PINTEREST_APP_SECRET === "from-production-local",',
      '    credentialsRoundTrip: decrypted.accessToken === "test-access" && decrypted.refreshToken === "test-refresh",',
      '  }));',
      '})();',
    ].join("\n"));

    const result = spawnSync(process.execPath, [tsxCliPath, harnessPath], {
      cwd: workspace,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH || "",
        NODE_ENV: "production",
        PINTEREST_APP_ID: "provided-by-process",
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      state: { configured: true, missingNames: [], environment: "production" },
      explicitEnvironmentPreserved: true,
      productionLocalPrecedence: true,
      credentialsRoundTrip: true,
    });
  });
});
