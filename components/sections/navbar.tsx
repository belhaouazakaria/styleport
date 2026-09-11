"use client";

import Link from "next/link";
import { Compass, Home, LayoutGrid, Menu, MessageSquarePlus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/shared/brand-logo";
import { useRequestTranslatorModal } from "@/components/providers/request-translator-provider";

const searchHref = "/#search-translators";
const categoriesHref = "/#categories";

interface NavbarProps {
  logoUrl?: string;
  logoDesktopHeight?: number;
  logoMobileHeight?: number;
}

export function Navbar({
  logoUrl,
  logoDesktopHeight = 40,
  logoMobileHeight = 32,
}: NavbarProps) {
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
    <>
    <header className="sticky top-0 z-40 border-b border-border/80 bg-page/92 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center">
          <BrandLogo
            logoUrl={logoUrl}
            desktopHeight={logoDesktopHeight}
            mobileHeight={logoMobileHeight}
          />
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <Link
            href={searchHref}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700"
          >
            <Search className="h-4 w-4" />
            Search translators
          </Link>
          <Link
            href={categoriesHref}
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-muted-ink transition hover:bg-muted-surface hover:text-ink"
          >
            <LayoutGrid className="h-4 w-4" />
            Categories
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-muted-ink transition hover:bg-muted-surface hover:text-ink"
          >
            Contact
          </Link>
          <button
            type="button"
            onClick={() => openRequestModal()}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-accent-500 px-5 text-sm font-extrabold text-white shadow-[0_6px_0_#d9563b] transition hover:-translate-y-0.5 hover:bg-accent-600 active:translate-y-1 active:shadow-none"
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
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-ink shadow-sm transition active:scale-95 md:hidden"
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
            className="fixed right-0 top-0 z-50 flex h-dvh w-[86vw] max-w-sm flex-col gap-3 border-l border-border bg-page p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <BrandLogo
                logoUrl={logoUrl}
                desktopHeight={logoDesktopHeight}
                mobileHeight={logoMobileHeight}
              />
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
    <nav aria-label="Primary mobile navigation" className="fixed inset-x-3 bottom-3 z-50 grid h-16 grid-cols-3 items-center rounded-[1.35rem] border border-white/70 bg-white/95 px-2 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.48)] backdrop-blur-xl md:hidden">
      <Link href="/" className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold text-brand-700">
        <Home className="h-5 w-5" />
        Home
      </Link>
      <button type="button" onClick={() => openRequestModal()} className="mx-auto -mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-page bg-accent-500 text-white shadow-[0_6px_0_#d9563b] active:translate-y-1 active:shadow-none" aria-label="Create translator">
        <MessageSquarePlus className="h-6 w-6" />
      </button>
      <Link href="/#translator-catalog" className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold text-muted-ink">
        <Compass className="h-5 w-5" />
        Explore
      </Link>
    </nav>
    </>
  );
}
