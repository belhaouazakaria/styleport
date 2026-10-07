import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  MAX_TRANSLATOR_SNAPSHOT_BYTES,
  TRANSLATOR_SNAPSHOT_VERSION,
} from "@/lib/growth/translator/constants";
import { prisma } from "@/lib/prisma";
import type { TranslatorDraft, TranslatorUpsertInput } from "@/lib/types";

export const translatorSnapshotInclude = {
  modes: { orderBy: [{ sortOrder: "asc" as const }, { key: "asc" as const }] },
  examples: { orderBy: [{ sortOrder: "asc" as const }, { label: "asc" as const }] },
  editorialContent: true,
  editorialLists: { orderBy: [{ kind: "asc" as const }, { sortOrder: "asc" as const }, { content: "asc" as const }] },
  editorialExamples: { orderBy: [{ sortOrder: "asc" as const }, { originalText: "asc" as const }] },
  editorialFaqs: { orderBy: [{ sortOrder: "asc" as const }, { question: "asc" as const }] },
  categories: {
    include: { category: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ sortOrder: "asc" as const }, { categoryId: "asc" as const }],
  },
} satisfies Prisma.TranslatorInclude;

type TranslatorWithContent = Prisma.TranslatorGetPayload<{ include: typeof translatorSnapshotInclude }>;

const sortOrderSchema = z.number().int().min(0).max(9999);
export const translatorSnapshotSchema = z.object({
  schemaVersion: z.literal(TRANSLATOR_SNAPSHOT_VERSION),
  name: z.string().min(2).max(120),
  slug: z.string().min(1).max(80),
  title: z.string().min(2).max(140),
  subtitle: z.string().min(2).max(260),
  shortDescription: z.string().min(2).max(260),
  sourceLabel: z.string().min(2).max(80),
  targetLabel: z.string().min(2).max(80),
  promptSystem: z.string().min(10).max(5000),
  promptInstructions: z.string().min(10).max(5000),
  seoTitle: z.string().max(180).nullable(),
  seoDescription: z.string().max(320).nullable(),
  primaryCategoryId: z.string().nullable(),
  categories: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string(), sortOrder: sortOrderSchema })).min(1).max(20),
  modes: z.array(z.object({ key: z.string(), label: z.string(), description: z.string().nullable(), instruction: z.string(), sortOrder: sortOrderSchema })).max(12),
  examples: z.array(z.object({ label: z.string(), value: z.string(), sortOrder: sortOrderSchema })).max(20),
  editorial: z.object({
    about: z.string().nullable(),
    whatItDoes: z.string().nullable(),
    differenceDescription: z.string().nullable(),
    lists: z.array(z.object({ kind: z.enum(["BEST_USE", "HOW_TO_USE", "TIP"]), content: z.string(), sortOrder: sortOrderSchema })).max(30),
    examples: z.array(z.object({ contextTitle: z.string().nullable(), originalText: z.string(), transformedText: z.string(), sortOrder: sortOrderSchema })).max(8),
    faq: z.array(z.object({ question: z.string(), answer: z.string(), sortOrder: sortOrderSchema })).max(8),
  }),
});

export type TranslatorSnapshot = z.infer<typeof translatorSnapshotSchema>;

export function snapshotToTranslatorInput(snapshot: TranslatorSnapshot): TranslatorUpsertInput {
  return {
    name: snapshot.name,
    slug: snapshot.slug,
    title: snapshot.title,
    subtitle: snapshot.subtitle,
    shortDescription: snapshot.shortDescription,
    sourceLabel: snapshot.sourceLabel,
    targetLabel: snapshot.targetLabel,
    iconName: "",
    promptSystem: snapshot.promptSystem,
    promptInstructions: snapshot.promptInstructions,
    seoTitle: snapshot.seoTitle || "",
    seoDescription: snapshot.seoDescription || "",
    modelOverride: "",
    isActive: false,
    isFeatured: false,
    showModeSelector: true,
    showSwap: true,
    showExamples: true,
    sortOrder: 0,
    primaryCategoryId: snapshot.primaryCategoryId,
    categoryIds: snapshot.categories.map((item) => item.id),
    modes: snapshot.modes.map((item) => ({ ...item, description: item.description || "" })),
    examples: snapshot.examples,
    editorial: {
      about: snapshot.editorial.about || "",
      whatItDoes: snapshot.editorial.whatItDoes || "",
      differenceDescription: snapshot.editorial.differenceDescription || "",
      lists: snapshot.editorial.lists,
      examples: snapshot.editorial.examples.map((item) => ({ ...item, contextTitle: item.contextTitle || "" })),
      faq: snapshot.editorial.faq,
    },
  };
}

export function snapshotToDraft(snapshot: TranslatorSnapshot): TranslatorDraft {
  return {
    name: snapshot.name,
    slug: snapshot.slug,
    title: snapshot.title,
    subtitle: snapshot.subtitle,
    shortDescription: snapshot.shortDescription,
    sourceLabel: snapshot.sourceLabel,
    targetLabel: snapshot.targetLabel,
    systemPrompt: snapshot.promptSystem,
    promptInstructions: snapshot.promptInstructions,
    seoTitle: snapshot.seoTitle || "",
    seoDescription: snapshot.seoDescription || "",
    categorySuggestion: snapshot.categories.find((item) => item.id === snapshot.primaryCategoryId)?.slug || snapshot.categories[0]?.slug || "",
    modes: snapshot.modes.map((item) => ({ ...item, description: item.description || "" })),
    examples: snapshot.examples,
    editorial: {
      about: snapshot.editorial.about || "",
      whatItDoes: snapshot.editorial.whatItDoes || "",
      differenceDescription: snapshot.editorial.differenceDescription || "",
      bestUses: snapshot.editorial.lists.filter((item) => item.kind === "BEST_USE").map((item) => item.content),
      howToUse: snapshot.editorial.lists.filter((item) => item.kind === "HOW_TO_USE").map((item) => item.content),
      tips: snapshot.editorial.lists.filter((item) => item.kind === "TIP").map((item) => item.content),
      examples: snapshot.editorial.examples.map((item) => ({ ...item, contextTitle: item.contextTitle || "" })),
      faq: snapshot.editorial.faq,
    },
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function canonicalSnapshotJson(snapshot: TranslatorSnapshot) {
  const parsed = translatorSnapshotSchema.parse(snapshot);
  const normalized: TranslatorSnapshot = {
    ...parsed,
    categories: [...parsed.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id)),
    modes: [...parsed.modes].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)),
    examples: [...parsed.examples].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label) || a.value.localeCompare(b.value)),
    editorial: {
      ...parsed.editorial,
      lists: [...parsed.editorial.lists].sort((a, b) => a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder || a.content.localeCompare(b.content)),
      examples: [...parsed.editorial.examples].sort((a, b) => a.sortOrder - b.sortOrder || a.originalText.localeCompare(b.originalText)),
      faq: [...parsed.editorial.faq].sort((a, b) => a.sortOrder - b.sortOrder || a.question.localeCompare(b.question)),
    },
  };
  return JSON.stringify(stableValue(normalized));
}

export function checksumTranslatorSnapshot(snapshot: TranslatorSnapshot) {
  return createHash("sha256").update(canonicalSnapshotJson(snapshot)).digest("hex");
}

export function assertSnapshotBound(snapshot: TranslatorSnapshot) {
  const size = Buffer.byteLength(canonicalSnapshotJson(snapshot));
  if (size > MAX_TRANSLATOR_SNAPSHOT_BYTES) {
    throw new Error(`Translator snapshot exceeds ${MAX_TRANSLATOR_SNAPSHOT_BYTES} bytes.`);
  }
  return size;
}

export function toTranslatorSnapshot(translator: TranslatorWithContent): TranslatorSnapshot {
  const snapshot: TranslatorSnapshot = {
    schemaVersion: TRANSLATOR_SNAPSHOT_VERSION,
    name: translator.name,
    slug: translator.slug,
    title: translator.title,
    subtitle: translator.subtitle,
    shortDescription: translator.shortDescription,
    sourceLabel: translator.sourceLabel,
    targetLabel: translator.targetLabel,
    promptSystem: translator.promptSystem,
    promptInstructions: translator.promptInstructions,
    seoTitle: translator.seoTitle,
    seoDescription: translator.seoDescription,
    primaryCategoryId: translator.primaryCategoryId,
    categories: translator.categories
      .map((item) => ({ ...item.category, sortOrder: item.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug)),
    modes: translator.modes
      .map((item) => ({ key: item.key, label: item.label, description: item.description, instruction: item.instruction, sortOrder: item.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)),
    examples: translator.examples
      .map((item) => ({ label: item.label, value: item.value, sortOrder: item.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
    editorial: {
      about: translator.editorialContent?.about || null,
      whatItDoes: translator.editorialContent?.whatItDoes || null,
      differenceDescription: translator.editorialContent?.differenceDescription || null,
      lists: translator.editorialLists
        .map((item) => ({ kind: item.kind, content: item.content, sortOrder: item.sortOrder }))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder || a.content.localeCompare(b.content)),
      examples: translator.editorialExamples
        .map((item) => ({ contextTitle: item.contextTitle, originalText: item.originalText, transformedText: item.transformedText, sortOrder: item.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.originalText.localeCompare(b.originalText)),
      faq: translator.editorialFaqs
        .map((item) => ({ question: item.question, answer: item.answer, sortOrder: item.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.question.localeCompare(b.question)),
    },
  };
  assertSnapshotBound(snapshot);
  return snapshot;
}

type SnapshotDb = Pick<Prisma.TransactionClient, "translator">;

export async function readTranslatorSnapshot(
  translatorId: string,
  db: SnapshotDb = prisma,
) {
  const translator = await db.translator.findUnique({
    where: { id: translatorId },
    include: translatorSnapshotInclude,
  });
  if (!translator) return null;
  const snapshot = toTranslatorSnapshot(translator);
  return { translator, snapshot, checksum: checksumTranslatorSnapshot(snapshot) };
}
