"use client";

import Link from "next/link";
import { LayoutGrid, Menu, MessageSquarePlus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useRequestTranslatorModal } from "@/components/providers/request-translator-provider";

const searchHref = "/#search-translators";
const categoriesHref = "/#categories";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { openRequestModal } = useRequestTranslatorModal();

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#14B8A6] shadow-sm transition group-hover:bg-[#0D9488]">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 22C8 22 7 20 8 17C9.5 12 14 10 17 10C20 10 23 11 24 14C25 17 24 20 22 22C20 24 16 25 13 24C10 23 9 22 8 22Z" fill="white"/>
              <path d="M8 22C7 19.5 8 15.5 12 13C16 10.5 21 11 24 14" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <path d="M10 23L8 27L13 24.5" fill="white"/>
              <rect x="5" y="4" width="3.5" height="2" rx="1" transform="rotate(-30 5 4)" fill="#FF7A59"/>
              <rect x="11" y="2.5" width="3.5" height="2" rx="1" transform="rotate(-10 11 2.5)" fill="#F59E0B"/>
              <rect x="17" y="4" width="3" height="2" rx="1" transform="rotate(15 17 4)" fill="#60C5F7"/>
            </svg>
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            <span className="text-[#0F172A]">Say</span><span className="text-[#14B8A6]">Twist</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <Link
            href={searchHref}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-ink transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <Search className="h-4 w-4" />
            Search translators
          </Link>
          <Link
            href={categoriesHref}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted-ink transition hover:bg-muted-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <LayoutGrid className="h-4 w-4" />
            Categories
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-muted-ink transition hover:bg-muted-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            Contact
          </Link>
          <button
            type="button"
            onClick={() => openRequestModal()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Create translator
          </button>
        </nav>

        <button
          type="button"
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-ink transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[1px]"
          />
          <aside
            id="mobile-nav-drawer"
            className="fixed right-0 top-0 z-50 flex h-dvh w-[86vw] max-w-sm flex-col gap-3 border-l border-border bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-xl font-semibold tracking-tight text-ink">
                <span className="text-[#0F172A]">Say</span><span className="text-[#14B8A6]">Twist</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-ink transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2 space-y-2">
              <Link
                href={searchHref}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-ink transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <Search className="h-4 w-4" />
                Find a translator
              </Link>
              <Link
                href={categoriesHref}
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-ink transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <LayoutGrid className="h-4 w-4" />
                Categories
              </Link>
              <Link
                href="/contact"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-11 w-full items-center rounded-xl border border-border bg-surface px-3 text-sm font-medium text-ink transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                Contact
              </Link>
              <button
                type="button"
                onClick={() => {
                  openRequestModal();
                  setMobileOpen(false);
                }}
                className="inline-flex h-11 w-full items-center gap-2 rounded-xl border border-brand-300 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <MessageSquarePlus className="h-4 w-4" />
                Create translator
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </header>
  );
}
