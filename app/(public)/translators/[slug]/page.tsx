import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdDeviceType, AdPageType } from "@prisma/client";
import { Sparkles } from "lucide-react";
import { cache } from "react";

import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { TranslatorCard } from "@/components/translator/translator-card";
import { AdSlot } from "@/components/shared/ad-slot";
import { TranslatorComments } from "@/components/public/translator-comments";
import { getRenderableAdPlacements } from "@/lib/data/ads";
import { getPublicTranslatorBySlug, getRelatedPublicTranslators } from "@/lib/data/translators";
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
      limit: 3,
    }),
  ]);
  const baseUrl = getAppBaseUrl();
  const shareUrl = new URL(`/translators/${translator.slug}`, baseUrl).toString();
  const pinImageUrl =
    getShareImageAbsoluteUrl(translator.shareImagePath) ||
    new URL(`/translators/${translator.slug}/pin-image`, baseUrl).toString();

  return (
    <div className="relative overflow-x-hidden">
      <Navbar platformName={settings.platformName} />
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

        <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="font-display text-2xl font-semibold text-ink">About This Translator</h2>
            <p className="mt-3 text-base leading-7 text-muted-ink">{translator.shortDescription}</p>
            <p className="mt-2 text-sm leading-7 text-muted-ink">
              This translator helps convert {translator.sourceLabel.toLowerCase()} into{" "}
              {translator.targetLabel.toLowerCase()} while preserving your core intent.
            </p>
          </div>
        </section>

        {relatedTranslators.length ? (
          <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl font-semibold text-ink">Related Translators</h2>
                <Link
                  href="/translators"
                  className="text-sm font-medium text-brand-700 transition hover:text-brand-800"
                >
                  Browse all translators
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {relatedTranslators.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-border bg-muted-surface p-4 transition hover:border-brand-300 hover:bg-surface"
                  >
                    <h3 className="text-lg font-semibold text-ink">{item.name}</h3>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-ink">{item.shortDescription}</p>
                    {item.primaryCategory ? (
                      <p className="mt-2 text-xs font-medium text-brand-700">{item.primaryCategory.name}</p>
                    ) : null}
                    <Link
                      href={`/translators/${item.slug}`}
                      className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-brand-300 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                    >
                      <Sparkles className="h-4 w-4" />
                      Try this translator
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <TranslatorComments translatorId={translator.id} translatorSlug={translator.slug} />

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
