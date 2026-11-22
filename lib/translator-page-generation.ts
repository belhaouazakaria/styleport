import { z } from "zod";

import { TEMPLATE_PHRASES } from "@/lib/editorial-distinctness";
import { generateOpenAIText } from "@/lib/openai";
import { buildTranslatorPrompts } from "@/lib/prompt-builder";
import {
  PAGE_ARCHETYPES,
  missingRequiredBlocks,
  translatorPageSchema,
  type TranslatorPage,
} from "@/lib/translator-page";
import type { RuntimeTranslator, TranslatorEditorialDraft } from "@/lib/types";

export interface PageGenerationContext {
  name: string;
  slug: string;
  description: string;
  category?: string | null;
  runtime: RuntimeTranslator;
}

export interface BackTranslationCheck {
  english: string;
  target: string;
  backTranslated: string;
  overlap: number;
}

export interface PageGenerationResult {
  editorial: TranslatorEditorialDraft;
  checks: { backTranslation: BackTranslationCheck[]; lowOverlap: number };
}

/** Archetypes whose pages show a word-by-word map. Others must not carry filler glossaries. */
export const GLOSSARY_ARCHETYPES: ReadonlySet<string> = new Set(["historical", "code", "emoji", "fandom", "comprehension"]);

const designSchema = z.object({
  about: z.string().trim().min(40).max(2400),
  whatItDoes: z.string().trim().min(40).max(1800),
  differenceDescription: z.string().trim().min(40).max(1800),
  bestUses: z.array(z.string().trim().min(8).max(600)).min(3).max(6),
  howToUse: z.array(z.string().trim().min(8).max(600)).min(3).max(6),
  tips: z.array(z.string().trim().min(8).max(600)).min(3).max(6),
  faq: z.array(z.object({ question: z.string().trim().min(8).max(240), answer: z.string().trim().min(20).max(1000) })).min(3).max(5),
  exampleInputs: z.array(z.object({ contextTitle: z.string().trim().min(3).max(120), originalText: z.string().trim().min(4).max(400) })).min(4).max(5),
  page: translatorPageSchema
    .omit({ situations: true, ladder: true, script: true })
    .extend({
      situationInputs: z.array(z.object({ title: z.string().trim().min(3).max(70), input: z.string().trim().min(4).max(320), note: z.string().trim().max(220).optional() })).min(3).max(4).optional(),
      ladderInput: z.string().trim().min(4).max(320).optional(),
      script: z.object({
        name: z.string().trim().min(2).max(60),
        notes: z.array(z.string().trim().min(8).max(260)).min(2).max(5),
        englishPhrases: z.array(z.string().trim().min(2).max(120)).min(5).max(12),
      }).optional(),
    }),
});
type Design = z.infer<typeof designSchema>;

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error("No valid JSON object in page design output.");
  }
}

const ARCHETYPE_GUIDE = `Choose exactly one archetype for this translator:
- persona: a character, voice or attitude (jester, mom, sarcastic, mafia boss). Needs situationInputs (3) and ladderInput; fitCheck.
- historical: era English (Victorian, 1800s, medieval). Needs glossary (8-12 era words with modern equivalents), origin, fitCheck.
- professional: workplace or formal writing. Needs situationInputs (3), fitCheck.
- language: a real language or dialect. Needs script (name, notes about script/sounds/dialect and what the AI is likely to get wrong, 6-8 englishPhrases of everyday use), situationInputs (3), fitCheck. Never claim accuracy, authenticity or native quality.
- code: code, hacker or technical mappings. Needs glossary (mappings), fitCheck.
- emoji: emoji or symbol text. Needs glossary (word to emoji mappings) and ladderInput.
- emotion: a mood or feeling. Needs ladderInput, situationInputs (3), fitCheck.
- wordplay: a gimmick text effect (muffled, drunk, very long words). Needs ladderInput and fitCheck.
- fandom: a fictional character, game or show. Needs glossary (signature words or catchphrases), situationInputs (3), origin.
- comprehension: decodes slang, jargon or noise into plain English. Needs glossary (terms with plain meaning), situationInputs (3), fitCheck.`;

function designSystemPrompt() {
  return [
    "You design a distinctive, genuinely useful page for one text-transformation tool. You write like a sharp specialist editor, not a marketing template.",
    `Never use these overused phrases or close variants: ${TEMPLATE_PHRASES.map((p) => `"${p}"`).join(", ")}.`,
    "Every sentence must be specific to this tool: name concrete vocabulary, devices, situations and constraints it really uses. If a sentence would fit another tool unchanged, rewrite it.",
    "Every heading must be specific to this tool and read like a human wrote it for this page (for example 'Why a jester never answers plainly', not 'Best uses'). Do not reuse generic headings such as 'About this translator', 'What this twist does', 'Tips for better results', 'FAQ', 'How to use it' or 'Best uses'. Make the faq heading a natural phrase unique to the tool.",
    "Vary sentence openings and structure. Do not start About with 'The <name> is an AI'. Do not open the difference text with 'Unlike'.",
    "Never claim authenticity, accuracy, or native-speaker quality. Be honest about limits. For real languages and dialects say the output is AI-generated and unverified and name what it will likely get wrong.",
    "Do not invent facts about real people, cultures, groups or languages, and avoid stereotypes. Keep descriptions neutral and respectful.",
    "Do not use em dashes. Use commas, colons or full stops instead.",
    "seo.title must be at most 60 characters and contain the phrase a person would type into Google to find this tool plus one differentiator, never just the bare name. For a real language use the form 'English to <Language> Translator: <differentiator>'. seo.description must be 120 to 155 characters, specific and honest.",
    "Only include a glossary for historical, code, emoji, fandom or comprehension tools, and only with real term-to-term mappings (never 'Classic -> Steady phrasing'). Omit it for every other archetype. Omit any optional block you cannot fill with specific, useful content.",
    "quickFacts: 3 to 5 short label/value pairs that are true for this tool (for example Output length, Tone intensity, Best input, Not for).",
    "exampleInputs and situationInputs and ladderInput are SOURCE sentences only. Write natural, varied inputs people really paste in. Do NOT write transformed outputs: the real translator will be run on them afterwards.",
    "Return JSON only, with no markdown fences.",
  ].join("\n");
}

function designUserPrompt(context: PageGenerationContext, retryIssue?: string) {
  const modes = context.runtime.modes.map((mode) => `${mode.label}: ${mode.instruction}`).join("\n");
  const shape = {
    about: "", whatItDoes: "", differenceDescription: "",
    bestUses: ["", "", ""], howToUse: ["", "", ""], tips: ["", "", ""],
    faq: [{ question: "", answer: "" }, { question: "", answer: "" }, { question: "", answer: "" }],
    exampleInputs: [{ contextTitle: "", originalText: "" }, { contextTitle: "", originalText: "" }, { contextTitle: "", originalText: "" }, { contextTitle: "", originalText: "" }],
    page: {
      archetype: PAGE_ARCHETYPES.join(" | "),
      kicker: "",
      seo: { title: "", description: "" },
      headings: { whatItDoes: "", examples: "", about: "", bestUses: "", howToUse: "", tips: "", difference: "", faq: "" },
      quickFacts: [{ label: "", value: "" }, { label: "", value: "" }, { label: "", value: "" }],
      glossary: [{ from: "", to: "", note: "" }],
      situationInputs: [{ title: "", input: "", note: "" }],
      ladderInput: "",
      fitCheck: { goodFor: ["", ""], avoidFor: ["", ""] },
      script: { name: "", notes: ["", ""], englishPhrases: ["", "", "", "", ""] },
      origin: "",
    },
  };
  return [
    `Tool name: ${context.name}`,
    `Public description: ${context.description}`,
    `Category: ${context.category || "Not specified"}`,
    `System prompt (how it behaves): ${context.runtime.promptSystem}`,
    `Instructions: ${context.runtime.promptInstructions}`,
    `Modes:\n${modes || "(single mode)"}`,
    ARCHETYPE_GUIDE,
    "Include only the optional page blocks that the chosen archetype needs; omit the others. Provide 4 or 5 exampleInputs.",
    "Targets: about 120 to 220 words, whatItDoes 60 to 120 words, differenceDescription 70 to 140 words including at least one honest limitation.",
    retryIssue ? `Your previous attempt was rejected: ${retryIssue}. Fix exactly that.` : "",
    "Use this exact JSON shape (remove optional blocks you do not need):",
    JSON.stringify(shape, null, 2),
  ].filter(Boolean).join("\n\n");
}

/** Removes empty template rows and under-filled optional blocks the model left in its JSON. */
export function cleanDesign(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const root = raw as Record<string, unknown>;
  const page = root.page as Record<string, unknown> | undefined;
  if (page && typeof page === "object") {
    const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;
    if (Array.isArray(page.glossary)) {
      const rows = page.glossary.filter((r) => r && filled((r as { from?: unknown }).from) && filled((r as { to?: unknown }).to));
      if (rows.length >= 4) page.glossary = rows; else delete page.glossary;
    }
    if (Array.isArray(page.situationInputs)) {
      const rows = page.situationInputs.filter((r) => r && filled((r as { title?: unknown }).title) && filled((r as { input?: unknown }).input));
      if (rows.length >= 3) page.situationInputs = rows; else delete page.situationInputs;
    }
    if (!filled(page.ladderInput)) delete page.ladderInput;
    if (!filled(page.origin)) delete page.origin;
    if (!filled(page.kicker)) delete page.kicker;
    const fit = page.fitCheck as { goodFor?: unknown[]; avoidFor?: unknown[] } | undefined;
    if (fit) {
      fit.goodFor = (fit.goodFor || []).filter(filled);
      fit.avoidFor = (fit.avoidFor || []).filter(filled);
      if (fit.goodFor.length < 2 || fit.avoidFor.length < 2) delete page.fitCheck;
    }
    const script = page.script as { englishPhrases?: unknown[]; notes?: unknown[] } | undefined;
    if (script) {
      script.englishPhrases = (script.englishPhrases || []).filter(filled);
      script.notes = (script.notes || []).filter(filled);
      if (script.englishPhrases.length < 5 || script.notes.length < 2) delete page.script;
    }
  }
  return root;
}

async function runTranslator(runtime: RuntimeTranslator, text: string, modeKey: string | undefined, model?: string) {
  const { systemPrompt, userPrompt } = buildTranslatorPrompts({ translator: runtime, userText: text, modeKey });
  const result = await generateOpenAIText({ systemPrompt, userPrompt, model, maxOutputTokens: 700 });
  const out = result.text.trim();
  if (!out) throw new Error("The translator returned no output for a sample input.");
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

function wordSet(value: string) {
  return new Set(value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2));
}

export function wordOverlap(a: string, b: string) {
  const x = wordSet(a);
  const y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared += 1;
  return shared / Math.min(x.size, y.size);
}

export async function generateTranslatorPage(params: {
  context: PageGenerationContext;
  model?: string;
}): Promise<PageGenerationResult> {
  const { context, model } = params;
  const modeCount = context.runtime.modes.length;

  let design: Design | null = null;
  let issue: string | undefined;
  for (let attempt = 0; attempt < 2 && !design; attempt += 1) {
    const generated = await generateOpenAIText({
      model,
      systemPrompt: designSystemPrompt(),
      userPrompt: designUserPrompt(context, issue),
      maxOutputTokens: 7000,
    });
    try {
      const parsed = designSchema.parse(cleanDesign(extractJson(generated.text)));
      const missing = missingRequiredBlocks(
        { ...parsed.page, situations: parsed.page.situationInputs?.map((s) => ({ ...s, output: "pending" })), ladder: parsed.page.ladderInput ? { input: parsed.page.ladderInput, steps: [{ label: "a", output: "pending" }, { label: "b", output: "pending" }] } : undefined, script: parsed.page.script ? { ...parsed.page.script, phrases: parsed.page.script.englishPhrases.map((english) => ({ english, target: "pending" })) } : undefined } as TranslatorPage,
        { modeCount },
      );
      if (missing.length) throw new Error(`archetype "${parsed.page.archetype}" is missing required blocks: ${missing.join(", ")}`);
      design = parsed;
    } catch (error) {
      issue = error instanceof Error ? error.message.slice(0, 400) : "invalid JSON";
      if (attempt === 1) throw new Error(`Page design failed validation: ${issue}`);
    }
  }
  if (!design) throw new Error("Page design failed.");

  const firstMode = context.runtime.modes[0]?.key;

  // Real outputs: every example is produced by the live translator.
  const exampleOutputs = await mapLimit(design.exampleInputs, 3, (item) => runTranslator(context.runtime, item.originalText, firstMode, model));
  const situations = design.page.situationInputs
    ? await mapLimit(design.page.situationInputs, 3, async (item) => ({
        title: item.title,
        input: item.input,
        output: await runTranslator(context.runtime, item.input, firstMode, model),
        note: item.note,
      }))
    : undefined;

  let ladder: TranslatorPage["ladder"];
  if (design.page.ladderInput && modeCount >= 2) {
    const modes = context.runtime.modes.slice(0, 4);
    const outputs = await mapLimit(modes, 2, (mode) => runTranslator(context.runtime, design!.page.ladderInput!, mode.key, model));
    ladder = { input: design.page.ladderInput, steps: modes.map((mode, index) => ({ label: mode.label, output: outputs[index] })) };
  }

  let script: TranslatorPage["script"];
  const backTranslation: BackTranslationCheck[] = [];
  if (design.page.script) {
    const phrases = await mapLimit(design.page.script.englishPhrases, 3, async (english) => ({ english, target: await runTranslator(context.runtime, english, firstMode, model) }));
    // Romanization is best effort and left empty when the model is unsure.
    let romanized: string[] = phrases.map(() => "");
    try {
      const roman = await generateOpenAIText({
        model,
        systemPrompt: "You add romanization (Latin-letter pronunciation) to short phrases. If the text is already in Latin letters or you are not sure, return an empty string for it. Return a JSON array of strings only, same length and order as the input, no commentary.",
        userPrompt: JSON.stringify(phrases.map((p) => p.target)),
        maxOutputTokens: 900,
      });
      const arr = JSON.parse(roman.text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
      if (Array.isArray(arr) && arr.length === phrases.length) romanized = arr.map((v: unknown) => (typeof v === "string" ? v.slice(0, 160) : ""));
    } catch {
      // keep empty
    }
    script = {
      name: design.page.script.name,
      notes: design.page.script.notes,
      phrases: phrases.map((p, index) => ({ english: p.english, target: p.target.slice(0, 160), romanized: romanized[index] || undefined })),
    };
    // Automated sanity signal: translate each phrase back to English and compare.
    const back = await mapLimit(phrases, 3, async (p) => {
      const result = await generateOpenAIText({
        model,
        systemPrompt: "Translate the text into plain English. Output only the English translation.",
        userPrompt: p.target,
        maxOutputTokens: 200,
      });
      return { english: p.english, target: p.target, backTranslated: result.text.trim(), overlap: wordOverlap(p.english, result.text) };
    });
    backTranslation.push(...back);
  }

  const { situationInputs: _si, ladderInput: _li, script: _script, ...pageRest } = design.page;
  void _si; void _li; void _script;
  // A word map only makes sense where there are real term-to-term mappings.
  const glossary = GLOSSARY_ARCHETYPES.has(pageRest.archetype)
    ? pageRest.glossary?.filter((row) => row.from.trim().toLowerCase() !== row.to.trim().toLowerCase())
    : undefined;
  const page = translatorPageSchema.parse({ ...pageRest, glossary: glossary && glossary.length >= 4 ? glossary : undefined, situations, ladder, script });

  const editorial: TranslatorEditorialDraft = {
    about: design.about,
    whatItDoes: design.whatItDoes,
    differenceDescription: design.differenceDescription,
    bestUses: design.bestUses,
    howToUse: design.howToUse,
    tips: design.tips,
    examples: design.exampleInputs.map((item, index) => ({ contextTitle: item.contextTitle, originalText: item.originalText, transformedText: exampleOutputs[index] })),
    faq: design.faq,
    page,
  };
  return { editorial, checks: { backTranslation, lowOverlap: backTranslation.filter((b) => b.overlap < 0.25).length } };
}
