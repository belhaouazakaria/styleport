import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const installer = readFileSync(
  resolve(process.cwd(), "workers/install-growth-manual-gap-fill-systemd.sh"),
  "utf8",
);
const launcher = readFileSync(
  resolve(process.cwd(), "workers/growth-manual-gap-fill-launch.cjs"),
  "utf8",
);

describe("manual Gap Fill production runtime contract", () => {
  it("installs only a one-shot systemd template without enabling a timer", () => {
    expect(installer).toContain("Type=oneshot");
    expect(installer).toContain("User=saytwist");
    expect(installer).toContain("EnvironmentFile=$AI_ENV");
    expect(installer).toContain("systemctl daemon-reload");
    expect(installer).not.toMatch(/systemctl\s+enable\s+/);
    expect(installer).not.toContain("saytwist-growth-manual-gap-fill.timer");
  });

  it("exposes only the UUID-validating root helper and a private Growth AI key", () => {
    expect(installer).toContain("saytwist ALL=(root) NOPASSWD: $HELPER");
    expect(installer).toContain("^GROWTH_OPENAI_API_KEY=sk-");
    expect(installer).toContain("^GROWTH_OPENAI_PROJECT_ID=proj_");
    expect(installer).toContain("systemctl start --no-block");
    expect(launcher).toContain("DATABASE_URL: databaseUrl");
    expect(launcher).toContain('GROWTH_WORKER_RUN_ENABLED: "false"');
    expect(launcher).not.toMatch(/^\s+OPENAI_API_KEY:/m);
  });
});
