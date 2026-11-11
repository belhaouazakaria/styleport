import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const unpackScript = path.join(root, "scripts/hostinger-unpack-artifact.py");
const transferScript = path.join(root, "scripts/hostinger-fetch-release.sh");
const workflow = path.join(root, ".github/workflows/deploy-hostinger.yml");
const sha = "a".repeat(40);
const temporaryDirectories = [];

afterEach(() => {
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function createArtifact({ embeddedSha = sha, extraFile = false } = {}) {
  const rootDir = mkdtempSync(path.join(tmpdir(), "saytwist-release-transfer-"));
  temporaryDirectories.push(rootDir);
  mkdirSync(path.join(rootDir, ".next"));
  writeFileSync(path.join(rootDir, ".release-sha"), embeddedSha + "\n");
  writeFileSync(path.join(rootDir, ".next", "BUILD_ID"), "fixture\n");
  const tarPath = path.join(rootDir, "release.tar.gz");
  execFileSync("tar", ["-czf", tarPath, ".release-sha", ".next"], { cwd: rootDir });
  const zipPath = path.join(rootDir, "artifact.zip");
  const extra = extraFile ? "1" : "0";
  execFileSync("python3", ["-c", [
    "import sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1], 'w') as archive:",
    "    archive.write(sys.argv[2], 'release.tar.gz')",
    "    if sys.argv[3] == '1': archive.writestr('unexpected.txt', 'unexpected')",
  ].join("\n"), zipPath, tarPath, extra]);
  const digest = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
  return { zipPath, tarPath, digest, destination: path.join(rootDir, "extracted.tar.gz") };
}

function unpack(fixture, options = {}) {
  return spawnSync("python3", [
    unpackScript,
    "--artifact-zip", fixture.zipPath,
    "--destination", fixture.destination,
    "--expected-zip-sha256", options.digest ?? fixture.digest,
    "--release-sha", options.sha ?? sha,
  ], { encoding: "utf8" });
}

describe("Hostinger verified artifact transfer", () => {
  it("extracts exactly the approved SHA-matched release bundle", () => {
    const fixture = createArtifact();
    const result = unpack(fixture);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(fixture.destination)).toEqual(readFileSync(fixture.tarPath));
  });

  it("rejects an artifact ZIP with an incorrect cryptographic digest", () => {
    const fixture = createArtifact();
    const result = unpack(fixture, { digest: "0".repeat(64) });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Artifact validation failed");
    expect(() => readFileSync(fixture.destination)).toThrow();
  });

  it("rejects an artifact whose embedded release identity is different", () => {
    const fixture = createArtifact({ embeddedSha: "b".repeat(40) });
    const result = unpack(fixture);
    expect(result.status).not.toBe(0);
    expect(() => readFileSync(fixture.destination)).toThrow();
  });

  it("rejects additional ZIP entries", () => {
    const fixture = createArtifact({ extraFile: true });
    const result = unpack(fixture);
    expect(result.status).not.toBe(0);
    expect(() => readFileSync(fixture.destination)).toThrow();
  });

  it("keeps the exact-SHA dispatch gate, uploads only tiny scripts, and pulls by verified digest", () => {
    const source = readFileSync(workflow, "utf8");
    expect(source).toContain("  actions: read");
    expect(source).toContain('EXPECTED_RELEASE_SHA: ${{ inputs.expected_release_sha }}');
    expect(source).toContain('artifact_id="$(jq -r');
    expect(source).toContain('[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]');
    expect(source).toContain("scripts/hostinger-fetch-release.sh,scripts/hostinger-unpack-artifact.py");
    expect(source).not.toContain("release.tar.gz,scripts/hostinger-deploy.sh");
    expect(source).toContain("bash ./scripts/hostinger-fetch-release.sh");
    expect(source).toContain("bash ./scripts/hostinger-deploy.sh");
    expect(source).toContain("HOSTINGER_EXPECT_NO_PENDING_MIGRATIONS");
  });

  it("keeps the transfer script syntactically valid", () => {
    expect(() => execFileSync("bash", ["-n", transferScript])).not.toThrow();
  });
});
