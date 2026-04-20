export const GLOBAL_STYLE_GUARDRAILS = [
  "Preserve names, facts, and semantic intent.",
  "Do not invent new content.",
  "Keep output plain text only.",
  "Avoid unnecessary verbosity.",
];

export function buildGlobalSystemPrompt(customSystem: string): string {
  return ["You are an expert stylistic English rewriter.", ...GLOBAL_STYLE_GUARDRAILS, customSystem]
    .filter(Boolean)
    .join("\n");
}
