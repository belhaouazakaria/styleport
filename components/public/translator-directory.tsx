"use client";

import Link from "next/link";
import { ArrowUpRight, MessageSquarePlus, Sparkles } from "lucide-react";

import type { PublicTranslator } from "@/lib/types";
import { useRequestTranslatorModal } from "@/components/providers/request-translator-provider";

interface TranslatorDirectoryProps {
  translators: PublicTranslator[];
  searchQuery?: string;
}

export function TranslatorDirectory({ translators, searchQuery }: TranslatorDirectoryProps) {
  const { openRequestModal } = useRequestTranslatorModal();

  if (!translators.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-base font-medium text-ink">No active translators match your current filters.</p>
        <p className="mt-1 text-sm text-muted-ink">
          {searchQuery?.trim()
            ? `Couldn’t find “${searchQuery.trim()}”.`
            : "Try a different query or create a translator idea."}
        </p>
        <button
          type="button"
          onClick={() => openRequestModal(searchQuery)}
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Create translator
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {translators.map((translator) => (
        <article
          key={translator.id}
          className="rounded-2xl border border-border bg-surface p-5 shadow-[0_20px_35px_-28px_rgba(17,24,39,0.18)] transition hover:-translate-y-0.5 hover:border-brand-300"
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold leading-tight text-ink">
              <Link
                href={`/translators/${translator.slug}`}
                className="group inline-flex items-center gap-1 rounded-md text-ink transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                {translator.name}
                <ArrowUpRight className="h-4 w-4 opacity-70 transition group-hover:opacity-100" />
              </Link>
            </h2>
            {translator.isFeatured ? (
              <span className="rounded-full bg-brand-100 px-2 py-1 text-[11px] font-semibold text-brand-700">
                Featured
              </span>
            ) : null}
          </div>

          <p className="line-clamp-3 text-sm leading-6 text-muted-ink">{translator.shortDescription}</p>

          {translator.categories.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {translator.categories.slice(0, 3).map((category) => (
                <span
                  key={`${translator.id}-${category.id}`}
                  className="rounded-full border border-border bg-muted-surface px-2.5 py-1 text-[11px] font-medium text-muted-ink"
                >
                  {category.name}
                </span>
              ))}
            </div>
          ) : null}

          <p className="mt-4 text-xs text-muted-ink">
            {translator.sourceLabel} to {translator.targetLabel}
          </p>

          <Link
            href={`/translators/${translator.slug}`}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-brand-300 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <Sparkles className="h-4 w-4" />
            Try this translator
          </Link>
        </article>
      ))}
    </div>
  );
}
