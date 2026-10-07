import type { CategoryOption } from "@/lib/growth/translator/contracts";
import { slugify } from "@/lib/slugify";

const CATEGORY_ALIASES: Record<string, string> = {
  fun: "funny",
  humor: "funny",
  humour: "funny",
  historic: "historical",
  professional: "professional",
  work: "professional",
  roleplaying: "roleplay",
};

export type CategoryResolution =
  | { status: "RESOLVED"; category: CategoryOption }
  | { status: "UNKNOWN" | "INACTIVE" | "AMBIGUOUS"; category: null };

export function resolveCategory(
  suggestion: string,
  categories: CategoryOption[],
): CategoryResolution {
  const raw = slugify(suggestion);
  const normalized = CATEGORY_ALIASES[raw] || raw;
  const allMatches = categories.filter(
    (category) =>
      slugify(category.slug) === normalized || slugify(category.name) === normalized,
  );
  if (allMatches.length > 1) return { status: "AMBIGUOUS", category: null };
  if (allMatches.length === 1) {
    const category = allMatches[0];
    if (!category.isActive || category.archivedAt) {
      return { status: "INACTIVE", category: null };
    }
    return { status: "RESOLVED", category };
  }
  return { status: "UNKNOWN", category: null };
}

