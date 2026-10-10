import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/growth/pinterest/tokens", () => ({ getValidPinterestAccessToken: mocks.token }));
vi.mock("@/lib/growth/pinterest/config", () => ({ requirePinterestConfiguration: () => ({ apiBaseUrl: "https://api.pinterest.test/v5" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { growthPinterestAccount: { updateMany: mocks.updateMany } } }));
import { createPinterestPin, PinterestCreateAmbiguousError } from "@/lib/growth/pinterest/api";
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
  it("classifies rate limits, auth, validation, and ambiguous outcomes safely", async () => {
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "retry-after": "12" } })) })).rejects.toMatchObject<RetryableGrowthJobError>({ retryAfterMs: 12_000 });
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 401 })) })).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    expect(mocks.updateMany).toHaveBeenCalled();
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 400 })) })).rejects.toBeInstanceOf(NonRetryableGrowthJobError);
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 503 })) })).rejects.toBeInstanceOf(PinterestCreateAmbiguousError);
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockRejectedValue(new Error("timeout")) })).rejects.toBeInstanceOf(PinterestCreateAmbiguousError);
    await expect(createPinterestPin({ ...input, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 201 })) })).rejects.toBeInstanceOf(PinterestCreateAmbiguousError);
  });
});
