import { GrowthAiOperationKind } from "@prisma/client";
import { GrowthBudgetBlockedError, reserveGrowthAiBudget } from "@/lib/growth/economics/reservations";

/**
 * Conservative model-and-request-specific budget ceiling, NOT actual billed cost.
 * OpenAI gpt-4.1-mini standard published rate on 2026-10-24:
 * $0.40/M input tokens; $1.60/M output tokens.
 * https://developers.openai.com/api/docs/models/gpt-4.1-mini
 * Max 65536 prompt UTF-8 bytes and 4200 output tokens are well below $0.20
 * for one standard request. Other models and wider requests fail closed.
 */
export const GROWTH_TEXT_PRICE_VERSION = "openai-gpt41mini-20261024-v1";
export const GROWTH_TEXT_RESERVE_CENTS = 20;

export async function reserveGrowthTextAttempt(input: {
  decisionId: string;
  contentKind: "translator" | "idea";
  attempt: 0 | 1;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
}) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.decisionId))
    throw new GrowthBudgetBlockedError("INVALID_TEXT_DECISION_ID");
  const promptBytes = Buffer.byteLength(input.systemPrompt + input.userPrompt, "utf8");
  if (input.model !== "gpt-4.1-mini" ||
      !input.systemPrompt.trim() || !input.userPrompt.trim() ||
      promptBytes <= 0 || promptBytes > 65536 ||
      !Number.isSafeInteger(input.maxOutputTokens) ||
      input.maxOutputTokens < 1 || input.maxOutputTokens > 4200)
    throw new GrowthBudgetBlockedError("UNVERIFIED_TEXT_PRICE");

  const reserve = await reserveGrowthAiBudget({
    requestKey: "growth:" + input.contentKind + ":" + input.decisionId + ":text-" + input.attempt,
    jobId: input.decisionId, kind: GrowthAiOperationKind.TEXT,
    provider: "OPENAI", model: input.model,
    pricingVersion: GROWTH_TEXT_PRICE_VERSION,
    priceCeilingCents: GROWTH_TEXT_RESERVE_CENTS,
  });
  if (!reserve.newlyReserved) throw new GrowthBudgetBlockedError("TEXT_REQUEST_ALREADY_ATTEMPTED");
  return reserve.reservation.id;
}
