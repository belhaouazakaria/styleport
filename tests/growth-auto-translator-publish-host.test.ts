import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const installer = readFileSync("workers/install-growth-auto-translator-publish-systemd.sh", "utf8");
const launcher = readFileSync("workers/growth-auto-translator-publish-launch.cjs", "utf8");
const runner = readFileSync("workers/growth-auto-translator-publish.ts", "utf8");
const alert = readFileSync("workers/growth-auto-translator-publish-alert.cjs", "utf8");

describe("auto Translator website publication safety", () => {
  it("installs only a disabled 06:57 UTC schedule with a private alert", () => {
    execFileSync("bash", ["-n", "workers/install-growth-auto-translator-publish-systemd.sh"]);
    execFileSync("node", ["--check", "workers/growth-auto-translator-publish-launch.cjs"]);
    execFileSync("node", ["--check", "workers/growth-auto-translator-publish-alert.cjs"]);
    expect(installer).toContain("OnCalendar=*-*-* 06:57:00 UTC");
    expect(installer).toContain("Persistent=false");
    expect(installer).toContain("OnFailure=$ALERT");
    expect(installer).toContain("GROWTH_AUTO_TRANSLATOR_PUBLISH_INSTALL=INSTALLED_DISABLED");
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
    expect(alert).toContain("GROWTH_AUTO_TRANSLATOR_PUBLISH_ALERT_ENABLED");
  });
  it("never forwards provider credentials or touches Pinterest", () => {
    expect(launcher).toContain("validatedDatabaseUrl(apps)");
    expect(launcher).toContain("WATCHDOG_EXPECTED_RELEASE_SHA=");
    expect(launcher).toContain('GROWTH_AI_IMAGE_ENABLED: "false"');
    expect(launcher).not.toContain("loadPinterestRuntimeEnv");
    expect(launcher).not.toContain("OPENAI_API_KEY:");
    expect(launcher).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(runner).toContain("readTranslatorSnapshot(version.translatorId, tx)");
    expect(runner).toContain("validateTranslatorQuality");
    expect(runner).toContain("classifyTranslatorDuplicate");
    expect(runner).toContain("MAX_DEDUPE_CANDIDATES");
    expect(runner).toContain("countBlockingGrowthJobs(tx)");
    expect(runner).toContain("TRANSLATOR_AUTONOMOUSLY_PUBLISHED");
    expect(runner).toContain("publishedToday >= 1");
    expect(runner).not.toContain("createPinterestPin");
    expect(runner).not.toContain("runGrowthWorker");
  });
});
