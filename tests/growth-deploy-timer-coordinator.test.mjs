import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploy = readFileSync("scripts/hostinger-deploy.sh", "utf8");
const coordinator = readFileSync("workers/growth-deploy-release-coordinator.py", "utf8");
const installer = readFileSync("workers/install-growth-deploy-release-coordinator.sh", "utf8");
const main = deploy.slice(deploy.indexOf("\nmain() {"));

describe("Growth timer release coordination", () => {
  it("holds all existing Growth timers before application files are replaced", () => {
    expect(deploy.indexOf("hold_growth_timers\n  backup_current_release")).toBeGreaterThan(-1);
    expect(deploy.indexOf("hold_growth_timers\n  backup_current_release")).toBeLessThan(
      deploy.indexOf("publish_release\n"),
    );
    expect(coordinator).toContain("GROWTH_DEPLOY_TIMERS=HELD_14");
    expect(coordinator).toContain("systemctl(\"disable\", \"--now\", *TIMERS");
  });

  it("restores exact-SHA pins only after release health, and recovers the old SHA on rollback", () => {
    expect(main.indexOf("restart_web_process")).toBeLessThan(main.indexOf("finalize_release"));
    expect(deploy.slice(deploy.indexOf("finalize_release()"))).toContain('restore "$RELEASE_SHA"');
    expect(deploy).toContain('recover "$OLD_RELEASE_SHA"');
    expect(coordinator).toContain("GROWTH_DEPLOY_TIMERS=RESTORED_14");
    expect(coordinator).toContain("GROWTH_DEPLOY_TIMERS=RECOVERED_14");
  });

  it("freezes the queue and Growth safety state while timers are held", () => {
    expect(coordinator).toContain("FAILED_RETRYABLE");
    expect(coordinator).toContain("pendingSha256");
    expect(coordinator).toContain("PENDING_QUEUE_CHANGED");
    expect(coordinator).toContain("workerActivationExpiresAt");
    expect(coordinator).toContain("assert_safe_database(state[\"pendingSha256\"])");
  });

  it("executes coordinator commands when output capture is disabled", () => {
    expect(coordinator.indexOf("completed = subprocess.run(args, check=check, text=True,")).toBeGreaterThan(-1);
    expect(coordinator.indexOf('return completed.stdout.strip() if capture else ""')).toBeGreaterThan(
      coordinator.indexOf("completed = subprocess.run(args, check=check, text=True,"),
    );
  });

  it("installs only the root coordinator and its limited saytwist sudo rule", () => {
    expect(installer).toContain("saytwist-growth-deploy-coordinator");
    expect(installer).toContain('install -o root -g root -m 0755 "$SOURCE" "$TARGET"');
    expect(installer).toContain("visudo -cf");
    expect(installer).not.toContain("systemctl enable");
    expect(installer).not.toContain("systemctl start");
  });
});
