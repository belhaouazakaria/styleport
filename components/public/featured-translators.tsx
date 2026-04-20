import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
            <Link
              key={translator.id}
              href={`/translators/${translator.slug}`}
              className="group rounded-2xl border border-border bg-muted-surface p-4 transition hover:border-brand-300 hover:bg-surface"
            >
              <h3 className="font-semibold text-ink">{translator.name}</h3>
              <p className="mt-1 text-sm text-muted-ink">{translator.shortDescription}</p>
              {translator.primaryCategory ? (
                <p className="mt-2 text-xs font-medium text-brand-700">{translator.primaryCategory.name}</p>
              ) : null}
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                Open translator
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
