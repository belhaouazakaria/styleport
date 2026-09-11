import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdDeviceType, AdPageType } from "@prisma/client";
import { cache } from "react";

import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { TranslatorCard } from "@/components/translator/translator-card";
import { AdSlot } from "@/components/shared/ad-slot";
import { TranslatorComments } from "@/components/public/translator-comments";
import { RelatedTranslators } from "@/components/public/related-translators";
import { getRenderableAdPlacements } from "@/lib/data/ads";
import { getPublicTranslatorBySlug, getRelatedPublicTranslators } from "@/lib/data/translators";
import { getAppBaseUrl } from "@/lib/env";
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

  const baseUrl = getAppBaseUrl();
  const settings = await getAppSettings();
  const platformName = settings.platformName?.trim() || "SayTwist";
  const cleanDescription = (translator.seoDescription || translator.shortDescription || "")
    .replace(/\s+/g, " ")
    .trim();
  const descriptionBase =
    cleanDescription ||
    `Use ${translator.name} to rewrite text in a new tone with SayTwist.`;
  const description =
    descriptionBase.length > 190 ? `${descriptionBase.slice(0, 189).trimEnd()}…` : descriptionBase;
  const title = translator.name;
  const translatorUrl = new URL(`/translators/${translator.slug}`, baseUrl).toString();
  const fallbackImageUrl = new URL("/og-image.png", baseUrl).toString();
  const imageUrl = translator.shareImagePath
    ? /^https?:\/\//i.test(translator.shareImagePath)
      ? translator.shareImagePath
      : new URL(
          translator.shareImagePath.startsWith("/")
            ? translator.shareImagePath
            : `/${translator.shareImagePath}`,
          baseUrl,
        ).toString()
    : fallbackImageUrl;

  return {
    title,
    description,
    alternates: {
      canonical: `/translators/${translator.slug}`,
    },
    openGraph: {
      title,
      description,
      type: "article",
      url: translatorUrl,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${translator.name} | ${platformName}`,
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

  const [settings, ads, relatedTranslators] = await Promise.all([
    getAppSettings(),
    getRenderableAdPlacements({
      pageType: AdPageType.TRANSLATOR,
      deviceType: AdDeviceType.DESKTOP,
      categorySlug: translator.primaryCategory?.slug,
    }),
    getRelatedPublicTranslators({
      currentTranslatorId: translator.id,
      categorySlug: translator.primaryCategory?.slug,
      limit: 12,
    }),
  ]);
  const baseUrl = getAppBaseUrl();
  const shareUrl = new URL(`/translators/${translator.slug}`, baseUrl).toString();
  const pinImageUrl = new URL(`/translators/${translator.slug}/pin-image`, baseUrl).toString();

  return (
    <div className="relative overflow-x-hidden">
      <Navbar logoUrl={settings.logoUrl} logoDesktopHeight={settings.logoDesktopHeight} logoMobileHeight={settings.logoMobileHeight} />
      <main className="pb-10">
        <section className="relative mx-auto w-full max-w-7xl overflow-hidden px-4 pb-7 pt-7 sm:px-6 sm:pt-12 lg:px-8">
          <div className="twist-ribbon -right-28 top-8 hidden lg:block" />
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Translators", href: "/translators" },
              { label: translator.name },
            ]}
          />
          <p className="section-kicker mt-5">Ready for a fresh voice?</p>
          <h1 className="font-display mt-2 max-w-4xl text-balance text-[clamp(2.45rem,8vw,4.8rem)] font-bold leading-[0.98] tracking-[-0.04em] text-ink">
            {translator.title}
          </h1>
          <p className="mt-4 max-w-2xl text-balance text-base leading-7 text-muted-ink sm:text-lg">
            {translator.subtitle}
          </p>
        </section>

        {ads.length ? (
          <section className="mx-auto mb-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={ads[0]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}

        <TranslatorCard translator={translator} shareUrl={shareUrl} pinImageUrl={pinImageUrl} />

        <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="border-y border-dashed border-border py-7 sm:py-9">
            <p className="section-kicker">Behind the twist</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-ink">About this translator</h2>
            <p className="mt-3 text-base leading-7 text-muted-ink">{translator.shortDescription}</p>
            <p className="mt-2 text-sm leading-7 text-muted-ink">
              This translator helps convert {translator.sourceLabel.toLowerCase()} into{" "}
              {translator.targetLabel.toLowerCase()} while preserving your core intent.
            </p>
          </div>
        </section>

        <TranslatorComments translatorId={translator.id} translatorSlug={translator.slug} />

        {relatedTranslators.length ? (
          <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="border-y border-border py-7 sm:py-9">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-3xl font-bold text-ink">More twists to try</h2>
                <Link
                  href="/translators"
                  className="text-sm font-medium text-brand-700 transition hover:text-brand-800"
                >
                  Browse all translators
                </Link>
              </div>

              <RelatedTranslators translators={relatedTranslators} />
            </div>
          </section>
        ) : null}

        {ads.length > 1 ? (
          <section className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={ads[1]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}
      </main>
      <Footer platformName={settings.platformName} />
    </div>
  );
}
