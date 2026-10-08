import { slugify } from "@/lib/slugify";

export interface IdeaCategoryOption {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  archivedAt: Date | null;
}

export function resolveIdeaCategory(suggestion: string, categories: IdeaCategoryOption[]) {
  const key = slugify(suggestion);
  const matches = categories.filter((item) => slugify(item.slug) === key || slugify(item.name) === key);
  if (matches.length > 1) return { status: "AMBIGUOUS" as const, category: null };
  if (!matches.length) return { status: "UNKNOWN" as const, category: null };
  if (!matches[0].isActive || matches[0].archivedAt) return { status: "INACTIVE" as const, category: null };
  return { status: "RESOLVED" as const, category: matches[0] };
}

