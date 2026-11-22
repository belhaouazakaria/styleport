import { z } from "zod";

import { TEMPLATE_PHRASES } from "@/lib/editorial-distinctness";
import { generateOpenAIText } from "@/lib/openai";
import { translatorDraftSchema } from "@/lib/validators";
import type { TranslatorEditorialDraft } from "@/lib/types";

const editorialSchema = translatorDraftSchema.shape.editorial;

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first)
      return JSON.parse(trimmed.slice(first, last + 1));
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
  focus?: string;
}

function contextPrompt(context: TranslatorEditorialContext) {
  return [
    `Translator name: ${context.name}`,
    `Translator description: ${context.description}`,
    `Category: ${context.category || "Not specified"}`,
    `Tone/style: ${context.tone || context.style || "Use the configured translator behavior"}`,
    `System prompt: ${context.promptSystem}`,
    `Instructions: ${context.promptInstructions}`,
    context.existingAbout
      ? `Existing About copy (preserve it unless explicitly regenerating About): ${context.existingAbout}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSystemPrompt() {
  return [
    "You are a careful editorial writer for a translator product.",
    "Write useful, natural, translator-specific content grounded in the supplied metadata and behavior.",
    "Do not use keyword stuffing, generic SEO filler, or claims the translator cannot support.",
    "Examples must use varied source sentences that fit this translator's actual tone; do not reuse stock examples across translators.",
    "Explain where the style is a poor fit or needs extra human judgment; do not present every rewrite style as universally appropriate.",
    "Avoid generic openings such as 'In today's fast-paced world', 'Whether you're', 'unlock the power', and 'elevate your'.",
    `Never use these overused phrases or close variants: ${TEMPLATE_PHRASES.map((phrase) => `"${phrase}"`).join(", ")}.`,
    "Every sentence must be specific to this translator: name concrete vocabulary, devices, situations, or constraints it actually uses. If a sentence would fit any other translator unchanged, rewrite it.",
    "Vary sentence openings and structure across sections. Do not start the About text with 'The <name> is an AI'. Do not open the difference section with 'Unlike'.",
    "Never claim authenticity, accuracy, or native-speaker quality. For real languages and dialects, say plainly that output is AI-generated and unverified, and name what it is likely to get wrong.",
    "Do not invent facts about real people, cultures, groups, or languages. If the topic is a real person or a group, keep descriptions neutral and avoid stereotypes.",
    "Generated copy is always a draft. A human editor must verify accuracy, distinctiveness, examples, limitations, and usefulness before publication or indexing.",
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
  examples: [
    { contextTitle: "", originalText: "", transformedText: "" },
    { contextTitle: "", originalText: "", transformedText: "" },
    { contextTitle: "", originalText: "", transformedText: "" },
  ],
  faq: [
    { question: "", answer: "" },
    { question: "", answer: "" },
    { question: "", answer: "" },
  ],
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
      params.context.focus
        ? `Regenerate only the ${params.context.focus} section; make it substantially useful and specific to this translator.`
        : "",
      "Target roughly 500–900 useful words overall, but prefer concise substance over padding.",
      "Produce 3–5 distinct examples and 3–5 realistic FAQs.",
      "Use the differenceDescription to explain both what is distinctive and at least one meaningful limitation or inappropriate use.",
      "Use this exact JSON shape:",
      JSON.stringify(fullPackShape, null, 2),
    ].join("\n\n"),
    maxOutputTokens: 4500,
  });

  return editorialSchema.parse(
    extractJson(generated.text),
  ) as TranslatorEditorialDraft;
}

export async function generateAbout(
  context: TranslatorEditorialContext,
  model?: string,
) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return pack.about;
}

export async function generateExamples(
  context: TranslatorEditorialContext,
  model?: string,
) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return pack.examples;
}

export async function generateFaq(
  context: TranslatorEditorialContext,
  model?: string,
) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return pack.faq;
}

export async function generateTips(
  context: TranslatorEditorialContext,
  model?: string,
) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return pack.tips;
}

export async function generateBestUses(
  context: TranslatorEditorialContext,
  model?: string,
) {
  const pack = await generateTranslatorEditorialContent({ context, model });
  return {
    bestUses: pack.bestUses,
    howToUse: pack.howToUse,
    differenceDescription: pack.differenceDescription,
  };
}

export const editorialListKindSchema = z.enum([
  "BEST_USE",
  "HOW_TO_USE",
  "TIP",
]);
