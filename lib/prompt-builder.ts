import type { RuntimeTranslator } from "@/lib/types";

export function buildTranslatorPrompts(params: {
  translator: RuntimeTranslator;
  userText: string;
  modeKey?: string;
}) {
  const { translator, userText, modeKey } = params;

  const fallbackMode = translator.modes[0] || null;
  const selectedMode = translator.showModeSelector
    ? translator.modes.find((mode) => mode.key === modeKey) || fallbackMode
    : fallbackMode;

  const systemPrompt = [
    "You are an expert stylistic English translator.",
    "Preserve names, meaning, facts, and intent while transforming style.",
    "Output plain text only. Do not use markdown, bullets, or quote wrappers.",
    "Avoid invented content and avoid unnecessary expansion.",
    translator.promptSystem,
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = [
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
