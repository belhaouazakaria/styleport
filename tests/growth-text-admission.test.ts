import { GrowthAiOperationKind } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reserve: vi.fn() }));
vi.mock("@/lib/growth/economics/reservations", () => ({
  GrowthBudgetBlockedError: class extends Error { constructor(public reason: string) { super(reason); } },
  reserveGrowthAiBudget: mocks.reserve,
}));
import { reserveGrowthTextAttempt, GROWTH_TEXT_RESERVE_CENTS, GROWTH_TEXT_PRICE_VERSION } from "@/lib/growth/economics/text-admission";

const input = { decisionId: "dec-1", contentKind: "translator" as const, attempt: 0 as const, model: "gpt-4.1-mini", systemPrompt: "Generate", userPrompt: "Translator", maxOutputTokens: 2600 };
describe("Once-only Growth text admission", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.reserve.mockResolvedValue({ newlyReserved: true, reservation: { id: "r1" } }); });
  it("prices and reserves exactly one bounded text attempt", async () => {
    await expect(reserveGrowthTextAttempt(input)).resolves.toBe("r1");
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      requestKey: "growth:translator:dec-1:text-0", kind: GrowthAiOperationKind.TEXT,
      priceCeilingCents: GROWTH_TEXT_RESERVE_CENTS, pricingVersion: GROWTH_TEXT_PRICE_VERSION,
    }));
  });
  it("separates first and repair attempt reservations", async () => {
    await reserveGrowthTextAttempt({ ...input, attempt: 1 });
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ requestKey: "growth:translator:dec-1:text-1" }));
  });
  it("blocks unknown model/prices, enormous prompts and missing identities", async () => {
    for (const bad of [
      { decisionId: "" }, { model: "gpt-6" }, { userPrompt: "x".repeat(65537) },
      { maxOutputTokens: 4201 },
    ]) await expect(reserveGrowthTextAttempt({ ...input, ...bad })).rejects.toThrow();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("never reauthorizes a previously reserved request", async () => {
    mocks.reserve.mockResolvedValue({ newlyReserved: false, reservation: { id: "r1" } });
    await expect(reserveGrowthTextAttempt(input)).rejects.toThrow("TEXT_REQUEST_ALREADY_ATTEMPTED");
  });
});
