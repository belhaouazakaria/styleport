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
import {
  getDiscoveryResult,
  getFeaturedPublicTranslators,
  getNewestPublicTranslatorsPage,
} from "@/lib/data/translators";
import { getAppBaseUrl } from "@/lib/env";
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
  const baseUrl = getAppBaseUrl();
  const ogImageUrl = new URL("/og-image.png", baseUrl).toString();
  const homeUrl = new URL("/", baseUrl).toString();

  const hasSearch = Boolean(params.q?.trim());
  const hasCategory = Boolean(params.category?.trim());

  return {
    title: "What Type Of | Translator",
    description:
      "AI-powered text translators to rewrite text into different styles, tones, and personalities.",
    alternates: {
      canonical: hasCategory || hasSearch ? "/" : "/",
    },
    openGraph: {
      title: "What Type Of | Translator",
      description:
        "AI-powered text translators to rewrite text into different styles, tones, and personalities.",
      type: "website",
      url: homeUrl,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: "What Type Of | Translator",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "What Type Of | Translator",
      description:
        "AI-powered text translators to rewrite text into different styles, tones, and personalities.",
      images: [ogImageUrl],
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
  const useNewestCatalog = !q && !category;
  const page = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = settings.discoveryPageSize || DISCOVERY_DEFAULT_PAGE_SIZE;

  const [discovery, newestCatalog, featured, desktopAds, mobileAds] = await Promise.all([
    getDiscoveryResult({ q, category, page, pageSize }),
    useNewestCatalog ? getNewestPublicTranslatorsPage({ page, pageSize }) : Promise.resolve(null),
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
  const catalogTranslators = useNewestCatalog && newestCatalog ? newestCatalog.translators : discovery.translators;
  const catalogTotal = useNewestCatalog && newestCatalog ? newestCatalog.total : discovery.total;
  const catalogPage = useNewestCatalog && newestCatalog ? newestCatalog.page : discovery.page;
  const catalogTotalPages = useNewestCatalog && newestCatalog ? newestCatalog.totalPages : discovery.totalPages;

  return (
    <div className="relative overflow-x-hidden">
      <Navbar platformName={settings.platformName} />
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

        {settings.featuredTranslatorsEnabled ? (
          <FeaturedTranslators translators={featured} sectionId="featured-translators" />
        ) : null}

        {desktopAds.length > 1 ? (
          <section className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={desktopAds[1]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}

        <section id="translator-catalog" className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-3xl font-semibold text-ink">Translator Catalog</h2>
            <p className="text-sm text-muted-ink">
              {catalogTotal} result{catalogTotal === 1 ? "" : "s"}
            </p>
          </div>
          <TranslatorDirectory translators={catalogTranslators} searchQuery={discovery.q} />
          <div className="mt-6">
            <DiscoveryPagination
              page={catalogPage}
              totalPages={catalogTotalPages}
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
      <Footer platformName={settings.platformName} />
    </div>
  );
}
