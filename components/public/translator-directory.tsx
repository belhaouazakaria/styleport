"use client";

import Link from "next/link";
import { ArrowUpRight, MessageSquarePlus, Sparkles } from "lucide-react";

import type { PublicTranslator } from "@/lib/types";
import { useRequestTranslatorModal } from "@/components/providers/request-translator-provider";

interface TranslatorDirectoryProps {
  translators: PublicTranslator[];
  searchQuery?: string;
}

export function TranslatorDirectory({
  translators,
  searchQuery,
}: TranslatorDirectoryProps) {
  const { openRequestModal } = useRequestTranslatorModal();

  if (!translators.length) {
    return (
      <div className="border-border bg-supporting-50/70 border-y border-dashed p-10 text-center">
        <p className="text-ink text-base font-medium">
          No active translators match your current filters.
        </p>
        <p className="text-muted-ink mt-1 text-sm">
          {searchQuery?.trim()
            ? `Couldn’t find “${searchQuery.trim()}”.`
            : "Try a different query or create a translator idea."}
        </p>
        <button
          type="button"
          onClick={() => openRequestModal(searchQuery)}
          className="border-brand-300 bg-brand-50 text-brand-700 hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:ring-brand-500/60 mt-4 inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Create translator
        </button>
      </div>
    );
  }

  return (
    <div className="divide-border border-border divide-y border-y sm:grid sm:grid-cols-2 sm:divide-x xl:grid-cols-3">
      {translators.map((translator, index) => (
        <article
          key={translator.id}
          className="group bg-surface/55 relative p-4 transition hover:z-10 hover:bg-white sm:min-h-72 sm:p-6"
        >
          <span
            aria-hidden="true"
            className={`mb-4 flex h-11 w-11 rotate-[-4deg] items-center justify-center rounded-[1rem] text-xl font-black sm:mb-5 sm:h-12 sm:w-12 ${index % 4 === 0 ? "bg-[#ffe079]" : index % 4 === 1 ? "bg-accent-100 text-accent-700" : index % 4 === 2 ? "bg-brand-100 text-brand-800" : "bg-supporting-100 text-supporting-800"}`}
          >
            {translator.name.slice(0, 1)}
          </span>
          <div className="mb-2 flex items-start justify-between gap-3">
            <h2 className="font-display text-ink text-2xl leading-tight font-bold">
              <Link
                href={`/translators/${translator.slug}`}
                className="group text-ink hover:text-brand-700 focus-visible:ring-brand-500/60 inline-flex items-center gap-1 rounded-md transition focus-visible:ring-2 focus-visible:outline-none"
              >
                {translator.name}
                <ArrowUpRight className="h-4 w-4 opacity-70 transition group-hover:opacity-100" />
              </Link>
            </h2>
            {translator.isFeatured ? (
              <span className="bg-brand-100 text-brand-700 rounded-full px-2 py-1 text-[11px] font-semibold">
                Featured
              </span>
            ) : null}
          </div>

          <p className="text-muted-ink line-clamp-3 text-sm leading-6">
            {translator.shortDescription}
          </p>

          {translator.categories.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {translator.categories.slice(0, 3).map((category) => (
                <span
                  key={`${translator.id}-${category.id}`}
                  className="border-border bg-muted-surface text-muted-ink rounded-full border px-2.5 py-1 text-[11px] font-medium"
                >
                  {category.name}
                </span>
              ))}
            </div>
          ) : null}

          <p className="text-muted-ink mt-4 text-xs">
            {translator.sourceLabel} to {translator.targetLabel}
          </p>

          <Link
            href={`/translators/${translator.slug}`}
            className="bg-brand-500 mt-5 inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-extrabold text-white shadow-[0_4px_0_#0d9488] transition active:translate-y-1 active:shadow-none"
          >
            <Sparkles className="h-4 w-4" />
            Try this translator
          </Link>
        </article>
      ))}
    </div>
  );
}
