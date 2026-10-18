import { describe, expect, it, vi } from "vitest";
import {
  getOpenWaReportSettings,
  OpenWaReportError,
  submitOpenWaDailyReport,
  type OpenWaReportSettings,
} from "@/lib/growth/reporting/openwa";

const config: OpenWaReportSettings = {
  enabled: true,
  baseUrl: "http://127.0.0.1:8080",
  apiKey: "a-very-long-openwa-api-key-for-the-vps",
  recipientChatId: "213555123456@c.us",
};

function ready() {
  return Response.json({ connected: true, session: { ready: true } });
}
function accepted() {
  return Response.json({ success: true, data: "sent-message-id" });
}

describe("OpenWA private daily Growth reporting", () => {
  it("defaults to disabled and never sends without explicit opt-in", async () => {
    const fetcher = vi.fn();
    await expect(submitOpenWaDailyReport("Daily digest", { ...config, enabled: false }, fetcher))
      .rejects.toMatchObject({ code: "DISABLED", outcome: "NOT_SENT" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires a local listener, long key, and a single E.164 recipient chat", () => {
    for (const env of [
      { ...config, baseUrl: "http://127.0.0.1.evil.com:8080" },
      { ...config, baseUrl: "http://localhost:8080" },
      { ...config, baseUrl: "http://127.0.0.1:8080/api" },
      { ...config, baseUrl: "http://127.0.0.1:8080@evil.com:8080" },
      { ...config, apiKey: "123" },
      { ...config, recipientChatId: "+213555123456@c.us" },
      { ...config, recipientChatId: "12345@g.us" },
    ]) {
      expect(() => getOpenWaReportSettings({
        OPENWA_REPORTS_ENABLED: "true",
        OPENWA_API_URL: env.baseUrl,
        OPENWA_API_KEY: env.apiKey,
        OPENWA_REPORT_RECIPIENT: env.recipientChatId,
      })).toThrow(OpenWaReportError);
    }
  });

  it("does not send until WhatsApp itself is ready", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ connected: true, session: { ready: false } }),
    );
    await expect(submitOpenWaDailyReport("Digest", config, fetcher))
      .rejects.toMatchObject({ code: "SESSION_NOT_READY", outcome: "NOT_SENT" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends once with protected HTTP API and records submission, not delivery", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ready()).mockResolvedValueOnce(accepted());
    await expect(submitOpenWaDailyReport("SayTwist Growth report", config, fetcher))
      .resolves.toEqual({ submitted: true, messageId: "sent-message-id" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe("http://127.0.0.1:8080/api/messages/sendText");
    const request = fetcher.mock.calls[1][1];
    expect(request.headers["X-API-Key"]).toBe(config.apiKey);
    expect(JSON.parse(request.body)).toEqual({
      to: config.recipientChatId, content: "SayTwist Growth report", options: {},
    });
  });

  it("never retries a timed-out send whose outcome is unknown", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ready()).mockRejectedValueOnce(new Error("timeout"));
    await expect(submitOpenWaDailyReport("Digest", config, fetcher))
      .rejects.toMatchObject({ code: "SUBMISSION_OUTCOME_UNKNOWN", outcome: "UNKNOWN" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed API responses as unknown outcomes without retrying", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(ready()).mockResolvedValueOnce(
      Response.json({ success: true, data: null }),
    );
    await expect(submitOpenWaDailyReport("Digest", config, fetcher))
      .rejects.toMatchObject({ outcome: "UNKNOWN" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refuses unbounded messages before touching the API", async () => {
    const fetcher = vi.fn();
    await expect(submitOpenWaDailyReport("x".repeat(3501), config, fetcher))
      .rejects.toMatchObject({ code: "INVALID_MESSAGE", outcome: "NOT_SENT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
