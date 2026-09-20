import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type EditorialStatus = "INCOMPLETE" | "NEEDS_REVIEW" | "READY";

export interface AdminTranslatorFilters {
  q?: string;
  status?: "all" | "active" | "inactive" | "archived";
  featured?: "all" | "featured" | "non-featured";
  category?: string;
  editorialStatus?: "all" | "incomplete" | "needs-review" | "ready";
  content?: "about" | "examples" | "faq" | "tips" | "difference";
  indexing?: "all" | "indexable" | "noindex";
  sort?: "updated" | "newest" | "name" | "editorial" | "word-count" | "examples" | "faq";
  page?: number;
  pageSize?: number;
}

interface EditorialReadinessInput {
  content?: { about: string | null; whatItDoes: string | null; differenceDescription: string | null } | null;
  lists: Array<{ kind: string; content: string }>;
  examples: Array<{ originalText: string; transformedText: string }>;
  faqs: Array<{ question: string; answer: string }>;
}

function normalizedEditorialText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function hasDistinctValues(values: Array<string | null | undefined>) {
  const normalized = values.map(normalizedEditorialText).filter(Boolean);
  return normalized.length === new Set(normalized).size;
}

export function getEditorialReadiness(input: EditorialReadinessInput): {
  status: EditorialStatus;
  wordCount: number;
  completionPercent: number;
  missing: string[];
} {
  const lists = input.lists.filter((item) => normalizedEditorialText(item.content));
  const bestUses = lists.filter((item) => item.kind === "BEST_USE");
  const howToUse = lists.filter((item) => item.kind === "HOW_TO_USE");
  const tips = lists.filter((item) => item.kind === "TIP");
  const coreValues = [input.content?.about, input.content?.whatItDoes, input.content?.differenceDescription];
  const coreLabels = ["About", "What it does", "Difference description"];
  const corePresent = coreValues.map((value) => normalizedEditorialText(value).length >= 40);
  const hasCore = corePresent.every(Boolean);
  const hasMeaningfulLists = [...bestUses, ...howToUse, ...tips].every((item) => normalizedEditorialText(item.content).length >= 16);
  const hasMeaningfulExamples = input.examples.length >= 3 && input.examples.every((item) => normalizedEditorialText(item.originalText).length >= 8 && normalizedEditorialText(item.transformedText).length >= 8);
  const hasMeaningfulFaqs = input.faqs.length >= 3 && input.faqs.every((item) => normalizedEditorialText(item.question).length >= 12 && normalizedEditorialText(item.answer).length >= 24);
  const allEditorialValues = [
    ...coreValues,
    ...lists.map((item) => item.content),
    ...input.examples.flatMap((item) => [item.originalText, item.transformedText]),
    ...input.faqs.flatMap((item) => [item.question, item.answer]),
  ];
  const hasNoRepeatedEditorialValues = hasDistinctValues(allEditorialValues);
  const complete = hasCore && bestUses.length >= 2 && howToUse.length >= 2 && tips.length >= 2 && hasMeaningfulLists && hasMeaningfulExamples && hasMeaningfulFaqs && hasNoRepeatedEditorialValues;
  const hasAny = allEditorialValues.some((value) => normalizedEditorialText(value));
  const wordCount = allEditorialValues.filter(Boolean).join(" ").trim().split(/\s+/).filter(Boolean).length;
  const missing = corePresent.flatMap((present, index) => (present ? [] : [coreLabels[index]]));
  if (bestUses.length < 2) missing.push("Best uses");
  if (howToUse.length < 2) missing.push("How to use");
  if (tips.length < 2) missing.push("Tips");
  if (!hasMeaningfulExamples) missing.push("Examples");
  if (!hasMeaningfulFaqs) missing.push("FAQ");
  if (!hasNoRepeatedEditorialValues && !missing.includes("Original editorial phrasing")) missing.push("Original editorial phrasing");
  const completionUnits = [...corePresent, bestUses.length >= 2, howToUse.length >= 2, tips.length >= 2, hasMeaningfulExamples, hasMeaningfulFaqs];
  return {
    status: complete ? "READY" : hasAny ? "NEEDS_REVIEW" : "INCOMPLETE",
    wordCount,
    completionPercent: Math.round((completionUnits.filter(Boolean).length / completionUnits.length) * 100),
    missing,
  };
}

export function buildAdminTranslatorWhere(filters: AdminTranslatorFilters): Prisma.TranslatorWhereInput {
  const where: Prisma.TranslatorWhereInput = {};
  if (filters.q?.trim()) {
    const query = filters.q.trim();
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
      { title: { contains: query, mode: "insensitive" } },
      { subtitle: { contains: query, mode: "insensitive" } },
      { shortDescription: { contains: query, mode: "insensitive" } },
      { categories: { some: { category: { name: { contains: query, mode: "insensitive" } } } } },
    ];
  }
  if (filters.status === "archived") where.archivedAt = { not: null };
  else if (filters.status === "active") { where.archivedAt = null; where.isActive = true; }
  else if (filters.status === "inactive") { where.archivedAt = null; where.isActive = false; }
  else where.archivedAt = null;
  if (filters.featured === "featured") where.isFeatured = true;
  if (filters.featured === "non-featured") where.isFeatured = false;
  if (filters.category) where.categories = { some: { category: { slug: filters.category } } };
  if (filters.content === "about") where.editorialContent = { OR: [{ about: null }, { about: "" }] };
  if (filters.content === "difference") where.editorialContent = { OR: [{ differenceDescription: null }, { differenceDescription: "" }] };
  if (filters.content === "examples") where.editorialExamples = { none: {} };
  if (filters.content === "faq") where.editorialFaqs = { none: {} };
  if (filters.content === "tips") where.editorialLists = { none: { kind: "TIP" } };
  return where;
}

const editorialAuditSelect = {
  id: true,
  isActive: true,
  archivedAt: true,
  editorialContent: { select: { about: true, whatItDoes: true, differenceDescription: true } },
  editorialLists: { select: { content: true, kind: true } },
  editorialExamples: { select: { originalText: true, transformedText: true } },
  editorialFaqs: { select: { question: true, answer: true } },
} as const;

export async function getAdminTranslatorIdsForBulk(filters: AdminTranslatorFilters = {}) {
  const rows = await prisma.translator.findMany({ where: buildAdminTranslatorWhere(filters), select: editorialAuditSelect });
  return rows.filter((row) => {
    const readiness = getEditorialReadiness({ content: row.editorialContent, lists: row.editorialLists, examples: row.editorialExamples, faqs: row.editorialFaqs });
    const editorialMatch = !filters.editorialStatus || filters.editorialStatus === "all" || readiness.status === (filters.editorialStatus === "needs-review" ? "NEEDS_REVIEW" : filters.editorialStatus.toUpperCase());
    const indexingMatch = !filters.indexing || filters.indexing === "all" || (filters.indexing === "indexable" ? row.isActive && !row.archivedAt && readiness.status === "READY" : !(row.isActive && !row.archivedAt && readiness.status === "READY"));
    return editorialMatch && indexingMatch;
  }).map((row) => row.id);
}
