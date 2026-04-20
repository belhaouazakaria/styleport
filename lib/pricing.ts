export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4.1": { inputPer1M: 2, outputPer1M: 8 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-5": { inputPer1M: 5, outputPer1M: 15 },
  "gpt-5-mini": { inputPer1M: 1, outputPer1M: 3 },
};

export function estimateCost(params: {
  model: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
}): number {
  const pricing = MODEL_PRICING[params.model];
  if (!pricing) {
    return 0;
  }

  const prompt = params.promptTokens || 0;
  const completion = params.completionTokens || 0;

  if (!prompt && !completion && params.totalTokens) {
    return Number(((params.totalTokens * pricing.inputPer1M) / 1_000_000).toFixed(8));
  }

  const inputCost = (prompt * pricing.inputPer1M) / 1_000_000;
  const outputCost = (completion * pricing.outputPer1M) / 1_000_000;

  return Number((inputCost + outputCost).toFixed(8));
}
