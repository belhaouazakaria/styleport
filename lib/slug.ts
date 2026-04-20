import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";

export { slugify };

export async function ensureUniqueTranslatorSlug(
  input: string,
  options?: { excludeId?: string },
): Promise<string> {
  const base = slugify(input) || "translator";
  let candidate = base;
  let counter = 2;

  while (true) {
    const existing = await prisma.translator.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing || existing.id === options?.excludeId) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

export async function ensureUniqueSlug(params: {
  desiredSlug: string;
  table: "category" | "adPlacement";
  field: "slug" | "key";
  excludeId?: string;
}) {
  const base =
    params.field === "key"
      ? params.desiredSlug
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9_\s-]/g, "")
          .replace(/\s+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 120) || "placement"
      : slugify(params.desiredSlug) || params.field;
  let candidate = base;
  let counter = 2;

  while (true) {
    const existing =
      params.table === "category"
        ? await prisma.category.findFirst({
            where: { slug: candidate },
            select: { id: true },
          })
        : await prisma.adPlacement.findFirst({
            where: { key: candidate },
            select: { id: true },
          });

    if (!existing || existing.id === params.excludeId) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}
