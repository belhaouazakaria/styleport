export interface CreativeAiImageMetadata {
  provider: string;
  model: string;
  responseId?: string | null;
  imageUnits: 1;
  estimatedCost?: number | null;
}

export interface CreativeAiImageResult {
  bytes: Buffer;
  mimeType: "image/png";
  width: 1000;
  height: 1500;
  metadata: CreativeAiImageMetadata;
}

export interface CreativeAiImageProvider {
  generate(input: { headline: string; topic: string; visualTreatment: string }): Promise<CreativeAiImageResult>;
}

export function createCreativeAiImageBudget(limit = 1) {
  const boundedLimit = Math.min(1, Math.max(0, limit));
  let used = 0;
  return {
    consume() {
      if (used >= boundedLimit) throw new Error("Creative AI image limit reached for this job.");
      used += 1;
      return used;
    },
    get used() { return used; },
    get limit() { return boundedLimit; },
  };
}

