import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdDeviceType, AdPageType } from "@prisma/client";
import { cache } from "react";

import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { TranslatorCard } from "@/components/translator/translator-card";
import { AdSlot } from "@/components/shared/ad-slot";
import { getRenderableAdPlacements } from "@/lib/data/ads";
import { getPublicTranslatorBySlug } from "@/lib/data/translators";
import { getAppBaseUrl } from "@/lib/env";
import { getShareImageAbsoluteUrl } from "@/lib/share-images";
import { getAppSettings } from "@/lib/settings";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

const loadPublicTranslatorBySlug = cache(async (slug: string) => getPublicTranslatorBySlug(slug));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const translator = await loadPublicTranslatorBySlug(slug);

  if (!translator) {
    return {
      title: "Translator Not Found",
    };
  }

  const description = translator.seoDescription || translator.shortDescription;
  const title = translator.seoTitle || `${translator.name} Translator`;
  const imageUrl = translator.shareImagePath || `/translators/${translator.slug}/pin-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `/translators/${translator.slug}`,
      images: [
        {
          url: imageUrl,
          width: 1000,
          height: 1500,
          alt: `${translator.name} Pinterest share image`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function TranslatorSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const translator = await loadPublicTranslatorBySlug(slug);

  if (!translator) {
    notFound();
  }

  const [settings, ads] = await Promise.all([
    getAppSettings(),
    getRenderableAdPlacements({
      pageType: AdPageType.TRANSLATOR,
      deviceType: AdDeviceType.DESKTOP,
      categorySlug: translator.primaryCategory?.slug,
    }),
  ]);
  const baseUrl = getAppBaseUrl();
  const shareUrl = new URL(`/translators/${translator.slug}`, baseUrl).toString();
  const pinImageUrl =
    getShareImageAbsoluteUrl(translator.shareImagePath) ||
    new URL(`/translators/${translator.slug}/pin-image`, baseUrl).toString();

  return (
    <div className="relative overflow-x-hidden">
      <Navbar />
      <main className="pb-10">
        <section className="mx-auto w-full max-w-7xl px-4 pb-6 pt-10 text-center sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Translators", href: "/translators" },
              { label: translator.name },
            ]}
          />
          <h1 className="font-display mt-3 text-balance text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {translator.title}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-base text-muted-ink sm:text-lg">
            {translator.subtitle}
          </p>
        </section>

        {ads.length ? (
          <section className="mx-auto mb-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={ads[0]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}

        <TranslatorCard translator={translator} shareUrl={shareUrl} pinImageUrl={pinImageUrl} />

        {ads.length > 1 ? (
          <section className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={ads[1]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}
      </main>
      <Footer platformName={settings.platformName} disclaimer={settings.footerDisclaimer} />
    </div>
  );
}
