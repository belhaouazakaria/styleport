import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const requireCjs = createRequire(import.meta.url);
const { sendWatchdogFailureAlert } = requireCjs("../workers/growth-lease-watchdog-alert.cjs") as {
  sendWatchdogFailureAlert: (options?: Record<string, unknown>) => Promise<string>;
};
const { validateValues } = requireCjs("../workers/provision-growth-lease-watchdog-alert-env.cjs") as {
  validateValues: (data: unknown) => Record<string, string>;
};

const configuration = {
  NODE_ENV: "production",
  GROWTH_WATCHDOG_ALERT_ENABLED: "true",
  STATE_DIRECTORY: "/var/lib/saytwist-growth-watchdog",
  BREVO_API_KEY: "test-brevo-key-no-network",
  EMAIL_FROM: "SayTwist Alerts <alerts@example.com>",
  ALERT_ADMIN_EMAIL: "owner@example.com",
};
const identity = { username: "saytwist", cwd: "/home/saytwist/htdocs/saytwist.com", uid: 1001 };
const missing = () => { throw Object.assign(new Error("not found"), { code: "ENOENT" }); };

describe("Phase14C independent watchdog failure notification", () => {
  it("stays inert without the explicit alert toggle", async () => {
    const fetcher = vi.fn();
    expect(await sendWatchdogFailureAlert({
      env: { ...configuration, GROWTH_WATCHDOG_ALERT_ENABLED: "false" }, fetcher,
    })).toBe("DISABLED");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects missing credentials or unexpected runtime identity before any network request", async () => {
    const fetcher = vi.fn();
    for (const options of [
      { env: { ...configuration, BREVO_API_KEY: "" } },
      { env: { ...configuration, ALERT_ADMIN_EMAIL: "" } },
      { env: { ...configuration, EMAIL_FROM: "" } },
      { env: configuration, uid: 0 },
      { env: configuration, username: "root" },
      { env: { ...configuration, STATE_DIRECTORY: "/tmp/watchdog" } },
    ]) {
      await expect(sendWatchdogFailureAlert({
        ...identity, ...options, fetcher,
      })).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reserves the one-hour notification window before calling Brevo", async () => {
    const fetcher = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
    const write = vi.fn();
    const result = await sendWatchdogFailureAlert({
      env: configuration, ...identity, now: 1782854400000,
      read: missing, write, fetcher,
    });
    expect(result).toBe("SUBMITTED");
    expect(write).toHaveBeenCalledWith(
      "/var/lib/saytwist-growth-watchdog/last-alert-at",
      "1782854400000\n", { mode: 0o600 },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.brevo.com/v3/smtp/email");
    const request = fetcher.mock.calls[0]?.[1] as unknown as { body: string, headers: Record<string, string> };
    const body = JSON.parse(request.body);
    expect(body.to).toEqual([{ email: "owner@example.com" }]);
    expect(request.headers["api-key"]).toBe(configuration.BREVO_API_KEY);
  });

  it("suppresses a second attempt and blocks invalid existing state without notifying", async () => {
    const fetcher = vi.fn();
    const write = vi.fn();
    const now = 1782854400000;
    const opts = { env: configuration, ...identity, fetcher, write, now };
    expect(await sendWatchdogFailureAlert({
      ...opts, read: () => String(now - 30_000),
    })).toBe("SUPPRESSED");
    await expect(sendWatchdogFailureAlert({
      ...opts, read: () => "malformed",
    })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("does not retry an ambiguous email submission", async () => {
    const write = vi.fn();
    const fetcher = vi.fn(async () => { throw new Error("network error with secrets"); });
    await expect(sendWatchdogFailureAlert({
      env: configuration, ...identity, now: 1782854400000,
      read: missing, write, fetcher,
    })).rejects.toThrow("SUBMISSION_UNKNOWN");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("requires root-owned private alert credentials and links the timer to OnFailure", () => {
    const installer = readFileSync("workers/install-growth-lease-watchdog-systemd.sh", "utf8");
    const provisioner = readFileSync("workers/provision-growth-lease-watchdog-alert-env.cjs", "utf8");
    execFileSync("bash", ["-n", "workers/install-growth-lease-watchdog-systemd.sh"]);
    execFileSync("node", ["--check", "workers/growth-lease-watchdog-alert.cjs"]);
    execFileSync("node", ["--check", "workers/provision-growth-lease-watchdog-alert-env.cjs"]);
    expect(installer).toContain("OnFailure=$ALERT_SERVICE");
    expect(installer).toContain("EnvironmentFile=$ALERT_ENV");
    expect(installer).toContain("StateDirectory=saytwist-growth-watchdog");
    expect(installer).toContain('stat -c %a "$ALERT_ENV"');
    expect(installer).toContain("User=saytwist");
    expect(installer).not.toContain("BREVO_API_KEY=");
    expect(provisioner).toContain("HOSTINGER_WATCHDOG_ALERT_PROVISION_APPROVAL");
  });

  it("provisions only exactly the three required fields", () => {
    const valid = {
      BREVO_API_KEY: "test-brevo-key-no-network",
      EMAIL_FROM: "SayTwist Alerts <alerts@example.com>",
      ALERT_ADMIN_EMAIL: "owner@example.com",
    };
    expect(validateValues(valid)).toEqual(valid);
    expect(() => validateValues({ ...valid, UNKNOWN_SECRET: "bad" })).toThrow();
    expect(() => validateValues({ ...valid, BREVO_API_KEY: "abc\nxyz" })).toThrow();
    expect(() => validateValues({ ...valid, EMAIL_FROM: "" })).toThrow();
  });
});
