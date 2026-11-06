import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/growth/pinterest/tokens", () => ({ getValidPinterestAccessToken: mocks.token }));
vi.mock("@/lib/growth/pinterest/config", () => ({ requirePinterestConfiguration: () => ({ apiBaseUrl: "https://api.pinterest.test/v5" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { growthPinterestAccount: { updateMany: mocks.updateMany } } }));
import { createPinterestPin, PinterestAuthorizationError, PinterestCreateAmbiguousError } from "@/lib/growth/pinterest/api";
import { NonRetryableGrowthJobError, RetryableGrowthJobError } from "@/lib/growth/errors";

const input = { accountId: "account", boardId: "external-board", title: "Exact title", description: "Exact description", link: "https://saytwist.com/translators/test?pin_ref=pa_ref", imageUrl: `https://saytwist.com/generated/growth-creatives/creative-${"a".repeat(64)}.png` };
describe("Pinterest publishing adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.token.mockResolvedValue("secret-token"); });
  it("posts exactly one static image_url Pin request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "pin-1", board_id: "external-board", title: input.title, description: input.description, link: input.link }), { status: 201, headers: { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "59" } }));
    await expect(createPinterestPin({ ...input, fetchImpl: fetchMock })).resolves.toMatchObject({ data: { id: "pin-1" }, rateLimit: { limit: "60", remaining: "59" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ board_id: input.boardId, title: input.title, description: input.description, link: input.link, media_source: { source_type: "image_url", url: input.imageUrl, is_standard: true } });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer secret-token");
  });
  it("uses image_base64 PNG when approved bytes are supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "pin-base64", board_id: input.boardId,
    }), { status: 201 }));
    const imageBase64 = Buffer.from("sample-test-media").toString("base64");
    await expect(createPinterestPin({
      ...input, imageBase64, fetchImpl: fetchMock,
    })).resolves.toMatchObject({ data: { id: "pin-base64" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      board_id: input.boardId,
      title: input.title,
      description: input.description,
      link: input.link,
      media_source: {
        source_type: "image_base64",
        content_type: "image/png",
        data: imageBase64,
        is_standard: true,
      },
    });
  });

  it("rejects malformed base64 without a Pinterest API call", async () => {
    const fetchMock = vi.fn();
    await expect(createPinterestPin({
      ...input, imageBase64: "<unsafe>", fetchImpl: fetchMock,
    })).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains only sanitized Pinterest 400 code and message", async () => {
    const response = new Response(JSON.stringify({
      code: 2786,
      message: "Unable to reach the URL. access_token=private-token-value",
    }), { status: 400 });
    const error = await createPinterestPin({
      ...input, fetchImpl: vi.fn().mockResolvedValue(response),
    }).catch((value) => value);
    expect(error).toBeInstanceOf(NonRetryableGrowthJobError);
    expect(error.message).toContain("Provider code: 2786");
    expect(error.message).toContain("Unable to reach the URL");
    expect(error.message).not.toContain("private-token-value");
  });

  it("classifies rate limits, auth, validation, and ambiguous outcomes safely", async () => {
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "retry-after": "12" } })) })).rejects.toMatchObject<RetryableGrowthJobError>({ retryAfterMs: 12_000 });
    const invalidCredential = await createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 8, message: "Invalid access token." }), { status: 401 })) }).catch((error) => error);
    expect(invalidCredential).toMatchObject<PinterestAuthorizationError>({ code: "PINTEREST_INVALID_CREDENTIAL" });
    expect(invalidCredential.message).toContain("Provider code: 8");
    const insufficientScope = await createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AUTHORIZATION_FAILURE", message: "Insufficient scope boards:write. access_token=private-token-value" }), { status: 403 })) }).catch((error) => error);
    expect(insufficientScope).toMatchObject<PinterestAuthorizationError>({ code: "PINTEREST_INSUFFICIENT_SCOPES" });
    expect(insufficientScope.message).toContain("Insufficient scope boards:write");
    expect(insufficientScope.message).not.toContain("private-token-value");
    expect(mocks.updateMany).toHaveBeenCalled();
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 400 })) })).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 503 })) })).rejects.toBeInstanceOf(PinterestCreateAmbiguousError);
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockRejectedValue(new Error("timeout")) })).rejects.toBeInstanceOf(PinterestCreateAmbiguousError);
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 201 })) })).rejects.toBeInstanceOf(PinterestCreateAmbiguousError);
  });
});
