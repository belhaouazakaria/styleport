import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPinterestConfigurationState } from "@/lib/growth/pinterest/config";

const encryptionKey = Buffer.alloc(32, 9).toString("base64");

function configure(overrides: Record<string, string | undefined> = {}) {
  const values = {
    PINTEREST_APP_ID: "test-app-id",
    PINTEREST_APP_SECRET: "test-app-secret",
    PINTEREST_REDIRECT_URI: "https://saytwist.com/api/admin/growth/pinterest/oauth/callback",
    PINTEREST_API_ENVIRONMENT: "production",
    GROWTH_CREDENTIAL_ENCRYPTION_KEY: encryptionKey,
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

describe("Pinterest configuration status", () => {
  beforeEach(() => configure());
  afterEach(() => vi.unstubAllEnvs());

  it("reports a configured production environment without serializing secrets", () => {
    const state = getPinterestConfigurationState();
    expect(state).toEqual({ configured: true, missingNames: [], environment: "production" });
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("test-app-secret");
    expect(serialized).not.toContain(encryptionKey);
    expect(serialized).not.toContain("access-token");
    expect(serialized).not.toContain("refresh-token");
  });

  it("reports missing variable names without their values", () => {
    vi.stubEnv("PINTEREST_APP_ID", "");
    expect(getPinterestConfigurationState()).toMatchObject({ configured: false, missingNames: ["PINTEREST_APP_ID"], environment: "production" });
    vi.stubEnv("PINTEREST_APP_SECRET", "");
    expect(getPinterestConfigurationState()).toMatchObject({ configured: false, missingNames: expect.arrayContaining(["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"]) });
  });

  it("fails safely for an invalid encryption key", () => {
    vi.stubEnv("GROWTH_CREDENTIAL_ENCRYPTION_KEY", "not-a-valid-key");
    expect(getPinterestConfigurationState()).toEqual({ configured: false, missingNames: [], environment: "production", error: "Pinterest configuration is invalid." });
  });
});
