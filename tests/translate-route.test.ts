import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTranslate = vi.fn();
const mockGetRuntime = vi.fn();
const mockGetDefaultRuntime = vi.fn();
const mockCreateLog = vi.fn();
const mockMaybeRecalculateAutoFeatured = vi.fn();
const mockSettings = vi.fn();
const mockGetRequestIdentity = vi.fn();
const mockUsagePrecheck = vi.fn();
const mockEvaluateTokenCap = vi.fn();

vi.mock("@/lib/openai", () => ({
  translateWithOpenAI: (...args: unknown[]) => mockTranslate(...args),
}));

vi.mock("@/lib/usage-protection", () => ({
  getRequestIdentity: (...args: unknown[]) => mockGetRequestIdentity(...args),
  runUsageProtectionPrecheck: (...args: unknown[]) => mockUsagePrecheck(...args),
  evaluatePostSuccessTokenCap: (...args: unknown[]) => mockEvaluateTokenCap(...args),
}));

vi.mock("@/lib/data/translators", () => ({
  getRuntimeTranslatorBySlug: (...args: unknown[]) => mockGetRuntime(...args),
  getDefaultRuntimeTranslator: (...args: unknown[]) => mockGetDefaultRuntime(...args),
  createTranslationLog: (...args: unknown[]) => mockCreateLog(...args),
  maybeRecalculateAutoFeaturedTranslators: (...args: unknown[]) =>
    mockMaybeRecalculateAutoFeatured(...args),
}));

vi.mock("@/lib/settings", () => ({
  getAppSettings: (...args: unknown[]) => mockSettings(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    translator: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { POST } from "@/app/api/translate/route";

describe("POST /api/translate", () => {
  beforeEach(() => {
    mockTranslate.mockReset();
    mockGetRuntime.mockReset();
    mockGetDefaultRuntime.mockReset();
    mockCreateLog.mockReset();
    mockSettings.mockReset();
    mockGetRequestIdentity.mockReset();
    mockUsagePrecheck.mockReset();
    mockEvaluateTokenCap.mockReset();
    mockMaybeRecalculateAutoFeatured.mockReset();

    mockSettings.mockResolvedValue({ defaultModelOverride: "" });
    mockCreateLog.mockResolvedValue(undefined);
    mockGetRequestIdentity.mockReturnValue({
      ip: "127.0.0.1",
      ipHash: "abc123",
      userAgent: "test-agent",
    });
    mockUsagePrecheck.mockResolvedValue({
      blocked: false,
      dailyTokenUsage: 100,
      tokenCap: 1000,
      ipCounts: { minute: 1, hour: 1, day: 1 },
    });
    mockEvaluateTokenCap.mockResolvedValue({ triggered: false });
    mockMaybeRecalculateAutoFeatured.mockResolvedValue(undefined);
  });

  it("returns 400 for empty text", async () => {
    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 429 when per-IP quota is exceeded", async () => {
    mockGetDefaultRuntime.mockResolvedValue({
      id: "tr_1",
      slug: "regal-rewrite",
      promptSystem: "System",
      promptInstructions: "Instructions",
      modelOverride: null,
      showModeSelector: false,
      modes: [],
    });
    mockUsagePrecheck.mockResolvedValue({
      blocked: true,
      reason: "IP_MINUTE_LIMIT",
      httpStatus: 429,
      errorCode: "RATE_LIMITED",
      message: "Too many requests right now. Please try again shortly.",
      dailyTokenUsage: 100,
      tokenCap: 1000,
    });

    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("returns 503 when emergency shutdown is active", async () => {
    mockGetDefaultRuntime.mockResolvedValue({
      id: "tr_1",
      slug: "regal-rewrite",
      promptSystem: "System",
      promptInstructions: "Instructions",
      modelOverride: null,
      showModeSelector: false,
      modes: [],
    });
    mockUsagePrecheck.mockResolvedValue({
      blocked: true,
      reason: "EMERGENCY_SHUTDOWN",
      httpStatus: 503,
      errorCode: "TRANSLATION_UNAVAILABLE",
      message: "Translation is temporarily unavailable while we review system usage.",
      dailyTokenUsage: 1000,
      tokenCap: 1000,
    });

    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("TRANSLATION_UNAVAILABLE");
  });

  it("returns translated text on success", async () => {
    mockGetRuntime.mockResolvedValue({
      id: "tr_1",
      slug: "regal-rewrite",
      promptSystem: "System",
      promptInstructions: "Instructions",
      modelOverride: null,
      showModeSelector: false,
      modes: [
        {
          key: "classic-fancy",
          label: "Classic",
          instruction: "Use ornate style",
        },
      ],
    });

    mockTranslate.mockResolvedValue({
      text: "Pray tell, how fare you?",
      model: "gpt-4.1-mini",
      promptTokens: 20,
      completionTokens: 16,
      totalTokens: 36,
    });

    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "how are you", translatorSlug: "regal-rewrite" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result).toContain("Pray tell");
  });

  it("returns 404 when translator missing", async () => {
    mockGetRuntime.mockResolvedValue(null);

    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello", translatorSlug: "missing" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
