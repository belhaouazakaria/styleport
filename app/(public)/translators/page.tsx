import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { getPublicTranslatorDirectory } from "@/lib/data/translators";
import { getAppBaseUrl } from "@/lib/env";
import { isPolicyNoindex } from "@/lib/seo/index-policy";
import { getAppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "All AI Text Translators and Style Rewriters | SayTwist" },
  description:
    "Browse every SayTwist translator by category: tone and style rewriters, slang and character voices, historical English, professional writing and language tools.",
  alternates: { canonical: "/translators" },
  robots: { index: true, follow: true },
};

export default async function TranslatorsDirectoryPage() {
  const [settings, groups] = await Promise.all([getAppSettings(), getPublicTranslatorDirectory()]);
  const baseUrl = getAppBaseUrl().toString().replace(/\/$/, "");
  const visibleGroups = groups
    .map((group) => ({ ...group, translators: group.translators.filter((item) => !isPolicyNoindex(item.slug)) }))
    .filter((group) => group.translators.length > 0);
  const total = visibleGroups.reduce((sum, group) => sum + group.translators.length, 0);

  return (
    <div className="relative overflow-x-hidden">
      <JsonLdScript
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${baseUrl}/` },
            { "@type": "ListItem", position: 2, name: "Translators", item: `${baseUrl}/translators` },
          ],
        }}
      />
      <Navbar
        logoUrl={settings.logoUrl}
        logoDesktopHeight={settings.logoDesktopHeight}
        logoMobileHeight={settings.logoMobileHeight}
      />
      <main className="mx-auto w-full max-w-7xl px-4 pb-14 pt-7 sm:px-6 sm:pt-12 lg:px-8">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Translators" }]} />
        <h1 className="font-display mt-4 text-4xl font-bold tracking-tight text-ink sm:text-5xl">All translators</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-ink">
          {total} AI text translators that rewrite your words in a different tone, style or voice. Pick a category to
          jump to it, then open a translator to try it with your own text.
        </p>
        <nav aria-label="Categories" className="mt-6 flex flex-wrap gap-2">
          {visibleGroups.map((group) => (
            <a
              key={group.category?.slug || "other"}
              href={`#${group.category?.slug || "other"}`}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:bg-brand-50"
            >
              {group.category?.name || "Other"} ({group.translators.length})
            </a>
          ))}
        </nav>
        {visibleGroups.map((group) => (
          <section key={group.category?.slug || "other"} id={group.category?.slug || "other"} className="mt-12 scroll-mt-24">
            <div className="flex items-end justify-between gap-3 border-b border-dashed border-border pb-3">
              <h2 className="font-display text-3xl font-bold tracking-tight text-ink">{group.category?.name || "Other"}</h2>
              <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800">{group.translators.length} translators</span>
            </div>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.translators.map((item, index) => (
                <li key={item.slug} className="group relative flex flex-col rounded-[1.25rem] border border-border bg-white/80 p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-1 hover:bg-white">
                  <span
                    aria-hidden="true"
                    className={`mb-4 flex h-11 w-11 -rotate-3 items-center justify-center rounded-[1rem] text-xl font-black ${
                      index % 4 === 0 ? "bg-[#ffe079]" : index % 4 === 1 ? "bg-accent-100 text-accent-700" : index % 4 === 2 ? "bg-brand-100 text-brand-800" : "bg-supporting-100 text-supporting-800"
                    }`}
                  >
                    {item.name.slice(0, 1).toUpperCase()}
                  </span>
                  {item.isNew ? (
                    <span className="absolute right-4 top-4 rounded-full bg-accent-100 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-accent-700">New</span>
                  ) : null}
                  <h3 className="font-display text-xl font-bold leading-tight text-ink">
                    <Link href={`/translators/${item.slug}`} className="hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:outline-none">
                      {item.name}
                    </Link>
                  </h3>
                  <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-muted-ink">{item.shortDescription}</p>
                  <Link
                    href={`/translators/${item.slug}`}
                    aria-label={`Try ${item.name}`}
                    className="mt-4 inline-flex h-10 items-center justify-between gap-2 self-start rounded-full bg-brand-500 px-4 text-sm font-extrabold text-white shadow-[0_4px_0_#0d9488] transition hover:bg-brand-600 active:translate-y-1 active:shadow-none"
                  >
                    Try this twist
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
