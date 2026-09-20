import { z } from "zod";

import { generateOpenAIText } from "@/lib/openai";
import { translatorDraftSchema } from "@/lib/validators";
import type { TranslatorEditorialDraft } from "@/lib/types";

const editorialSchema = translatorDraftSchema.shape.editorial;

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error("No valid JSON object found in editorial AI output.");
  }
}

export interface TranslatorEditorialContext {
  name: string;
  description: string;
  category?: string | null;
  tone?: string | null;
  style?: string | null;
  promptSystem: string;
  promptInstructions: string;
  existingAbout?: string | null;
}

function contextPrompt(context: TranslatorEditorialContext) {
  return [
    `Translator name: ${context.name}`,
    `Translator description: ${context.description}`,
    `Category: ${context.category || "Not specified"}`,
    `Tone/style: ${context.tone || context.style || "Use the configured translator behavior"}`,
    `System prompt: ${context.promptSystem}`,
    `Instructions: ${context.promptInstructions}`,
    context.existingAbout ? `Existing About copy (preserve it unless explicitly regenerating About): ${context.existingAbout}` : "",
  ].filter(Boolean).join("\n");
}

function buildSystemPrompt() {
  return [
    "You are a careful editorial writer for a translator product.",
    "Write useful, natural, translator-specific content grounded in the supplied metadata and behavior.",
    "Do not use keyword stuffing, generic SEO filler, or claims the translator cannot support.",
    "Examples must use varied source sentences that fit this translator's actual tone; do not reuse stock examples across translators.",
    "Return JSON only. Do not include markdown fences.",
  ].join("\n");
}

const fullPackShape = {
  about: "",
  whatItDoes: "",
  differenceDescription: "",
  bestUses: ["", "", ""],
  howToUse: ["", "", ""],
  tips: ["", "", ""],
  examples: [{ contextTitle: "", originalText: "", transformedText: "" }],
  faq: [{ question: "", answer: "" }],
};

export async function generateTranslatorEditorialContent(params: {
  context: TranslatorEditorialContext;
  model?: string;
}): Promise<TranslatorEditorialDraft> {
  const generated = await generateOpenAIText({
    model: params.model,
    systemPrompt: buildSystemPrompt(),
    userPrompt: [
      "Create a complete editorial content pack for this translator.",
      contextPrompt(params.context),
      "Target roughly 500–900 useful words overall, but prefer concise substance over padding.",
      "Produce 3–5 distinct examples and 3–5 realistic FAQs.",
      "Use this exact JSON shape:",
      JSON.stringify(fullPackShape, null, 2),
    ].join("\n\n"),
    maxOutputTokens: 4500,
  });

  return editorialSchema.parse(extractJson(generated.text)) as TranslatorEditorialDraft;
}

export async function generateAbout(context: TranslatorEditorialContext, model?: string) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return pack.about;
}

export async function generateExamples(context: TranslatorEditorialContext, model?: string) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return pack.examples;
}

export async function generateFaq(context: TranslatorEditorialContext, model?: string) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return pack.faq;
}

export async function generateTips(context: TranslatorEditorialContext, model?: string) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return pack.tips;
}

export async function generateBestUses(context: TranslatorEditorialContext, model?: string) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return { bestUses: pack.bestUses, howToUse: pack.howToUse, differenceDescription: pack.differenceDescription };
}

export const editorialListKindSchema = z.enum(["BEST_USE", "HOW_TO_USE", "TIP"]);
