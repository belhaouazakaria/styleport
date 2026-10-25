import { GrowthAiOperationKind } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reserve: vi.fn() }));
vi.mock("@/lib/growth/economics/reservations", () => ({
  GrowthBudgetBlockedError: class extends Error { constructor(public reason: string) { super(reason); } },
  reserveGrowthAiBudget: mocks.reserve,
}));
import { reserveGrowthImageAttempt, GROWTH_IMAGE_RESERVE_CENTS, GROWTH_IMAGE_PRICE_VERSION } from "@/lib/growth/economics/image-admission";
const input = { jobId: "abc", model: "gpt-image-2", prompt: "Draw a Pin", size: "1024x1536", quality: "medium" };
describe("Bounded Growth image admission", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.reserve.mockResolvedValue({ newlyReserved: true, reservation: { id: "r1" } }); });
  it("saves an atomic conservative reservation", async () => {
    await expect(reserveGrowthImageAttempt(input)).resolves.toBe("r1");
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      requestKey: "growth:creative:abc:image-1", kind: GrowthAiOperationKind.IMAGE,
      priceCeilingCents: GROWTH_IMAGE_RESERVE_CENTS, pricingVersion: GROWTH_IMAGE_PRICE_VERSION,
    }));
  });
  it("blocks unknown prices and missing job identity without database call", async () => {
    for (const delta of [
      { model: "gpt-image-3" }, { size: "1024x1024" },
      { quality: "high" }, { prompt: "x".repeat(7001) }, { jobId: "" },
    ]) await expect(reserveGrowthImageAttempt({ ...input, ...delta })).rejects.toThrow();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("does not use an existing reservation for a second API call", async () => {
    mocks.reserve.mockResolvedValue({ newlyReserved: false, reservation: { id: "r1" } });
    await expect(reserveGrowthImageAttempt(input)).rejects.toThrow("IMAGE_REQUEST_ALREADY_ATTEMPTED");
  });
});
