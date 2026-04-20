"use client";

import Link from "next/link";
import { MessageSquarePlus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useRequestTranslatorModal } from "@/components/providers/request-translator-provider";

interface Suggestion {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  categoryName: string | null;
}

interface DiscoverySearchProps {
  q: string;
  category?: string;
}

export function DiscoverySearch({ q, category }: DiscoverySearchProps) {
  const [value, setValue] = useState(q);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { openRequestModal } = useRequestTranslatorModal();

  const query = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!query) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/translators/suggest?q=${encodeURIComponent(query)}`);
        const payload = await response.json();
        if (response.ok && payload.ok) {
          setSuggestions(payload.suggestions || []);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div ref={containerRef} className="relative">
      <form action="/" method="GET" className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" />
        <input
          name="q"
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            setValue(nextValue);
            if (!nextValue.trim()) {
              setSuggestions([]);
              setOpen(false);
            }
          }}
          onFocus={() => setOpen(Boolean(query))}
          placeholder="Search translators, categories, or slugs"
          className="h-12 w-full rounded-xl border border-border bg-surface pl-10 pr-24 text-sm text-ink shadow-sm"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
        >
          Search
        </button>
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <input type="hidden" name="page" value="1" />
      </form>

      {open ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-ink">Searching…</p>
          ) : suggestions.length ? (
            <ul className="max-h-72 overflow-y-auto scrollbar-thin">
              {suggestions.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/translators/${item.slug}`}
                    className="block border-b border-border/70 px-3 py-2 last:border-b-0 hover:bg-muted-surface"
                    onClick={() => setOpen(false)}
                  >
                    <p className="text-sm font-semibold text-ink">{item.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-ink">{item.shortDescription}</p>
                    {item.categoryName ? (
                      <p className="mt-1 text-[11px] font-medium text-brand-700">{item.categoryName}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2 px-3 py-3">
              <p className="text-sm text-muted-ink">Couldn&apos;t find a matching translator.</p>
              <button
                type="button"
                onClick={() => {
                  openRequestModal(query);
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Request “{query}”
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
