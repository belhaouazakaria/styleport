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
import { TranslatorFaq } from "@/components/public/translator-faq";
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
      limit: 15,
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
            <p className="section-kicker">The quick take</p>
            <h2 className="font-display mt-1 max-w-3xl text-3xl font-bold tracking-tight text-ink">What this twist does</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-ink">{translator.editorial.whatItDoes || `Turn ${translator.sourceLabel.toLowerCase()} into ${translator.targetLabel.toLowerCase()} while keeping your meaning intact.`}</p>
          </div>
        </section>

        {translator.editorial.examples.length ? (
          <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-[1.6rem] border border-brand-200 bg-brand-50 p-5 sm:p-7">
              <p className="section-kicker">See the twist in action</p>
              <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-ink">Before → after</h2>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {translator.editorial.examples.map((example, index) => (
                  <article key={`${example.sortOrder}-${example.originalText}`} className="relative overflow-hidden rounded-[1.2rem] border border-brand-200 bg-white p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-800">{example.contextTitle || `Example ${index + 1}`}</p><span aria-hidden="true" className="text-lg text-accent-500">↗</span></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[0.86fr_auto_1.14fr] sm:items-center">
                      <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-ink">Original</p><p className="mt-1 break-words text-sm leading-6 text-muted-ink">{example.originalText}</p></div>
                      <span aria-hidden="true" className="hidden text-xl font-bold text-accent-500 sm:block">→</span>
                      <div className="border-l-2 border-accent-300 pl-3 sm:border-l-0 sm:pl-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent-700">Twisted result</p><p className="mt-1 break-words text-sm font-medium leading-6 text-ink">{example.transformedText}</p></div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {translator.editorial.about || translator.shortDescription ? (
          <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <article className="max-w-3xl border-l-4 border-accent-400 py-1 pl-5 sm:pl-7">
              <p className="section-kicker">Behind the twist</p>
              <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-ink">About this translator</h2>
              <p className="mt-3 whitespace-pre-line text-base leading-7 text-muted-ink">{translator.editorial.about || translator.shortDescription}</p>
            </article>
          </section>
        ) : null}

        {translator.editorial.bestUses.length || translator.editorial.howToUse.length ? (
          <section className="mx-auto mt-10 grid w-full max-w-7xl gap-8 border-y border-dashed border-border px-4 py-8 sm:px-6 lg:grid-cols-2 lg:px-8">
            {translator.editorial.bestUses.length ? <div><p className="section-kicker">Good fit for</p><h2 className="font-display mt-1 text-2xl font-bold text-ink">Best uses</h2><div className="mt-4 flex flex-wrap gap-2">{translator.editorial.bestUses.map((item) => <span key={item.sortOrder} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">{item.content}</span>)}</div></div> : null}
            {translator.editorial.howToUse.length ? <div><p className="section-kicker">A simple starting point</p><h2 className="font-display mt-1 text-2xl font-bold text-ink">How to use it</h2><ol className="mt-4 space-y-3">{translator.editorial.howToUse.map((item, index) => <li key={item.sortOrder} className="flex gap-3 text-sm leading-6 text-muted-ink"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{index + 1}</span><span>{item.content}</span></li>)}</ol></div> : null}
          </section>
        ) : null}

        {translator.editorial.tips.length || translator.editorial.differenceDescription ? (
          <section className="mx-auto mt-10 grid w-full max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
            {translator.editorial.tips.length ? <div className="rounded-[1.4rem] bg-[#fff0c7] p-5 sm:p-6"><p className="section-kicker">Tiny moves, better results</p><h2 className="font-display mt-1 text-2xl font-bold text-ink">Tips for better results</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-ink/75">{translator.editorial.tips.map((item) => <li key={item.sortOrder} className="flex gap-2"><span className="text-accent-600">✦</span><span>{item.content}</span></li>)}</ul></div> : null}
            {translator.editorial.differenceDescription ? <div className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><p className="section-kicker">The SayTwist angle</p><h2 className="font-display mt-1 text-2xl font-bold text-ink">What makes this twist different</h2><p className="mt-3 text-sm leading-7 text-muted-ink">{translator.editorial.differenceDescription}</p></div> : null}
          </section>
        ) : null}

        {translator.editorial.faq.length ? <section className="mx-auto mt-10 w-full max-w-4xl px-4 sm:px-6 lg:px-8"><p className="section-kicker">Questions, answered</p><h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-ink">FAQ</h2><div className="mt-4"><TranslatorFaq faq={translator.editorial.faq} /></div></section> : null}

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
