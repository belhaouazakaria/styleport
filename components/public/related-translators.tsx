import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";

import type { PublicTranslator } from "@/lib/types";

interface RelatedTranslatorsProps {
  translators: PublicTranslator[];
}

export function RelatedTranslators({ translators }: RelatedTranslatorsProps) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
      {translators.map((translator) => (
        <article
          key={translator.id}
          className="group border-border relative flex min-h-0 min-w-[min(17rem,calc(100vw-3rem))] snap-start flex-col rounded-[1.25rem] border bg-white/75 p-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-1 hover:bg-white sm:min-w-0"
        >
          <span
            aria-hidden="true"
            className="bg-brand-100 text-brand-800 absolute top-4 right-4 flex h-9 w-9 rotate-6 items-center justify-center rounded-xl"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="section-kicker pr-12">
            {translator.primaryCategory?.name || "Fresh twist"}
          </p>
          <h3 className="font-display text-ink mt-2 pr-10 text-xl leading-tight font-bold">
            {translator.name}
          </h3>
          <p className="text-muted-ink mt-2 line-clamp-2 text-sm leading-6">
            {translator.shortDescription}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {translator.categories.slice(0, 2).map((category) => (
              <span
                key={`${translator.id}-${category.id}`}
                className="bg-muted-surface text-muted-ink rounded-full px-2.5 py-1 text-[11px] font-bold"
              >
                {category.name}
              </span>
            ))}
          </div>
          <Link
            href={`/translators/${translator.slug}`}
            className="bg-brand-500 group-hover:bg-brand-600 mt-5 inline-flex h-11 items-center justify-between gap-2 rounded-full px-4 text-sm font-extrabold text-white shadow-[0_4px_0_#0d9488] transition active:translate-y-1 active:shadow-none"
          >
            Try this twist
            <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </article>
      ))}
    </div>
  );
}
