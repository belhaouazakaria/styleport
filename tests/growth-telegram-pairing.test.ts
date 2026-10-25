import { describe, expect, it, vi } from "vitest";
import { discoverGrowthTelegramPrivateChat, findMatchedPrivateChatId } from "@/lib/growth/reporting/pairing";

const nonce = "1234abcd5678ef901234abcd";
const botToken = "123456789:" + "A".repeat(35);
function privateUpdate(id: number, text: string, type = "private") {
  return { update_id: 1, message: { text, chat: { id, type }, from: { id } } };
}

describe("Read-only Telegram private recipient pairing", () => {
  it("selects ONLY a matching /start nonce from a private Telegram chat", () => {
    const updates = [
      privateUpdate(345678, "/start bad"),
      privateUpdate(-100123, "/start " + nonce, "group"),
      privateUpdate(345678, "/start " + nonce),
    ];
    expect(findMatchedPrivateChatId(updates, nonce)).toBe("345678");
  });

  it("fails closed for invalid nonce, missing recipient and multiple matching private chats", () => {
    expect(() => findMatchedPrivateChatId([], "abc")).toThrow("INVALID_PAIRING_CODE");
    expect(() => findMatchedPrivateChatId([], nonce)).toThrow("PAIRING_MESSAGE_NOT_FOUND");
    expect(() => findMatchedPrivateChatId([
      privateUpdate(345678, "/start " + nonce),
      privateUpdate(987654, "/start " + nonce),
    ], nonce)).toThrow("AMBIGUOUS_PRIVATE_RECIPIENT");
  });

  it("makes one no-offset getUpdates POST, never sends and never exposes credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      ok: true, result: [privateUpdate(345678, "/start " + nonce)],
    }));
    await expect(discoverGrowthTelegramPrivateChat({
      TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_REPORT_PAIRING_CODE: nonce,
    }, fetcher)).resolves.toBe("345678");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot" + botToken + "/getUpdates");
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body)).toEqual({
      limit: 100, timeout: 0, allowed_updates: ["message"],
    });
  });

  it("never leaks token-bearing network errors", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("URL contains: " + botToken));
    let err: unknown;
    try {
      await discoverGrowthTelegramPrivateChat({
        TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_REPORT_PAIRING_CODE: nonce,
      }, fetcher);
    } catch (e) { err = e; }
    expect(String(err)).not.toContain(botToken);
    expect(String(err)).toContain("PAIRING_REQUEST_FAILED");
  });
});
