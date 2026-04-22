import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import type { PublicTranslator } from "@/lib/types";

interface FeaturedTranslatorsProps {
  translators: PublicTranslator[];
}

export function FeaturedTranslators({ translators }: FeaturedTranslatorsProps) {
  if (!translators.length) {
    return null;
  }

  return (
    <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-[0_20px_45px_-35px_rgba(17,24,39,0.25)] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold text-ink">Featured Translators</h2>
          <Link href="/translators" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            Browse all
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {translators.map((translator) => (
            <article
              key={translator.id}
              className="rounded-2xl border border-border bg-muted-surface p-4 transition hover:border-brand-300 hover:bg-surface"
            >
              <h3 className="font-semibold text-ink">
                <Link
                  href={`/translators/${translator.slug}`}
                  className="group inline-flex items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                >
                  {translator.name}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
              </h3>
              <p className="mt-1 text-sm text-muted-ink">{translator.shortDescription}</p>
              {translator.primaryCategory ? (
                <p className="mt-2 text-xs font-medium text-brand-700">{translator.primaryCategory.name}</p>
              ) : null}
              <Link
                href={`/translators/${translator.slug}`}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 text-xs font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Try this translator
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
