import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";

import type { PublicTranslator } from "@/lib/types";

interface RelatedTranslatorsProps {
  translators: PublicTranslator[];
}

const accents = [
  "bg-brand-100 text-brand-800",
  "bg-[#fff0c7] text-[#8a5b00]",
  "bg-supporting-100 text-supporting-800",
];

export function RelatedTranslators({ translators }: RelatedTranslatorsProps) {
  return (
    <div className="-mx-1 grid gap-3 px-1 sm:grid-cols-2 xl:grid-cols-3">
      {translators.map((translator, index) => (
        <article
          key={translator.id}
          className="group relative flex min-h-0 flex-col rounded-[1.4rem] border border-border bg-white/75 p-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-1 hover:bg-white"
        >
          <span aria-hidden="true" className={`absolute right-4 top-4 flex h-9 w-9 rotate-6 items-center justify-center rounded-xl ${accents[index % accents.length]}`}>
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="section-kicker pr-12">{translator.primaryCategory?.name || "Fresh twist"}</p>
          <h3 className="font-display mt-2 pr-10 text-xl font-bold leading-tight text-ink">
            {translator.name}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-ink">{translator.shortDescription}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {translator.categories.slice(0, 2).map((category) => (
              <span key={`${translator.id}-${category.id}`} className="rounded-full bg-muted-surface px-2.5 py-1 text-[11px] font-bold text-muted-ink">
                {category.name}
              </span>
            ))}
          </div>
          <Link
            href={`/translators/${translator.slug}`}
            className="mt-5 inline-flex h-11 items-center justify-between gap-2 rounded-full bg-brand-500 px-4 text-sm font-extrabold text-white shadow-[0_4px_0_#0d9488] transition group-hover:bg-brand-600 active:translate-y-1 active:shadow-none"
          >
            Try this twist
            <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </article>
      ))}
    </div>
  );
}
