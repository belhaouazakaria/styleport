import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  originalSourceCreativeCopy, renderOriginalSourcePin,
} from "@/lib/growth/viral/source-creative";
import { readPngDimensions, creativeAssetChecksum } from "@/lib/growth/creative/storage";

const service = readFileSync("lib/growth/viral/source-publishing.ts", "utf8");
const worker = readFileSync("lib/growth/viral/source-publisher.ts", "utf8");
const host = readFileSync("workers/growth-viral-source-launch.cjs", "utf8");
const runner = readFileSync("workers/growth-viral-source-publisher.ts", "utf8");
const installer = readFileSync("workers/install-growth-viral-source-systemd.sh", "utf8");
const sql = readFileSync(
  "prisma/migrations/20261109190000_growth_viral_pin_approval/migration.sql", "utf8",
);
const web = readFileSync("app/api/admin/growth/viral/route.ts", "utf8");

describe("Original non-SayTwist source Pin creative", () => {
  it("renders 1000x1500 PNG with original code and truthful source copy", async () => {
    const original = originalSourceCreativeCopy(
      "Royal English Translator",
      "https://anythingtranslate.com/translators/royal-english-translator/",
    );
    expect(original.footerDomain).toBe("anythingtranslate.com");
    expect(original.description).toContain("AnythingTranslate");
    const image = await renderOriginalSourcePin(original);
    expect(readPngDimensions(image)).toEqual({ width: 1000, height: 1500 });
    expect(image.length).toBeGreaterThan(2000);
    expect(creativeAssetChecksum(image)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses other origins, untrusted titles and image prompt injection", async () => {
    expect(() => originalSourceCreativeCopy("Royal English Translator",
      "https://anythingtranslate.com.evil.test/translators/royal-english/")).toThrow();
    expect(() => originalSourceCreativeCopy("<script>evil</script> Translator",
      "https://anythingtranslate.com/translators/royal-english/")).toThrow();
    const valid = originalSourceCreativeCopy("Royal English Translator",
      "https://anythingtranslate.com/translators/royal-english/");
    await expect(renderOriginalSourcePin({ ...valid,
      footerDomain: "saytwist.com" as "anythingtranslate.com" })).rejects.toThrow();
  });
});

describe("Individually approved source publishing, separate from existing publisher", () => {
  it("preserves exact destination, owner consent, source rights, fair quotas, and approval ID", () => {
    expect(service).toContain("createOriginalSourceAsset(");
    expect(service).toContain("status: \"PLANNED\"");
    expect(service).toContain("rightsVerified: true");
    expect(service).toContain("status: \"APPROVED\"");
    expect(service).toContain("sourcePublishingRightsVerified: true");
    expect(service).toContain("otherApprovedSaytwist + otherSource");
    expect(service).toContain('canonicalSourceTranslatorUrl(draft.destinationUrl)');
    expect(service).toContain("publicationAttemptKey: ");
    expect(service).toContain("confirmation: true");
    expect(service).not.toContain("createPinterestPin(");
    expect(web).toContain('z.literal("APPROVE_SOURCE_PIN")');
    expect(web).toContain("getSessionOrNull()");
    expect(web).toContain("isSameOriginMutation(request)");
  });

  it("persists exactly one provider claim, independently rate-limits and never blind retries", () => {
    expect(worker).toContain('status: "APPROVED", publishClaimAt: null');
    expect(worker).toContain('status: "PUBLISHING", publishClaimAt: now');
    expect(worker).toContain("await createPinterestPin(");
    expect(worker).toContain("revokeGrowthWorkerActivation(deadline)");
    expect(worker).toContain("countBlockingGrowthJobs");
    expect(worker).toContain("creativeAssetChecksum(bytes)");
    expect(worker).toContain('status = providerNotAttempted ? "FAILED" : "OUTCOME_UNKNOWN"');
    expect(worker).not.toContain("updatePinterestPin");
    expect(worker).not.toContain("setTimeout(");
    expect(sql).toContain('OLD."destinationUrl" IS DISTINCT FROM NEW."destinationUrl"');
    expect(sql).toContain("growth_viral_pin_destination_guard");
    expect(sql).toContain("GrowthViralPinTest_one_open_source_concept_idx");
    expect(sql).toContain("'OUTCOME_UNKNOWN'");
    expect(sql).not.toContain('ALTER TABLE "GrowthSettings"');
  });

  it("ships only install-disabled root timer with nine exact-release dependencies", () => {
    execFileSync("bash", ["-n", "workers/install-growth-viral-source-systemd.sh"]);
    execFileSync("node", ["--check", "workers/growth-viral-source-launch.cjs"]);
    execFileSync("node", ["--check", "workers/growth-viral-source-alert.cjs"]);
    expect(installer).toContain("GROWTH_VIRAL_SOURCE_INSTALL=INSTALLED_DISABLED");
    expect(installer).toContain("OnCalendar=*-*-* 15..23:17:00 UTC");
    expect(installer).toContain("autonomous-content");
    expect(installer).toContain("daily-account-analytics");
    expect(installer).toContain("auto-translator-publish");
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
    expect(host).toContain("GROWTH_VIRAL_SOURCE_OWNER_APPROVAL");
    expect(host).toContain("APPROVAL_FILE_UNSAFE");
    expect(host).toContain("validatedDatabaseUrl(rows)");
    expect(host).toContain("loadPinterestRuntimeEnv(APP)");
    expect(runner).toContain("GROWTH_VIRAL_SOURCE_ENTRYPOINT");
    expect(runner).toContain('GROWTH_VIRAL_SOURCE_AI_CALLS=0');
  });
});
