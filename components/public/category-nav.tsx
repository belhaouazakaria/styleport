import Link from "next/link";

interface CategoryNavProps {
  categories: Array<{ id: string; name: string; slug: string }>;
  activeCategory?: string;
  q?: string;
}

function buildHref(params: { category?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  search.set("page", "1");

  const query = search.toString();
  return query ? `/?${query}` : "/";
}

export function CategoryNav({ categories, activeCategory, q }: CategoryNavProps) {
  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 scrollbar-thin sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Translator categories">
      <Link
        href={buildHref({ q })}
        className={`inline-flex h-11 shrink-0 snap-start items-center rounded-full border px-4 text-sm font-bold transition ${
          !activeCategory
            ? "border-brand-500 bg-brand-500 text-white"
            : "border-border bg-surface text-ink hover:border-brand-300"
        }`}
      >
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={buildHref({ category: category.slug, q })}
          className={`inline-flex h-11 shrink-0 snap-start items-center rounded-full border px-4 text-sm font-bold transition ${
            activeCategory === category.slug
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-border bg-surface text-ink hover:border-brand-300"
          }`}
        >
          {category.name}
        </Link>
      ))}
    </div>
  );
}
