// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { sendGrowthV2FailureAlert } = require("../workers/growth-v2-alert.cjs");
const now = Date.parse("2026-11-15T14:00:00Z");
function fixture() {
  return {
    env: {
      GROWTH_V2_ALERT_ENABLED: "true",
      GROWTH_V2_ALERT_COMPONENT: "courier",
      EXPECTED_RELEASE: "a".repeat(40),
      NODE_ENV: "production",
      STATE_DIRECTORY: "/var/lib/saytwist-growth-v2-courier-alert",
      BREVO_API_KEY: "private-brevo-test-key",
      ALERT_ADMIN_EMAIL: "owner@example.test",
      EMAIL_FROM: "SayTwist <alerts@example.test>",
      DISCORD_BOT_TOKEN: "must-never-enter-alert-body",
    },
    username: "saytwist",
    uid: 1001,
    cwd: "/home/saytwist/htdocs/saytwist.com",
    now,
    read: vi.fn(() => {
      throw Object.assign(Error("missing"), { code: "ENOENT" });
    }),
    write: vi.fn(),
    fetcher: vi.fn().mockResolvedValue({ ok: true }),
  };
}
describe("Independent V2 incident channel", () => {
  it("stays disabled before any identity, state or provider work", async () => {
    const f = fixture();
    f.env.GROWTH_V2_ALERT_ENABLED = "false";
    expect(await sendGrowthV2FailureAlert(f)).toBe("DISABLED");
    expect(f.read).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("submits only fixed incident metadata after durable suppression admission", async () => {
    const f = fixture(),
      order: string[] = [];
    f.write.mockImplementation(() => {
      order.push("reserved");
    });
    f.fetcher.mockImplementation(async () => {
      order.push("submitted");
      return { ok: true };
    });
    expect(await sendGrowthV2FailureAlert(f)).toBe("SUBMITTED");
    expect(order).toEqual(["reserved", "submitted"]);
    expect(f.write).toHaveBeenCalledWith(
      f.env.STATE_DIRECTORY + "/last-alert-at",
      String(now) + "\n",
      { mode: 0o600 },
    );
    const [url, request] = f.fetcher.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(request.redirect).toBe("error");
    expect(request.body).not.toContain(f.env.DISCORD_BOT_TOKEN);
    expect(request.body).not.toContain(f.env.BREVO_API_KEY);
    expect(JSON.parse(request.body).textContent).toContain(
      "Never auto-approve or blindly replay",
    );
  });
  it("rejects wrong identities, component paths and malformed state before a send", async () => {
    for (const change of [
      { uid: 0 },
      { cwd: "/tmp" },
      { username: "other" },
      { env: { ...fixture().env, GROWTH_V2_ALERT_COMPONENT: "unknown" } },
      { env: { ...fixture().env, STATE_DIRECTORY: "/tmp" } },
      { env: { ...fixture().env, EXPECTED_RELEASE: "old" } },
    ]) {
      const f = { ...fixture(), ...change };
      await expect(sendGrowthV2FailureAlert(f)).rejects.toThrow();
      expect(f.fetcher).not.toHaveBeenCalled();
    }
    const f = fixture();
    f.read.mockImplementation(() => "corrupt" as never);
    await expect(sendGrowthV2FailureAlert(f)).rejects.toThrow(
      "V2_ALERT_STATE_INVALID",
    );
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("never fans out an uncertain email, including when the clock moves backward", async () => {
    const f = fixture();
    let stamp: string | undefined;
    f.read.mockImplementation(() => {
      if (stamp) return stamp as never;
      throw Object.assign(Error("missing"), { code: "ENOENT" });
    });
    f.write.mockImplementation((_path: string, value: string) => {
      stamp = value;
    });
    f.fetcher.mockRejectedValueOnce(Error("private provider exception"));
    await expect(sendGrowthV2FailureAlert(f)).rejects.toThrow(
      "V2_ALERT_SUBMISSION_UNKNOWN",
    );
    expect(await sendGrowthV2FailureAlert({ ...f, now: now + 60000 })).toBe(
      "SUPPRESSED",
    );
    expect(await sendGrowthV2FailureAlert({ ...f, now: now - 60000 })).toBe(
      "SUPPRESSED",
    );
    expect(f.fetcher).toHaveBeenCalledOnce();
  });
  it("also supports the isolated intelligence component without PostgreSQL or Discord", async () => {
    const f = fixture();
    f.env.GROWTH_V2_ALERT_COMPONENT = "intelligence";
    f.env.STATE_DIRECTORY = "/var/lib/saytwist-growth-v2-intelligence-alert";
    expect(await sendGrowthV2FailureAlert(f)).toBe("SUBMITTED");
    expect(f.fetcher.mock.calls[0][1].body).toContain("intelligence.service");
  });
  it("both alert executables exit safely when disabled", () => {
    expect(
      execFileSync(process.execPath, ["workers/growth-v2-alert.cjs"], {
        encoding: "utf8",
        env: { GROWTH_V2_ALERT_ENABLED: "false" },
      }),
    ).toBe("GROWTH_V2_ALERT=DISABLED\n");
    expect(
      execFileSync(
        process.execPath,
        ["workers/growth-market-research-alert.cjs"],
        {
          encoding: "utf8",
          env: { GROWTH_MARKET_RESEARCH_ALERT_ENABLED: "false" },
        },
      ),
    ).toBe("MARKET_RESEARCH_ALERT=DISABLED\n");
  });
  it("wires both disabled V2 units to a private independent alert service", () => {
    const script = readFileSync("workers/install-growth-v2-systemd.sh", "utf8");
    expect(() =>
      execFileSync("bash", ["-n", "workers/install-growth-v2-systemd.sh"]),
    ).not.toThrow();
    expect(script).toContain(
      "OnFailure=saytwist-growth-v2-alert@${mode}.service",
    );
    expect(script).toContain("EnvironmentFile=$alert_env");
    expect(script).toContain("StateDirectoryMode=0700");
    expect(script).toContain("growth-v2-alert.cjs");
    expect(script).not.toMatch(/systemctl (?:enable|start|restart)/);
  });
});
