import type { Metadata } from "next";
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
          <section key={group.category?.slug || "other"} id={group.category?.slug || "other"} className="mt-10 scroll-mt-24">
            <h2 className="font-display text-2xl font-bold text-ink">{group.category?.name || "Other"}</h2>
            <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.translators.map((item) => (
                <li key={item.slug}>
                  <Link href={`/translators/${item.slug}`} className="font-semibold text-brand-800 hover:underline">
                    {item.name}
                  </Link>
                  <p className="line-clamp-2 text-sm leading-5 text-muted-ink">{item.shortDescription}</p>
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
