import { GrowthAiOperationKind } from "@prisma/client";
import { GrowthBudgetBlockedError, reserveGrowthAiBudget } from "@/lib/growth/economics/reservations";

/**
 * Official pricing on 2026-10-24 lists gpt-image-2 medium 1024x1536
 * output near $0.041 plus text input. The 30-cent envelope is a conservative
 * max reserved cost for the fixed <=7000-byte text-only prompt, NOT actual spend.
 * Source: https://developers.openai.com/api/docs/guides/image-generation
 * Unknown provider models, larger prompts and other shapes fail closed.
 */
export const GROWTH_IMAGE_PRICE_VERSION = "openai-image2-20261024-v1";
export const GROWTH_IMAGE_RESERVE_CENTS = 30;

export async function reserveGrowthImageAttempt(input: {
  jobId: string; model: string; prompt: string; size: string; quality: string;
}) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.jobId))
    throw new GrowthBudgetBlockedError("INVALID_IMAGE_JOB_ID");
  if (input.model !== "gpt-image-2" || input.size !== "1024x1536" ||
      input.quality !== "medium" || !input.prompt.trim() ||
      Buffer.byteLength(input.prompt, "utf8") > 7000)
    throw new GrowthBudgetBlockedError("UNVERIFIED_IMAGE_PRICE");

  const result = await reserveGrowthAiBudget({
    requestKey: "growth:creative:" + input.jobId + ":image-1",
    jobId: input.jobId, kind: GrowthAiOperationKind.IMAGE,
    provider: "OPENAI", model: input.model,
    priceCeilingCents: GROWTH_IMAGE_RESERVE_CENTS,
    pricingVersion: GROWTH_IMAGE_PRICE_VERSION,
  });
  if (!result.newlyReserved) throw new GrowthBudgetBlockedError("IMAGE_REQUEST_ALREADY_ATTEMPTED");
  return result.reservation.id;
}
