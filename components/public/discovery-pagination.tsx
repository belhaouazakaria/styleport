import Link from "next/link";

interface DiscoveryPaginationProps {
  page: number;
  totalPages: number;
  q?: string;
  category?: string;
}

function makeHref(page: number, q?: string, category?: string) {
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (category) search.set("category", category);
  search.set("page", String(page));

  return `/?${search.toString()}`;
}

export function DiscoveryPagination({ page, totalPages, q, category }: DiscoveryPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, page + 2);
  const pages = Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index);

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="Translator pages">
      <Link
        href={makeHref(Math.max(1, page - 1), q, category)}
        className={`rounded-lg border px-3 py-2 text-sm ${
          page === 1
            ? "pointer-events-none border-border bg-muted-surface text-muted-ink"
            : "border-border bg-surface text-ink hover:border-brand-300"
        }`}
      >
        Previous
      </Link>
      {pages.map((item) => (
        <Link
          key={item}
          href={makeHref(item, q, category)}
          className={`min-w-10 rounded-lg border px-3 py-2 text-center text-sm font-medium ${
            item === page
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-border bg-surface text-ink hover:border-brand-300"
          }`}
        >
          {item}
        </Link>
      ))}
      <Link
        href={makeHref(Math.min(totalPages, page + 1), q, category)}
        className={`rounded-lg border px-3 py-2 text-sm ${
          page === totalPages
            ? "pointer-events-none border-border bg-muted-surface text-muted-ink"
            : "border-border bg-surface text-ink hover:border-brand-300"
        }`}
      >
        Next
      </Link>
    </nav>
  );
}
