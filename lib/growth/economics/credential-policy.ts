import { getServerEnv } from "@/lib/env";

/**
 * Paid Growth operations MUST use an independent project-scoped OpenAI key.
 * No fallback to OPENAI_API_KEY (normal translation/editorial traffic).
 * Configuration errors expose no values and block BEFORE budget reservation.
 */
export class GrowthOpenAiCredentialsError extends Error {
  constructor(readonly code: string) {
    super("Growth OpenAI project credentials: " + code);
    this.name = "GrowthOpenAiCredentialsError";
  }
}

export function getGrowthOpenAiCredentials(
  source: { GROWTH_OPENAI_API_KEY?: string; GROWTH_OPENAI_PROJECT_ID?: string;
            OPENAI_API_KEY?: string } = getServerEnv(),
): { apiKey: string; project: string } {
  const key = source.GROWTH_OPENAI_API_KEY ?? "";
  const project = source.GROWTH_OPENAI_PROJECT_ID ?? "";
  if (!/^sk-[A-Za-z0-9_-]{12,}$/.test(key) ||
      !/^proj_[A-Za-z0-9_-]{3,128}$/.test(project) ||
      key === source.OPENAI_API_KEY) {
    throw new GrowthOpenAiCredentialsError("MISSING_OR_UNISOLATED_GROWTH_PROJECT");
  }
  return { apiKey: key, project };
}
