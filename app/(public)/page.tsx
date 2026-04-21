import type { Metadata } from "next";
import { AdDeviceType, AdPageType } from "@prisma/client";

import { CategoryNav } from "@/components/public/category-nav";
import { DiscoveryPagination } from "@/components/public/discovery-pagination";
import { DiscoverySearch } from "@/components/public/discovery-search";
import { FeaturedTranslators } from "@/components/public/featured-translators";
import { TranslatorDirectory } from "@/components/public/translator-directory";
import { Footer } from "@/components/sections/footer";
import { Hero } from "@/components/sections/hero";
import { Navbar } from "@/components/sections/navbar";
import { AdSlot } from "@/components/shared/ad-slot";
import { DISCOVERY_DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { getRenderableAdPlacements } from "@/lib/data/ads";
import { getDiscoveryResult, getFeaturedPublicTranslators } from "@/lib/data/translators";
import { getAppSettings } from "@/lib/settings";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;

  const hasSearch = Boolean(params.q?.trim());
  const hasCategory = Boolean(params.category?.trim());

  return {
    title: "StylePort Translator Discovery",
    description:
      "Browse and search style translators by category, tone, and writing intent.",
    alternates: {
      canonical: hasCategory || hasSearch ? "/" : "/",
    },
    robots: hasSearch
      ? {
          index: false,
          follow: true,
        }
      : undefined,
  };
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const settings = await getAppSettings();

  const q = (params.q || "").trim() || undefined;
  const category = (params.category || "").trim() || undefined;
  const page = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = settings.discoveryPageSize || DISCOVERY_DEFAULT_PAGE_SIZE;

  const [discovery, featured, desktopAds, mobileAds] = await Promise.all([
    getDiscoveryResult({ q, category, page, pageSize }),
    getFeaturedPublicTranslators(6),
    getRenderableAdPlacements({
      pageType: AdPageType.HOMEPAGE,
      deviceType: AdDeviceType.DESKTOP,
    }),
    getRenderableAdPlacements({
      pageType: AdPageType.HOMEPAGE,
      deviceType: AdDeviceType.MOBILE,
    }),
  ]);

  return (
    <div className="relative overflow-x-hidden">
      <Navbar />
      <main className="pb-10">
        <Hero title={settings.homepageTitle} subtitle={settings.homepageSubtitle} />

        <section id="search-translators" className="mx-auto mt-2 w-full max-w-7xl space-y-4 px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-ink">{settings.catalogIntro}</p>
          <div className="min-w-0">
            <DiscoverySearch q={q || ""} category={category} />
          </div>
          <div id="categories">
            <CategoryNav categories={discovery.categories} activeCategory={category} q={q} />
          </div>
        </section>

        {desktopAds.length ? (
          <section className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={desktopAds[0]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}

        {settings.featuredTranslatorsEnabled ? <FeaturedTranslators translators={featured} /> : null}

        {desktopAds.length > 1 ? (
          <section className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={desktopAds[1]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}

        <section id="translator-catalog" className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-3xl font-semibold text-ink">Translator Catalog</h2>
            <p className="text-sm text-muted-ink">
              {discovery.total} result{discovery.total === 1 ? "" : "s"}
            </p>
          </div>
          <TranslatorDirectory translators={discovery.translators} searchQuery={discovery.q} />
          <div className="mt-6">
            <DiscoveryPagination
              page={discovery.page}
              totalPages={discovery.totalPages}
              q={discovery.q}
              category={discovery.category}
            />
          </div>
        </section>

        {mobileAds.length ? (
          <section className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white p-2 md:hidden">
            <AdSlot placement={mobileAds[0]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}
      </main>
      <Footer platformName={settings.platformName} disclaimer={settings.footerDisclaimer} />
    </div>
  );
}
