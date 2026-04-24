import OpenAI from "openai";

import { DEFAULT_MODEL } from "@/lib/constants";
import { slugify } from "@/lib/slugify";
import type { TranslatorDraft, TranslatorUpsertInput } from "@/lib/types";
import { translatorDraftSchema } from "@/lib/validators";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  return new OpenAI({ apiKey });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // continue
    }
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }

  throw new Error("No valid JSON object found in AI output.");
}

function normalizeDraft(value: TranslatorDraft): TranslatorDraft {
  return {
    ...value,
    slug: slugify(value.slug || value.name),
    modes: value.modes
      .map((mode, index) => ({
        ...mode,
        key: slugify(mode.key || mode.label),
        sortOrder: mode.sortOrder || index + 1,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    examples: value.examples
      .map((example, index) => ({
        ...example,
        sortOrder: example.sortOrder || index + 1,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function buildSystemPrompt() {
  return [
    "You are an expert product linguist and SaaS configuration architect.",
    "Generate practical, production-ready translator configurations for a style translator platform.",
    "Return JSON only, no markdown.",
    "The final draft must be directly usable in an admin create-translator form.",
    "Preserve clarity and avoid unsafe or abusive content.",
    "Ensure prompts preserve meaning and facts while transforming style.",
    "Default translator output tone should be playful, witty, and entertaining unless the brief clearly requests a different tone (for example: professional, formal, legal, academic, romantic, poetic, or corporate).",
    "Do not force category selection to Funny when the brief points to another category or use case.",
  ].join("\n");
}

function buildUserPrompt(brief: string) {
  return [
    "Create a translator configuration draft from this brief:",
    brief.trim(),
    "",
    "Use this exact JSON shape:",
    JSON.stringify(
      {
        name: "",
        slug: "",
        title: "",
        subtitle: "",
        shortDescription: "",
        sourceLabel: "",
        targetLabel: "",
        systemPrompt: "",
        promptInstructions: "",
        seoTitle: "",
        seoDescription: "",
        categorySuggestion: "",
        modes: [
          {
            key: "classic",
            label: "Classic",
            description: "",
            instruction: "",
            sortOrder: 1,
          },
        ],
        examples: [
          {
            label: "Starter",
            value: "",
            sortOrder: 1,
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Constraints:",
    "- Keep 1-4 useful modes.",
    "- Keep 0-6 examples.",
    "- Make title and subtitle clear, marketable, and specific.",
    "- Choose the best category suggestion from: Fancy, Funny, Professional, Historical, Roleplay, Casual, Social, Marketing.",
    "- Slug must be lowercase-kebab-case.",
    "- Prompts should be safe, concise, and production-ready.",
    "- Make shortDescription a richer SEO-friendly paragraph (about 140-240 characters).",
    "- shortDescription should naturally mention the translator style/name plus text translation or rewriting value and one realistic use case when relevant.",
    "- Use keywords naturally: AI translator, AI text converter, text rewriting, text translation.",
    "- SEO title and SEO description should be high quality, readable, and search-friendly without keyword stuffing.",
    "- Default systemPrompt and promptInstructions to playful/funny/witty output when the brief does not request a specific serious/professional tone.",
    "- If the brief explicitly requests another tone, honor that requested tone instead of playful humor.",
    "- Keep output plain JSON only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateTranslatorDraft(input: {
  brief: string;
  model?: string;
}) {
  const client = getClient();
  const model = input.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const response = await client.responses.create({
    model,
    temperature: 0.4,
    max_output_tokens: 2000,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: buildSystemPrompt() }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: buildUserPrompt(input.brief) }],
      },
    ],
  });

  const text = response.output_text || "";
  const parsed = extractJson(text);
  const validated = translatorDraftSchema.parse(parsed);

  return normalizeDraft(validated);
}

export function buildTranslatorDraftBriefFromRequest(input: {
  requestedName: string;
  description: string;
  exampleInput?: string | null;
  desiredStyle?: string | null;
  suggestedCategory?: string | null;
  audience?: string | null;
  notes?: string | null;
}) {
  return [
    `Translator idea: ${input.requestedName}`,
    `What it should do: ${input.description}`,
    input.exampleInput ? `Example input from requester: ${input.exampleInput}` : "",
    input.desiredStyle ? `Desired output/style direction: ${input.desiredStyle}` : "",
    input.suggestedCategory ? `Category hint: ${input.suggestedCategory}` : "",
    input.audience ? `Audience/use case: ${input.audience}` : "",
    input.notes ? `Additional notes: ${input.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function draftToTranslatorInput(params: {
  draft: TranslatorDraft;
  categoryIds: string[];
  primaryCategoryId?: string | null;
}): TranslatorUpsertInput {
  return {
    name: params.draft.name,
    slug: slugify(params.draft.slug || params.draft.name),
    title: params.draft.title,
    subtitle: params.draft.subtitle,
    shortDescription: params.draft.shortDescription,
    sourceLabel: params.draft.sourceLabel,
    targetLabel: params.draft.targetLabel,
    iconName: "",
    promptSystem: params.draft.systemPrompt,
    promptInstructions: params.draft.promptInstructions,
    seoTitle: params.draft.seoTitle || "",
    seoDescription: params.draft.seoDescription || "",
    modelOverride: "",
    isActive: false,
    isFeatured: false,
    showModeSelector: false,
    showSwap: false,
    showExamples: false,
    sortOrder: 50,
    primaryCategoryId: params.primaryCategoryId || params.categoryIds[0] || null,
    categoryIds: params.categoryIds,
    modes: params.draft.modes.map((mode, index) => ({
      ...mode,
      key: slugify(mode.key || mode.label),
      sortOrder: mode.sortOrder || index + 1,
    })),
    examples: params.draft.examples.map((example, index) => ({
      ...example,
      sortOrder: example.sortOrder || index + 1,
    })),
  };
}
