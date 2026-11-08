import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coordinator = readFileSync("workers/restore-growth-live-timers-v2-systemd.sh", "utf8");
const privateRotator = readFileSync("workers/rotate-growth-private-report-release-systemd.sh", "utf8");
const old = readFileSync("workers/restore-growth-release-timers-systemd.sh", "utf8");

describe("six-timer protected release restoration, source only", () => {
  it("parses shell and preserves old tested coordinator for historical releases", () => {
    execFileSync("bash", ["-n", "workers/restore-growth-live-timers-v2-systemd.sh"]);
    execFileSync("bash", ["-n", "workers/rotate-growth-private-report-release-systemd.sh"]);
    expect(old).toContain("GROWTH_RELEASE_RESTORE=PASSED");
    expect(coordinator).toContain("GROWTH_LIVE_RELEASE_RESTORE=PASSED");
    expect(coordinator).toContain("GROWTH_LIVE_TIMERS=SIX_ACTIVE");
  });
  it("uses exactly the six independently audited root-only helper Git blobs", () => {
    const found = [...coordinator.matchAll(/"([a-z0-9-]+\.sh):([0-9a-f]{40})"/g)];
    expect(found).toHaveLength(6);
    const names = found.map(x => x[1]);
    expect(new Set(names).size).toBe(6);
    for (const entry of found) {
      const raw = readFileSync("workers/" + entry[1]);
      const computed = createHash("sha1").update(Buffer.concat([
        Buffer.from("blob " + raw.length + "\0", "utf8"), raw,
      ])).digest("hex");
      expect(entry[2]).toBe(computed);
    }
    expect(coordinator).toContain("install -o root -g root -m 0700");
    expect(coordinator).toContain("bash -n");
  });
  it("rotates all existing approved schedules and never executes paid AI or Telegram directly", () => {
    for (const unit of [
      "saytwist-growth-lease-watchdog",
      "saytwist-growth-daily-observe",
      "saytwist-growth-autonomous-cycle",
      "saytwist-growth-approved-publisher",
      "saytwist-growth-daily-fresh",
      "saytwist-growth-private-report",
    ]) expect(coordinator).toContain(unit);
    expect(coordinator).toContain('stage=PAID_AI_RESTORE');
    expect(coordinator).toContain('stage=PRIVATE_TELEGRAM_RESTORE');
    expect(coordinator).toContain('systemctl enable --now "$AI.timer"');
    expect(coordinator).toContain('systemctl enable --now "$REPORT.timer"');
    expect(coordinator).toContain('systemctl disable --now "$PUB.timer"');
    expect(coordinator).toContain('systemctl disable --now "$PUB.timer" "$CYCLE.timer" "$OBS.timer" "$AI.timer" "$REPORT.timer"');
    expect(coordinator).not.toContain("systemctl start \"$AI.service\"");
    expect(coordinator).not.toContain("systemctl start \"$REPORT.service\"");
  });
  it("private recipient and exact approved SHA rotate together without a message send", () => {
    expect(privateRotator).toContain('Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$OLD');
    expect(privateRotator).toContain('Environment=GROWTH_PRIVATE_REPORT_APPROVAL=SAYTWIST_PRIVATE_DAILY_REPORT:$NEW');
    expect(privateRotator).toContain('TELEGRAM_REPORT_CHAT_ID');
    expect(privateRotator).toContain('OnCalendar=*-*-* 05:05:00 UTC');
    expect(privateRotator).toContain("PRIVATE_REPORT_ROTATION=READY_DISABLED");
    expect(privateRotator).not.toContain("sendMessage");
    expect(privateRotator).not.toContain("systemctl enable");
    expect(privateRotator).not.toContain("systemctl start");
  });
});
