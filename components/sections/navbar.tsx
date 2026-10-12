"use client";

import Link from "next/link";
import {
  Compass,
  LayoutGrid,
  Menu,
  MessageSquarePlus,
  Search,
  X,
} from "lucide-react";
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
      <header className="border-border/80 bg-page/92 sticky top-0 z-40 border-b backdrop-blur-xl">
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
              className="border-border bg-surface text-ink hover:border-brand-300 hover:text-brand-700 inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5"
            >
              <Search className="h-4 w-4" />
              Search translators
            </Link>
            <Link
              href={categoriesHref}
              className="text-muted-ink hover:bg-muted-surface hover:text-ink inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition"
            >
              <LayoutGrid className="h-4 w-4" />
              Categories
            </Link>
            <Link
              href="/ideas"
              className="text-muted-ink hover:bg-muted-surface hover:text-ink inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition"
            >
              Ideas
            </Link>
            <Link
              href="/contact"
              className="text-muted-ink hover:bg-muted-surface hover:text-ink inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition"
            >
              Contact
            </Link>
            <Link
              href="/about"
              className="text-muted-ink hover:bg-muted-surface hover:text-ink inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition"
            >
              About
            </Link>
            <button
              type="button"
              onClick={() => openRequestModal()}
              className="bg-accent-500 hover:bg-accent-600 inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm font-extrabold text-white shadow-[0_6px_0_#d9563b] transition hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Create translator
            </button>
          </nav>

          <button
            type="button"
            aria-label={
              mobileOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="border-border bg-surface text-ink inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition active:scale-95 md:hidden"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {mobileOpen ? (
          <div className="md:hidden">
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileOpen(false)}
              className="bg-ink/35 fixed inset-0 z-40 backdrop-blur-[1px]"
            />
            <aside
              id="mobile-nav-drawer"
              className="border-border bg-page fixed top-0 right-0 z-50 flex h-dvh w-[86vw] max-w-sm flex-col gap-3 border-l p-5 shadow-2xl"
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
                  className="border-border bg-surface text-muted-ink hover:text-ink focus-visible:ring-brand-500/60 inline-flex h-9 w-9 items-center justify-center rounded-lg border transition focus-visible:ring-2 focus-visible:outline-none"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 space-y-2">
                <Link
                  href={searchHref}
                  onClick={() => setMobileOpen(false)}
                  className="border-border bg-surface text-ink hover:border-brand-300 hover:text-brand-700 focus-visible:ring-brand-500/60 inline-flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Search className="h-4 w-4" />
                  Find a translator
                </Link>
                <Link
                  href={categoriesHref}
                  onClick={() => setMobileOpen(false)}
                  className="border-border bg-surface text-ink hover:border-brand-300 hover:text-brand-700 focus-visible:ring-brand-500/60 inline-flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Categories
                </Link>
                <Link
                  href="/ideas"
                  onClick={() => setMobileOpen(false)}
                  className="border-border bg-surface text-ink hover:border-brand-300 hover:text-brand-700 focus-visible:ring-brand-500/60 inline-flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Compass className="h-4 w-4" />
                  Ideas
                </Link>
                <Link
                  href="/contact"
                  onClick={() => setMobileOpen(false)}
                  className="border-border bg-surface text-ink hover:border-brand-300 hover:text-brand-700 focus-visible:ring-brand-500/60 inline-flex h-11 w-full items-center rounded-xl border px-3 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
                >
                  Contact
                </Link>
                <Link
                  href="/about"
                  onClick={() => setMobileOpen(false)}
                  className="border-border bg-surface text-ink hover:border-brand-300 hover:text-brand-700 focus-visible:ring-brand-500/60 inline-flex h-11 w-full items-center rounded-xl border px-3 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none"
                >
                  About SayTwist
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    openRequestModal();
                    setMobileOpen(false);
                  }}
                  className="border-brand-300 bg-brand-50 text-brand-700 hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:ring-brand-500/60 inline-flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  Create translator
                </button>
              </div>
            </aside>
          </div>
        ) : null}
      </header>
    </>
  );
}
