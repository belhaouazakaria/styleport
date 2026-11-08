import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installer = readFileSync("workers/install-growth-autonomous-content-systemd.sh", "utf8");
const launcher = readFileSync("workers/growth-autonomous-content-launch.cjs", "utf8");
const runner = readFileSync("workers/growth-autonomous-content.ts", "utf8");
const alert = readFileSync("workers/growth-autonomous-content-alert.cjs", "utf8");

describe("bounded automated content generation host", () => {
  it("installs a disabled schedule and private alert", () => {
    execFileSync("bash", ["-n", "workers/install-growth-autonomous-content-systemd.sh"]);
    execFileSync("node", ["--check", "workers/growth-autonomous-content-launch.cjs"]);
    execFileSync("node", ["--check", "workers/growth-autonomous-content-alert.cjs"]);
    expect(installer).toContain("OnCalendar=*-*-* 06:30:00 UTC");
    expect(installer).toContain("OnFailure=$ALERT");
    expect(installer).toContain("EnvironmentFile=$AI_ENV");
    expect(installer).toContain("0:0:600");
    expect(installer).toContain("GROWTH_CONTENT_INSTALL=INSTALLED_DISABLED");
    // A prior source defect duplicated three installer bodies and left quoted
    // grep fragments, which bash -n alone did not reliably expose.
    expect((installer.match(/cat > "\$STAGE\/\$SERVICE"/g) || [])).toHaveLength(1);
    expect((installer.match(/GROWTH_CONTENT_INSTALL=INSTALLED_DISABLED/g) || [])).toHaveLength(1);
    expect(installer).toContain("grep -Eq '^GROWTH_OPENAI_API_KEY=sk-[A-Za-z0-9_-]{12,}
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
    expect(alert).toContain("GROWTH_AUTONOMOUS_CONTENT_ALERT_ENABLED");
  });
  it("refuses the ordinary OpenAI key, requires isolated project and no automatic publish", () => {
    expect(launcher).toContain("GROWTH_OPENAI_API_KEY");
    expect(launcher).toContain("GROWTH_OPENAI_PROJECT_ID");
    expect(launcher).toContain("key === normalKey");
    expect(launcher).not.toContain("loadEnvConfig(APP");
    expect(launcher).not.toContain("OPENAI_API_KEY: normalKey");
    expect(launcher).toContain('GROWTH_AI_IMAGE_ENABLED: "false"');
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launcher).toContain("validatedDatabaseUrl(rows)");
    expect(launcher).not.toContain("console.log(child.stderr)");
    expect(runner).toContain("onlyJobId: jobId");
    expect(runner).toContain("maxAttempts: 1");
    expect(runner).toContain("revokeGrowthWorkerActivation(deadline)");
    expect(runner).toContain("GROWTH_AUTONOMOUS_PUBLICATIONS=0");
    // It may mention the publisher type to exclude pending approved publications\n    // from blocking local content work, but must never enqueue one.\n    expect(runner).not.toContain("type: GrowthJobType.PINTEREST_PIN_PUBLISH");
  });
});
 \"\$AI_ENV\"");
    expect(installer).toContain("grep -Eq '^GROWTH_OPENAI_PROJECT_ID=proj_[A-Za-z0-9_-]{3,128}
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
    expect(alert).toContain("GROWTH_AUTONOMOUS_CONTENT_ALERT_ENABLED");
  });
  it("refuses the ordinary OpenAI key, requires isolated project and no automatic publish", () => {
    expect(launcher).toContain("GROWTH_OPENAI_API_KEY");
    expect(launcher).toContain("GROWTH_OPENAI_PROJECT_ID");
    expect(launcher).toContain("key === normalKey");
    expect(launcher).not.toContain("loadEnvConfig(APP");
    expect(launcher).not.toContain("OPENAI_API_KEY: normalKey");
    expect(launcher).toContain('GROWTH_AI_IMAGE_ENABLED: "false"');
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launcher).toContain("validatedDatabaseUrl(rows)");
    expect(launcher).not.toContain("console.log(child.stderr)");
    expect(runner).toContain("onlyJobId: jobId");
    expect(runner).toContain("maxAttempts: 1");
    expect(runner).toContain("revokeGrowthWorkerActivation(deadline)");
    expect(runner).toContain("GROWTH_AUTONOMOUS_PUBLICATIONS=0");
    // It may mention the publisher type to exclude pending approved publications\n    // from blocking local content work, but must never enqueue one.\n    expect(runner).not.toContain("type: GrowthJobType.PINTEREST_PIN_PUBLISH");
  });
});
 \"\$AI_ENV\"");
    expect(installer).toContain("saytwist-growth-private-report");
    expect(installer).toContain("saytwist-growth-daily-fresh");
    expect(installer).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=\$SHA");
    expect(installer).toContain("EXPECTED_RELEASE=\$SHA");
    expect(installer).toContain("! systemctl is-active --quiet \"\$SERVICE\" || fail");
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
    expect(alert).toContain("GROWTH_AUTONOMOUS_CONTENT_ALERT_ENABLED");
  });
  it("refuses the ordinary OpenAI key, requires isolated project and no automatic publish", () => {
    expect(launcher).toContain("GROWTH_OPENAI_API_KEY");
    expect(launcher).toContain("GROWTH_OPENAI_PROJECT_ID");
    expect(launcher).toContain("key === normalKey");
    expect(launcher).not.toContain("loadEnvConfig(APP");
    expect(launcher).not.toContain("OPENAI_API_KEY: normalKey");
    expect(launcher).toContain('GROWTH_AI_IMAGE_ENABLED: "false"');
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launcher).toContain("validatedDatabaseUrl(rows)");
    expect(launcher).not.toContain("console.log(child.stderr)");
    expect(runner).toContain("onlyJobId: jobId");
    expect(runner).toContain("maxAttempts: 1");
    expect(runner).toContain("revokeGrowthWorkerActivation(deadline)");
    expect(runner).toContain("GROWTH_AUTONOMOUS_PUBLICATIONS=0");
    // It may mention the publisher type to exclude pending approved publications\n    // from blocking local content work, but must never enqueue one.\n    expect(runner).not.toContain("type: GrowthJobType.PINTEREST_PIN_PUBLISH");
  });
});
