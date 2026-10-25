import { describe, expect, it, vi } from "vitest";
import { TelegramProvisioningError, verifyGrowthTelegramProvisioning } from "@/lib/growth/reporting/provisioning";

const env = {
  TELEGRAM_REPORTS_ENABLED: "false",
  TELEGRAM_BOT_TOKEN: "123456789:" + "A".repeat(35),
  TELEGRAM_REPORT_CHAT_ID: "123456789",
};

const okBot = () => Response.json({
  ok: true, result: { id: 123456789, is_bot: true, username: "SayTwistGrowthBot", can_join_groups: false },
});
const okChat = () => Response.json({
  ok: true, result: { id: 123456789, type: "private", first_name: "PRIVATE" },
});

describe("Telegram read-only provisioning verification", () => {
  it("verifies bot and exact private chat without sendMessage or token disclosure", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(okBot()).mockResolvedValueOnce(okChat());
    await expect(verifyGrowthTelegramProvisioning(env, fetcher)).resolves.toEqual({
      botVerified: true, privateRecipientVerified: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(x => String(x[0]).split("/").at(-1)))
      .toEqual(["getMe", "getChat"]);
    expect(fetcher.mock.calls.every(x => x[1].redirect === "error" && x[1].method === "POST"))
      .toBe(true);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ chat_id: env.TELEGRAM_REPORT_CHAT_ID });
  });

  it("rejects an unverified token before asking Telegram about chats", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ok: false }, { status: 401 }));
    await expect(verifyGrowthTelegramProvisioning(env, fetcher))
      .rejects.toMatchObject({ code: "TOKEN_NOT_VERIFIED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong or non-private chats", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(okBot()).mockResolvedValueOnce(Response.json({
      ok: true, result: { id: -100123456789, type: "supergroup" },
    }));
    await expect(verifyGrowthTelegramProvisioning(env, fetcher))
      .rejects.toMatchObject({ code: "NOT_INTENDED_PRIVATE_CHAT" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails closed on bad config without contacting Telegram", async () => {
    const fetcher = vi.fn();
    await expect(verifyGrowthTelegramProvisioning({
      ...env, TELEGRAM_REPORT_CHAT_ID: "@channel",
    }, fetcher)).rejects.toThrow("INVALID_CONFIGURATION");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sanitizes network errors to prevent token-bearing URLs leaking", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(
      new Error("Timed out https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN),
    );
    let error: unknown;
    try { await verifyGrowthTelegramProvisioning(env, fetcher); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(TelegramProvisioningError);
    expect(String(error)).not.toContain(env.TELEGRAM_BOT_TOKEN);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("blocks bots that can be added to groups before reading recipient info", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({
      ok: true, result: { id: 123456789, is_bot: true,
        username: "SayTwistGrowthBot", can_join_groups: true },
    }));
    await expect(verifyGrowthTelegramProvisioning(env, fetcher))
      .rejects.toMatchObject({ code: "GROUP_JOINING_NOT_DISABLED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

});
