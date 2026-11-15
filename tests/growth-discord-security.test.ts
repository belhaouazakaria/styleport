// @vitest-environment node
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { verifyDiscordSignature } from "@/lib/growth/discord/interactions";
import { getDiscordConfig } from "@/lib/growth/discord/config";
import {
  discordRequest,
  DiscordTransportError,
} from "@/lib/growth/discord/transport";
import { evidenceChecksum } from "@/lib/growth/approvals/contracts";
const config = {
  applicationId: "12345678901234567",
  ownerDiscordId: "22345678901234567",
  ownerUserId: "admin",
  publicKey: "a".repeat(64),
  token: "secret-bot-token-with-at-least-30-chars",
};
describe("Discord interaction trust boundary", () => {
  it("verifies exact raw body and timestamp with an actual Ed25519 key", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const key = publicKey
      .export({ type: "spki", format: "der" })
      .subarray(-32)
      .toString("hex");
    const timestamp = "1794744000";
    const body = '{"type":1}';
    const signature = sign(
      null,
      Buffer.from(timestamp + body),
      privateKey,
    ).toString("hex");
    const now = Number(timestamp) * 1000;
    expect(verifyDiscordSignature(body, signature, timestamp, key, now)).toBe(
      true,
    );
    expect(
      verifyDiscordSignature(body + " ", signature, timestamp, key, now),
    ).toBe(false);
    expect(
      verifyDiscordSignature(body, signature, timestamp, key, now + 301000),
    ).toBe(false);
    expect(
      verifyDiscordSignature(body, signature, timestamp, key, now - 301000),
    ).toBe(false);
    expect(verifyDiscordSignature(body, "bad", timestamp, key, now)).toBe(
      false,
    );
  });
  it("defaults disabled and never accepts partial owner configuration", () => {
    expect(() => getDiscordConfig({})).toThrow("DISABLED");
    expect(() => getDiscordConfig({ GROWTH_DISCORD_ENABLED: "true" })).toThrow(
      "CONFIGURATION",
    );
  });
  it("canonicalizes PostgreSQL JSONB key ordering while binding all values", () => {
    expect(evidenceChecksum({ a: 1, b: { c: 2, d: 3 } })).toBe(
      evidenceChecksum({ b: { d: 3, c: 2 }, a: 1 }),
    );
    expect(evidenceChecksum({ a: 1 })).not.toBe(evidenceChecksum({ a: 2 }));
  });
  it("records a 429 retry delay and never includes token/response text in errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ retry_after: 23 }), { status: 429 }),
      );
    await expect(
      discordRequest("/users/@me/channels", "POST", {}, config, fetcher),
    ).rejects.toMatchObject({ code: "RATE_LIMIT", retryAfterMs: 23000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const failure = vi.fn().mockRejectedValue(Error(config.token));
    await expect(
      discordRequest("/users/@me/channels", "POST", {}, config, failure),
    ).rejects.toEqual(new DiscordTransportError("UNKNOWN"));
    expect(failure).toHaveBeenCalledTimes(1);
  });
});
