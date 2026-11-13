import { describe, it, expect } from "vitest";
import { approvePinSchema } from "@/lib/growth/publishing/contracts";
import { growthSettingsSchema } from "@/lib/growth/contracts";
import { pinDestinationUrl, domainForPinPath } from "@/lib/growth/publishing/destinations";
import { pinterestPublicationUrlsMatch } from "@/lib/growth/publishing/snapshot";
import {
  getPrivatePinReviewConfig, secretMatches,
  parsePrivatePinCallback, pinReviewButtons,
} from "@/lib/growth/publishing/telegram-pin-review";

const baseUrl = new URL("https://saytwist.com");
const fullLink = "https://saytwist.com/translators/jester-translator?utm_source=pinterest&utm_medium=organic&utm_campaign=saytwist&utm_content=x&pin_ref=p_public";

describe("Pinterest destination defaults and explicit overrides", () => {
  it("retains canonical hostname unless a legacy Translator path is eligible", () => {
    expect(pinDestinationUrl(fullLink, "saytwist.com", baseUrl)).toBe(fullLink);
    expect(pinDestinationUrl(fullLink, "translator.whattypeof.com", baseUrl))
      .toBe(fullLink.replace("saytwist.com", "translator.whattypeof.com"));
    expect(domainForPinPath("translator.whattypeof.com", "/ideas/quick-check")).toBe("saytwist.com");
    expect(pinDestinationUrl("https://saytwist.com/ideas/quick-check", "translator.whattypeof.com", baseUrl))
      .toBe("https://saytwist.com/ideas/quick-check");
  });
  it("forbids unapproved hosts, credentials, fragments and route substitution", () => {
    for (const malicious of [
      "https://attacker.com/translators/jester-translator",
      "http://saytwist.com/translators/jester-translator",
      "https://saytwist.com@attacker.com/translators/jester-translator",
      "https://saytwist.com/translators/jester-translator#fragment",
    ]) {
      expect(() => pinDestinationUrl(malicious, "translator.whattypeof.com", baseUrl)).toThrow();
    }
  });
  it("checks the exact legacy host, immutable path and tracking query", () => {
    const legacy = pinDestinationUrl(fullLink, "translator.whattypeof.com", baseUrl);
    expect(pinterestPublicationUrlsMatch(legacy, legacy, baseUrl)).toBe(true);
    expect(pinterestPublicationUrlsMatch(fullLink, legacy, baseUrl)).toBe(false);
    expect(pinterestPublicationUrlsMatch(legacy.replace("p_public", "p_other"), legacy, baseUrl)).toBe(false);
    expect(pinterestPublicationUrlsMatch("https://translator.whattypeof.com/ideas/test?utm_source=pinterest&utm_medium=organic&utm_campaign=x&utm_content=x&pin_ref=p", "https://translator.whattypeof.com/ideas/test?utm_source=pinterest&utm_medium=organic&utm_campaign=x&utm_content=x&pin_ref=p", baseUrl)).toBe(false);
  });
  it("allows only approved destination domains in the admin request", () => {
    const base = { candidateId: "candidate", accountId: "account", boardId: "board",
      scheduledAt: "2026-11-14T12:00:00.000Z", confirmation: true };
    expect(approvePinSchema.safeParse({ ...base, destinationDomain: "saytwist.com" }).success).toBe(true);
    expect(approvePinSchema.safeParse({ ...base, destinationDomain: "translator.whattypeof.com" }).success).toBe(true);
    expect(approvePinSchema.safeParse({ ...base, destinationDomain: "evil.com" }).success).toBe(false);
  });
  it("keeps the website setting optional for older trusted callers", () => {
    expect(growthSettingsSchema.shape.defaultPinterestDestinationDomain.parse(undefined)).toBe("saytwist.com");
    expect(growthSettingsSchema.shape.defaultPinterestDestinationDomain.safeParse("example.com").success).toBe(false);
  });
});

describe("private Telegram Pin review protocol", () => {
  const config = {
    GROWTH_TELEGRAM_PIN_APPROVALS_ENABLED: "true",
    TELEGRAM_BOT_TOKEN: "123456:" + "A".repeat(35),
    TELEGRAM_REPORT_CHAT_ID: "1234567",
    GROWTH_TELEGRAM_PIN_WEBHOOK_SECRET: "S".repeat(48),
  };
  const message = { callback_query: { id: "abc", from: { id: 1234567 },
    data: "p:ck12345678901234:s",
    message: { message_id: 456, chat: { type: "private", id: 1234567 } } } };
  it("requires independent enablement, bot, private recipient and webhook secret", () => {
    expect(getPrivatePinReviewConfig(config).privateChatId).toBe("1234567");
    expect(() => getPrivatePinReviewConfig({ ...config, GROWTH_TELEGRAM_PIN_APPROVALS_ENABLED: "false" })).toThrow();
    expect(() => getPrivatePinReviewConfig({ ...config, TELEGRAM_REPORT_CHAT_ID: "-1001234567" })).toThrow();
    expect(() => getPrivatePinReviewConfig({ ...config, GROWTH_TELEGRAM_PIN_WEBHOOK_SECRET: "weak" })).toThrow();
  });
  it("performs a constant-time comparison for equal length webhook secrets", () => {
    expect(secretMatches("S".repeat(48), "S".repeat(48))).toBe(true);
    expect(secretMatches("T".repeat(48), "S".repeat(48))).toBe(false);
    expect(secretMatches(null, "S".repeat(48))).toBe(false);
  });
  it("accepts only matching private chat/user, pin ID and exact callback message", () => {
    expect(parsePrivatePinCallback(message, "1234567")).toEqual({
      id: "ck12345678901234", action: "s", messageId: 456, callbackId: "abc",
    });
    expect(parsePrivatePinCallback({ callback_query: { ...message.callback_query, from: { id: 1 } } }, "1234567")).toBeNull();
    expect(parsePrivatePinCallback({ callback_query: { ...message.callback_query, message: {
      ...message.callback_query.message, chat: { type: "group", id: 1234567 },
    } } }, "1234567")).toBeNull();
    expect(parsePrivatePinCallback({ callback_query: { ...message.callback_query, data: "p:ck12345678901234:execute" } }, "1234567")).toBeNull();
  });
  it("offers only per-Pin approval, both translator hosts and rejection", () => {
    const buttons = pinReviewButtons("ck12345678901234", "/translators/jester-translator", "translator.whattypeof.com");
    const options = buttons.inline_keyboard.flat().map(x => x.callback_data);
    expect(options).toEqual(["p:ck12345678901234:l", "p:ck12345678901234:s", "p:ck12345678901234:r"]);
    const ideas = pinReviewButtons("ck12345678901234", "/ideas/new", "translator.whattypeof.com");
    expect(ideas.inline_keyboard.flat().map(x => x.callback_data)).toEqual(["p:ck12345678901234:s", "p:ck12345678901234:r"]);
  });
});
