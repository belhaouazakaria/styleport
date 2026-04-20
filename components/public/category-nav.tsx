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
    <div className="flex flex-wrap gap-2">
      <Link
        href={buildHref({ q })}
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
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
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
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
