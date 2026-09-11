import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import type { PublicTranslator } from "@/lib/types";

interface FeaturedTranslatorsProps {
  translators: PublicTranslator[];
  title?: string;
  sectionId?: string;
  showBrowseLink?: boolean;
  browseHref?: string;
  browseLabel?: string;
}

export function FeaturedTranslators({
  translators,
  title = "Featured twists",
  sectionId,
  showBrowseLink = true,
  browseHref = "/translators",
  browseLabel = "Browse all",
}: FeaturedTranslatorsProps) {
  if (!translators.length) {
    return null;
  }

  return (
    <section id={sectionId} className="mx-auto mt-10 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <p className="section-kicker">Handpicked for fresh perspective</p>
            <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h2>
          </div>
          {showBrowseLink ? (
            <Link href={browseHref} className="text-sm font-medium text-brand-700 hover:text-brand-800">
              {browseLabel}
            </Link>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {translators.map((translator, index) => (
            <article
              key={translator.id}
              className={`twist-ticket min-h-56 p-6 transition hover:-translate-y-1 ${index % 3 === 1 ? "bg-[#ffe079]" : index % 3 === 2 ? "bg-supporting-100" : "bg-brand-500 text-white"}`}
            >
              <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${index % 3 === 0 ? "text-white/75" : "text-ink/60"}`}>
                {translator.primaryCategory?.name || "Fresh twist"}
              </p>
              <h3 className={`font-display mt-3 text-2xl font-bold ${index % 3 === 0 ? "text-white" : "text-ink"}`}>
                <Link
                  href={`/translators/${translator.slug}`}
                  className="group inline-flex items-center gap-1 rounded-md"
                >
                  {translator.name}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </Link>
              </h3>
              <p className={`mt-2 min-h-12 text-sm leading-6 ${index % 3 === 0 ? "text-white/85" : "text-ink/70"}`}>{translator.shortDescription}</p>
              <Link
                href={`/translators/${translator.slug}`}
                className="mt-5 inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-extrabold text-ink shadow-sm transition hover:translate-x-1"
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
