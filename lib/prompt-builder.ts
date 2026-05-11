import type { RuntimeTranslator } from "@/lib/types";

export function buildTranslatorPrompts(params: {
  translator: RuntimeTranslator;
  userText: string;
  modeKey?: string;
  direction?: "forward" | "reverse";
}) {
  const { translator, userText, modeKey, direction = "forward" } = params;

  const fallbackMode = translator.modes[0] || null;
  const selectedMode = translator.showModeSelector
    ? translator.modes.find((mode) => mode.key === modeKey) || fallbackMode
    : fallbackMode;

  const systemPrompt =
    direction === "reverse"
      ? [
          "You are an expert plain-language English rewriter.",
          "Preserve names, meaning, facts, intent, and factual details.",
          "Remove stylistic persona/tone effects and rewrite into clear natural plain text.",
          "Do not add details that were not in the input.",
          "Output plain text only. Do not use markdown, bullets, or quote wrappers.",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          "You are an expert stylistic English translator.",
          "Preserve names, meaning, facts, and intent while transforming style.",
          "Output plain text only. Do not use markdown, bullets, or quote wrappers.",
          "Avoid invented content and avoid unnecessary expansion.",
          translator.promptSystem,
        ]
          .filter(Boolean)
          .join("\n");

  const userPrompt =
    direction === "reverse"
      ? [
          "Reverse translation direction.",
          "Convert from stylized/persona voice into plain natural text.",
          "Treat the following style instructions as context to remove from the input voice:",
          translator.promptInstructions,
          selectedMode ? `Mode: ${selectedMode.label}\nStyle context: ${selectedMode.instruction}` : "",
          "Input styled text:",
          userText,
        ]
          .filter(Boolean)
          .join("\n\n")
      : [
          translator.promptInstructions,
          selectedMode ? `Mode: ${selectedMode.label}\nInstruction: ${selectedMode.instruction}` : "",
          "Input text:",
          userText,
        ]
          .filter(Boolean)
          .join("\n\n");

  return {
    systemPrompt,
    userPrompt,
    resolvedModeKey: selectedMode?.key,
  };
}
