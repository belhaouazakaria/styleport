import { describe, expect, it, vi } from "vitest";
import { getTelegramReportSettings, TelegramReportError, submitTelegramDailyReport, type TelegramReportSettings } from "@/lib/growth/reporting/telegram";

const config: TelegramReportSettings = {
  enabled: true, botToken: "123456789:" + "A".repeat(35), chatId: "123456789",
};
const accepted = () => Response.json({
  ok: true, result: { message_id: 42, chat: { id: 123456789, type: "private" } },
});

describe("Telegram private Growth report transport", () => {
  it("defaults to disabled and makes no network call", async () => {
    const fetcher = vi.fn();
    expect(getTelegramReportSettings({})).toEqual({ enabled: false, botToken: "", chatId: "" });
    await expect(submitTelegramDailyReport("Digest", { ...config, enabled: false }, fetcher))
      .rejects.toMatchObject({ code: "DISABLED", outcome: "NOT_SENT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on invalid bot token, group, multiple chat IDs and unsafe identifiers", () => {
    for (const part of [
      { botToken: "bad" }, { botToken: config.botToken + "\n" },
      { chatId: "-100123456789" }, { chatId: "@group" },
      { chatId: "123456789,987654321" }, { chatId: "000123456789" },
    ]) {
      const c = { ...config, ...part };
      let error: unknown;
      try {
        getTelegramReportSettings({
          TELEGRAM_REPORTS_ENABLED: "true", TELEGRAM_BOT_TOKEN: c.botToken,
          TELEGRAM_REPORT_CHAT_ID: c.chatId,
        });
      } catch (e) { error = e; }
      expect(error).toBeInstanceOf(TelegramReportError);
      expect(String(error)).not.toContain(c.botToken);
      expect(String(error)).not.toContain(c.chatId);
    }
  });
  it("sends exactly once via fixed HTTPS endpoint and plain-text body", async () => {
    const fetcher = vi.fn().mockResolvedValue(accepted());
    await expect(submitTelegramDailyReport("Daily digest", config, fetcher))
      .resolves.toEqual({ submitted: true, messageId: "42" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot" + config.botToken + "/sendMessage");
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
    expect(options.cache).toBe("no-store");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toEqual({
      chat_id: config.chatId, text: "Daily digest",
      link_preview_options: { is_disabled: true },
    });
    expect(options.body).not.toContain(config.botToken);
  });
  it("rejects invalid messages and invalid injected configuration without sending", async () => {
    const fetcher = vi.fn();
    await expect(submitTelegramDailyReport("", config, fetcher)).rejects.toMatchObject({ code: "INVALID_MESSAGE" });
    await expect(submitTelegramDailyReport("x".repeat(3501), config, fetcher)).rejects.toMatchObject({ code: "INVALID_MESSAGE" });
    await expect(submitTelegramDailyReport("a\u0000b", config, fetcher)).rejects.toMatchObject({ code: "INVALID_MESSAGE" });
    await expect(submitTelegramDailyReport("Digest", { ...config, chatId: "-1001234" }, fetcher))
      .rejects.toMatchObject({ code: "INVALID_CONFIGURATION" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sanitizes network exceptions and never retries unknown outcomes", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("bot" + config.botToken));
    let error: unknown;
    try { await submitTelegramDailyReport("Digest", config, fetcher); } catch (e) { error = e; }
    expect(error).toMatchObject({ outcome: "UNKNOWN", code: "SUBMISSION_OUTCOME_UNKNOWN" });
    expect(String(error)).not.toContain(config.botToken);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["rate limit", Response.json({ ok: false }, { status: 429 }), "RATE_LIMITED_OUTCOME_UNKNOWN"],
    ["unauthorized", Response.json({ ok: false }, { status: 401 }), "SUBMISSION_NOT_CONFIRMED"],
    ["wrong private chat", Response.json({ ok: true, result: { message_id: 42, chat: { id: 999, type: "private" } } }), "SUBMISSION_NOT_CONFIRMED"],
    ["group chat", Response.json({ ok: true, result: { message_id: 42, chat: { id: 123456789, type: "group" } } }), "SUBMISSION_NOT_CONFIRMED"],
    ["missing message id", Response.json({ ok: true, result: { chat: { id: 123456789, type: "private" } } }), "SUBMISSION_NOT_CONFIRMED"],
    ["invalid json", new Response("not-json"), "SUBMISSION_OUTCOME_UNKNOWN"],
  ])("fails closed on %s without retry", async (_label, response, code) => {
    const fetcher = vi.fn().mockResolvedValue(response);
    await expect(submitTelegramDailyReport("Digest", config, fetcher))
      .rejects.toMatchObject({ outcome: "UNKNOWN", code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
