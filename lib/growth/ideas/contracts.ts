import { z } from "zod";

import {
  IDEA_AUTOPILOT_VERSION,
  MAX_IDEA_BLOCKS,
  MAX_IDEA_LIST_ITEMS,
} from "@/lib/growth/ideas/constants";

const text = (max: number) => z.string().trim().min(1).max(max);

export const ideaListItemSchema = z.object({
  text: text(500),
  context: text(400).optional(),
  note: text(400).optional(),
}).strict();

export const ideaExampleItemSchema = z.object({
  original: text(400).optional(),
  suggestion: text(500),
  explanation: text(500).optional(),
}).strict();

const introBlockSchema = z.object({ type: z.literal("INTRO"), text: text(1200) }).strict();
const paragraphBlockSchema = z.object({ type: z.literal("PARAGRAPH"), text: text(1600) }).strict();
const headingBlockSchema = z.object({ type: z.literal("HEADING"), level: z.union([z.literal(2), z.literal(3)]), text: text(160) }).strict();
const ideaListBlockSchema = z.object({ type: z.literal("IDEA_LIST"), items: z.array(ideaListItemSchema).min(1).max(MAX_IDEA_LIST_ITEMS) }).strict();
const exampleListBlockSchema = z.object({ type: z.literal("EXAMPLE_LIST"), items: z.array(ideaExampleItemSchema).min(1).max(MAX_IDEA_LIST_ITEMS) }).strict();
const tipListBlockSchema = z.object({ type: z.literal("TIP_LIST"), items: z.array(text(500)).min(1).max(MAX_IDEA_LIST_ITEMS) }).strict();
const calloutBlockSchema = z.object({ type: z.literal("CALLOUT"), heading: text(160).optional(), text: text(800) }).strict();

export const generatedIdeaBlockSchema = z.discriminatedUnion("type", [
  introBlockSchema,
  paragraphBlockSchema,
  headingBlockSchema,
  ideaListBlockSchema,
  exampleListBlockSchema,
  tipListBlockSchema,
  calloutBlockSchema,
  z.object({ type: z.literal("TRANSLATOR_CTA"), translatorSlug: text(80), heading: text(160), body: text(500), buttonLabel: text(80) }).strict(),
  z.object({ type: z.literal("EMBEDDED_TRANSLATOR"), translatorSlug: text(80), heading: text(160), helperText: text(400) }).strict(),
]);

export const ideaBlockSchema = z.discriminatedUnion("type", [
  introBlockSchema,
  paragraphBlockSchema,
  headingBlockSchema,
  ideaListBlockSchema,
  exampleListBlockSchema,
  tipListBlockSchema,
  calloutBlockSchema,
  z.object({ type: z.literal("TRANSLATOR_CTA"), translatorId: text(64), heading: text(160), body: text(500), buttonLabel: text(80) }).strict(),
  z.object({ type: z.literal("EMBEDDED_TRANSLATOR"), translatorId: text(64), heading: text(160), helperText: text(400) }).strict(),
]);

export const generatedIdeaCandidateSchema = z.object({
  title: text(140),
  slug: text(80),
  categorySuggestion: text(120),
  excerpt: text(320),
  seoTitle: text(70),
  seoDescription: text(170),
  blocks: z.array(generatedIdeaBlockSchema).min(3).max(MAX_IDEA_BLOCKS),
}).strict();

export const resolvedIdeaCandidateSchema = z.object({
  title: text(140),
  slug: text(80),
  categoryId: text(64),
  excerpt: text(320),
  seoTitle: text(70),
  seoDescription: text(170),
  blocks: z.array(ideaBlockSchema).min(3).max(MAX_IDEA_BLOCKS),
}).strict();

export type GeneratedIdeaCandidate = z.infer<typeof generatedIdeaCandidateSchema>;
export type ResolvedIdeaCandidate = z.infer<typeof resolvedIdeaCandidateSchema>;
export type IdeaBlock = z.infer<typeof ideaBlockSchema>;

export const ideaDecisionJobPayloadSchema = z.object({
  opportunityId: z.string().min(1).max(64),
  decisionModelVersion: z.literal(IDEA_AUTOPILOT_VERSION),
}).strict();

export const ideaExecutionJobPayloadSchema = z.object({
  decisionId: z.string().min(1).max(64),
}).strict();

export const ideaRollbackRequestSchema = z.object({
  targetVersionId: z.string().min(1).max(64),
  expectedCurrentChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const ideaArchiveRequestSchema = z.object({
  expectedCurrentChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
